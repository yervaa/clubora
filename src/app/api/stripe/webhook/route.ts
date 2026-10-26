import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createBulkNotifications, createNotification } from "@/lib/notifications/create-notification";
import { listPermissionHolderIds } from "@/lib/clubs/dues-permissions";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Demo site runs Stripe in test mode only; ignore any live-mode event outright.
  if (event.livemode) {
    console.error("[stripe webhook] rejected live-mode event", event.id);
    return NextResponse.json({ error: "Live mode not accepted" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    try {
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
    } catch (err) {
      // Safety net: never bubble an error to a 500 for an event we may have
      // already recorded — Stripe would retry an already-processed payment.
      // All downstream steps are idempotent, so 200 is safe here.
      console.error("[stripe webhook] handler error", err);
    }
  }

  return NextResponse.json({ received: true });
}

type DuesPaymentRow = {
  id: string;
  status: string;
  user_id: string;
  club_id: string;
  dues_id: string;
  amount_cents: number;
  currency: string | null;
};

const DUES_PAYMENT_COLUMNS = "id, status, user_id, club_id, dues_id, amount_cents, currency";

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== "payment") {
    return;
  }

  const sessionId = session.id;
  const amountTotal = session.amount_total;
  const paymentIntentRaw = session.payment_intent;
  const paymentIntentId =
    typeof paymentIntentRaw === "string" ? paymentIntentRaw : paymentIntentRaw && "id" in paymentIntentRaw
      ? paymentIntentRaw.id
      : null;

  const admin = createAdminClient();

  // Reconcile primarily by the dues_payments row id carried in metadata /
  // client_reference_id; fall back to the (fragile) session id only if needed.
  const metaPaymentId = session.metadata?.payment_id || null;
  const clientRef = session.client_reference_id || null;
  const lookupId = metaPaymentId || clientRef;

  let row: DuesPaymentRow | null = null;

  if (lookupId) {
    const { data, error } = await admin
      .from("dues_payments")
      .select(DUES_PAYMENT_COLUMNS)
      .eq("id", lookupId)
      .maybeSingle();
    if (error) {
      console.warn("[stripe webhook] lookup by payment id failed", lookupId, error.message);
    } else {
      row = data as DuesPaymentRow | null;
    }
  }

  if (!row) {
    const { data, error } = await admin
      .from("dues_payments")
      .select(DUES_PAYMENT_COLUMNS)
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    if (error) {
      console.warn("[stripe webhook] lookup by session id failed", sessionId, error.message);
    } else {
      row = data as DuesPaymentRow | null;
    }
  }

  if (!row) {
    console.warn("[stripe webhook] no dues_payments row for session", sessionId);
    return;
  }

  const matchedRow = row;

  if (matchedRow.status === "paid") {
    return;
  }

  const metaDuesId = session.metadata?.dues_id;
  if (metaDuesId && metaDuesId !== matchedRow.dues_id) {
    console.error("[stripe webhook] dues_id metadata mismatch", sessionId);
    return;
  }

  const metaUser = session.metadata?.user_id;
  if (metaUser && metaUser !== matchedRow.user_id) {
    console.error("[stripe webhook] user_id metadata mismatch", sessionId);
    return;
  }

  // Currency must match the expected dues row currency.
  const sessionCurrency = session.currency?.toLowerCase();
  const expectedCurrency = (matchedRow.currency ?? "usd").toLowerCase();
  if (sessionCurrency && sessionCurrency !== expectedCurrency) {
    console.error("[stripe webhook] currency mismatch", sessionId, sessionCurrency, expectedCurrency);
    return;
  }

  // Amount must be present AND equal the expected amount; a null/absent total
  // for a completed payment session is treated as a hard mismatch.
  if (amountTotal == null || amountTotal !== matchedRow.amount_cents) {
    console.error("[stripe webhook] amount mismatch", sessionId, amountTotal, matchedRow.amount_cents);
    return;
  }

  const paidAt = new Date().toISOString();
  const { data: updated, error: upErr } = await admin
    .from("dues_payments")
    .update({
      status: "paid",
      paid_at: paidAt,
      stripe_payment_intent_id: paymentIntentId,
      stripe_checkout_session_id: sessionId,
    })
    .eq("id", matchedRow.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (upErr) {
    console.error("[stripe webhook] update failed", upErr.message);
    return;
  }

  if (!updated) {
    const { data: already } = await admin
      .from("dues_payments")
      .select("id")
      .eq("id", matchedRow.id)
      .eq("status", "paid")
      .maybeSingle();
    if (already) {
      return;
    }
    console.warn("[stripe webhook] no row updated and not already paid", matchedRow.id);
    return;
  }

  // Payment is now recorded. Notifications are best-effort: a failure here must
  // NOT throw out of the handler or turn the response into a non-200, otherwise
  // Stripe would retry a payment that is already marked paid.
  try {
    await createNotification({
      userId: matchedRow.user_id,
      clubId: matchedRow.club_id,
      type: "dues.paid",
      title: "Payment received",
      body: "Your club dues payment was processed successfully.",
      href: `/clubs/${matchedRow.club_id}/dues`,
      metadata: { dues_id: matchedRow.dues_id, payment_id: matchedRow.id },
    });

    const treasurerIds = await listPermissionHolderIds(matchedRow.club_id, "dues.manage");
    const recipients = treasurerIds.filter((id) => id !== matchedRow.user_id);
    if (recipients.length > 0) {
      const { data: profile } = await admin.from("profiles").select("full_name").eq("id", matchedRow.user_id).maybeSingle();
      const name = profile?.full_name?.trim() || "A member";
      await createBulkNotifications(
        recipients.map((userId) => ({
          userId,
          clubId: matchedRow.club_id,
          type: "dues.received" as const,
          title: "Dues payment received",
          body: `${name} completed a dues payment.`,
          href: `/clubs/${matchedRow.club_id}/dues`,
          metadata: { dues_id: matchedRow.dues_id },
        })),
      );
    }
  } catch (err) {
    console.error("[stripe webhook] notification dispatch failed (payment recorded)", err);
  }

  revalidatePath(`/clubs/${matchedRow.club_id}/dues`);
  revalidatePath(`/clubs/${matchedRow.club_id}`);
}
