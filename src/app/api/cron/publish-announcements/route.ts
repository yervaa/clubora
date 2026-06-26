import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { publishDueScheduledAnnouncements } from "@/lib/announcements/publish-scheduled";

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

/**
 * Vercel Cron (see vercel.json) or any scheduler hitting this route with CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { published } = await publishDueScheduledAnnouncements();
    return NextResponse.json({ ok: true, published });
  } catch (e) {
    console.error("[cron:publish-announcements]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
