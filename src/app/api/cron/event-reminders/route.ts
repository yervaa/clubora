import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { dispatchEventReminders } from "@/lib/announcements/event-reminders";

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  // Accept the secret ONLY via the Authorization: Bearer header (no query-string
  // fallback — query strings leak into logs/proxies). Compare in constant time.
  const auth = request.headers.get("authorization");
  if (!auth) {
    return false;
  }
  const provided = Buffer.from(auth);
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { notified } = await dispatchEventReminders();
    return NextResponse.json({ ok: true, notified });
  } catch (e) {
    console.error("[cron:event-reminders]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
