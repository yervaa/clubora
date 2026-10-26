"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertClubActiveForMutations } from "@/lib/clubs/club-status";
import { canManageClubStripeDues, listPermissionHolderIds } from "@/lib/clubs/dues-permissions";
import { getPublicSiteOrigin } from "@/lib/app/site-origin";
import { enforceRateLimit, getRateLimitErrorMessage } from "@/lib/rate-limit";
import { createBulkNotifications, createNotification } from "@/lib/notifications/create-notification";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  stripeDuesCancelSchema,
  stripeDuesCheckoutSchema,
  stripeDuesCreateSchema,
} from "@/lib/validation/clubs";

function duesUrl(clubId: string, params?: Record<string, string>) {
  const base = `/clubs/${clubId}/dues`;
  if (!params) return base;
  return `${base}?${new URLSearchParams(params).toString()}`;
}

function firstIssue(result: { error: { issues: Array<{ message: string }> } }) {
  return result.error.issues[0]?.message ?? "Invalid request.";
}

export async function createStripeDuesAction(formData: FormData) {
  const parsed = stripeDuesCreateSchema.safeParse({
    clubId: formData.get("club_id"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    dueDate: formData.get("due_date") ?? "",
    amount: formData.get("amount"),
    currency: formData.get("currency") ?? "USD",
  });

  if (!parsed.success) {
    const clubId = String(formData.get("club_id") ?? "");
    redirect(duesUrl(clubId, { error: encodeURIComponent(firstIssue(parsed)) }));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(duesUrl(parsed.data.clubId, { error: encodeURIComponent(active.message) }));
  }

  const canManage = await canManageClubStripeDues(user.id, parsed.data.clubId);

  if (!canManage) {
    redirect(duesUrl(parsed.data.clubId, { error: encodeURIComponent("You do not have permission to create dues.") }));
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("dues")
    .insert({
      club_id: parsed.data.clubId,
      title: parsed.data.title,
      description: parsed.data.description,
      amount_cents: parsed.data.amountCents,
      currency: parsed.data.currency,
      due_date: parsed.data.dueDate,
      created_by: user.id,
    })
    .select("id, title")
    .maybeSingle();

  if (insertErr || !inserted?.id) {
    const msg =
      insertErr?.code === "PGRST205" || insertErr?.message?.includes("public.dues")
        ? "Club dues tables are missing. Apply the latest Supabase migration (053_stripe_club_dues.sql) to this project, then retry."
        : "Could not create dues. Please retry.";
    redirect(duesUrl(parsed.data.clubId, { error: encodeURIComponent(msg) }));
  }

  const admin = createAdminClient();
  const { data: activeMembers } = await admin
    .from("club_members")
    .select("user_id")
    .eq("club_id", parsed.data.clubId)
    .eq("membership_status", "active");

  const recipients = (activeMembers ?? [])
    .map((m) => m.user_id)
    .filter((id) => id && id !== user.id);

  if (recipients.length > 0) {
    await createBulkNotifications(
      recipients.map((userId) => ({
        userId,
        clubId: parsed.data.clubId,
        type: "dues.created" as const,
        title: "New club dues",
        body: `${inserted.title} — open Dues to pay online.`,
        href: `/clubs/${parsed.data.clubId}/dues`,
        metadata: { dues_id: inserted.id },
      })),
    );
  }

  revalidatePath(`/clubs/${parsed.data.clubId}/dues`);
  revalidatePath(`/clubs/${parsed.data.clubId}`);
  redirect(duesUrl(parsed.data.clubId, { success: encodeURIComponent("Dues created and members were notified.") }));
}

export async function cancelStripeDuesAction(formData: FormData) {
  const parsed = stripeDuesCancelSchema.safeParse({
    clubId: formData.get("club_id"),
    duesId: formData.get("dues_id"),
  });

  if (!parsed.success) {
    const clubId = String(formData.get("club_id") ?? "");
    redirect(duesUrl(clubId, { error: encodeURIComponent(firstIssue(parsed)) }));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const active = await assertClubActiveForMutations(parsed.data.clubId);
  if (!active.ok) {
    redirect(duesUrl(parsed.data.clubId, { error: encodeURIComponent(active.message) }));
  }

  if (!(await canManageClubStripeDues(user.id, parsed.data.clubId))) {
    redirect(duesUrl(parsed.data.clubId, { error: encodeURIComponent("You do not have permission to cancel dues.") }));
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("dues")
    .update({ canceled_at: nowIso })
    .eq("id", parsed.data.duesId)
    .eq("club_id", parsed.data.clubId)
    .is("canceled_at", null);

  if (error) {
    redirect(duesUrl(parsed.data.clubId, { error: encodeURIComponent("Could not cancel dues. Please retry.") }));
  }

  revalidatePath(`/clubs/${parsed.data.clubId}/dues`);
  redirect(duesUrl(parsed.data.clubId, { success: encodeURIComponent("Dues canceled — no new payments.") }));
}

export async function startDuesCheckoutAction(formData: FormData) {
  const parsed = stripeDuesCheckoutSchema.safeParse({
    clubId: formData.get("club_id"),
    duesId: formData.get("dues_id"),
  });

  if (!parsed.success) {
    const clubId = String(formData.get("club_id") ?? "");
    redirect(duesUrl(clubId, { error: encodeURIComponent(firstIssue(parsed)) }));
  }

  const { clubId, duesId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const active = await assertClubActiveForMutations(clubId);
  if (!active.ok) {
    redirect(duesUrl(clubId, { error: encodeURIComponent(active.message) }));
  }

  const { data: membership } = await supabase
    .from("club_members")
    .select("user_id")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .eq("membership_status", "active")
    .maybeSingle();

  if (!membership) {
    redirect(duesUrl(clubId, { error: encodeURIComponent("You must be an active member to pay.") }));
  }

  const rate = await enforceRateLimit({ policy: "duesCheckout", userId: user.id, hint: clubId });
  if (!rate.success) {
    redirect(duesUrl(clubId, { error: encodeURIComponent(getRateLimitErrorMessage()) }));
  }

  const { data: duesRow, error: duesErr } = await supabase
    .from("dues")
    .select("id, club_id, title, amount_cents, currency, canceled_at")
    .eq("id", duesId)
    .maybeSingle();

  if (duesErr || !duesRow || duesRow.club_id !== clubId || duesRow.canceled_at) {
    redirect(duesUrl(clubId, { error: encodeURIComponent("This payment request is not available.") }));
  }

  const { data: existingPay, error: payFetchErr } = await supabase
    .from("dues_payments")
    .select("id, status, stripe_checkout_session_id")
    .eq("dues_id", duesId)
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (payFetchErr) {
    redirect(duesUrl(clubId, { error: encodeURIComponent("Could not start checkout. Please retry.") }));
  }

  if (existingPay?.status === "paid") {
    redirect(duesUrl(clubId, { success: encodeURIComponent("You have already paid this dues item.") }));
  }

  const origin = getPublicSiteOrigin();
  if (!origin) {
    redirect(
      duesUrl(clubId, {
        error: encodeURIComponent("Server misconfiguration: set NEXT_PUBLIC_SITE_URL (or deploy on Vercel with VERCEL_URL)."),
      }),
    );
  }

  if (!isStripeConfigured()) {
    redirect(duesUrl(clubId, { error: encodeURIComponent("Online payments are turned off on the demo site.") }));
  }

  const stripe = getStripe();
  const successUrl = `${origin}/clubs/${clubId}/dues?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/clubs/${clubId}/dues?canceled=1`;

  // F2: ensure only one live checkout session per payment row. Expire any prior
  // session before opening a new one so a member can't complete a stale session
  // (and be double-charged). May already be expired/completed — ignore errors.
  if (existingPay?.stripe_checkout_session_id) {
    try {
      await stripe.checkout.sessions.expire(existingPay.stripe_checkout_session_id);
    } catch (err) {
      console.warn("[dues checkout] could not expire prior session", err);
    }
  }

  let paymentId: string | undefined = existingPay?.id;

  if (!existingPay) {
    const { data: insertedPay, error: insErr } = await supabase
      .from("dues_payments")
      .insert({
        dues_id: duesId,
        club_id: clubId,
        user_id: user.id,
        amount_cents: duesRow.amount_cents,
        currency: duesRow.currency ?? "USD",
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (insErr || !insertedPay?.id) {
      redirect(duesUrl(clubId, { error: encodeURIComponent("Could not reserve payment. Please retry.") }));
    }
    paymentId = insertedPay.id;
  } else if (!paymentId) {
    redirect(duesUrl(clubId, { error: encodeURIComponent("Payment record is missing. Please retry.") }));
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: paymentId,
    metadata: {
      dues_id: duesId,
      club_id: clubId,
      user_id: user.id,
      payment_id: paymentId ?? "",
      amount_cents: String(duesRow.amount_cents),
      currency: (duesRow.currency ?? "USD").toLowerCase(),
    },
    payment_intent_data: {
      metadata: {
        dues_id: duesId,
        club_id: clubId,
        user_id: user.id,
        payment_id: paymentId ?? "",
      },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (duesRow.currency ?? "usd").toLowerCase(),
          unit_amount: duesRow.amount_cents,
          product_data: {
            name: duesRow.title.slice(0, 200),
          },
        },
      },
    ],
  });

  if (session.livemode) {
    redirect(duesUrl(clubId, { error: encodeURIComponent("Live Stripe payments are disabled on the demo site.") }));
  }

  if (!session.url) {
    redirect(duesUrl(clubId, { error: encodeURIComponent("Stripe did not return a checkout URL.") }));
  }

  // F1: persist the session id with the service-role client. dues_payments has
  // no UPDATE RLS policy, so a user-scoped update would silently no-op and the
  // webhook could never reconcile this payment by session id.
  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("dues_payments")
    .update({ stripe_checkout_session_id: session.id, status: "pending" })
    .eq("id", paymentId as string);

  if (updErr) {
    redirect(duesUrl(clubId, { error: encodeURIComponent("Could not link Stripe session. Please retry.") }));
  }

  redirect(session.url);
}
