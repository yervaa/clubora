import "server-only";

import { createHash } from "crypto";
import { headers } from "next/headers";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type PolicyName =
  | "login"
  | "signup"
  | "passwordChange"
  | "clubCreate"
  | "clubJoin"
  | "announcementCreate"
  | "eventCreate"
  | "rsvpWrite"
  | "memberImport"
  | "bulkMemberWrite"
  | "clubDataExport"
  | "joinRequestReview"
  | "taskWrite"
  | "duesCheckout"
  | "search";

type PolicyConfig = {
  limit: number;
  duration: `${number} ${"s" | "m" | "h" | "d"}`;
  windowMs: number;
};

type LimitResult = {
  success: boolean;
  reset: number;
  remaining: number;
  limit: number;
};

type EnforceRateLimitOptions = {
  policy: PolicyName;
  userId?: string;
  hint?: string;
};

type LocalBucket = {
  count: number;
  reset: number;
};

const RATE_LIMIT_POLICIES: Record<PolicyName, PolicyConfig> = {
  login: { limit: 5, duration: "10 m", windowMs: 10 * 60 * 1000 },
  signup: { limit: 4, duration: "30 m", windowMs: 30 * 60 * 1000 },
  /** Current-password verification on password change — per user. Brute-force guard. */
  passwordChange: { limit: 5, duration: "15 m", windowMs: 15 * 60 * 1000 },
  clubCreate: { limit: 6, duration: "1 h", windowMs: 60 * 60 * 1000 },
  clubJoin: { limit: 12, duration: "10 m", windowMs: 10 * 60 * 1000 },
  announcementCreate: { limit: 20, duration: "10 m", windowMs: 10 * 60 * 1000 },
  eventCreate: { limit: 12, duration: "15 m", windowMs: 15 * 60 * 1000 },
  rsvpWrite: { limit: 40, duration: "5 m", windowMs: 5 * 60 * 1000 },
  memberImport: { limit: 24, duration: "1 h", windowMs: 60 * 60 * 1000 },
  /** Tag/committee/team bulk ops, alumni/removal batches — per user per club. */
  bulkMemberWrite: { limit: 48, duration: "1 h", windowMs: 60 * 60 * 1000 },
  /** Roster CSV + calendar ICS downloads — per user per club. */
  clubDataExport: { limit: 24, duration: "1 h", windowMs: 60 * 60 * 1000 },
  /** Approve/deny join requests — per reviewer per club. */
  joinRequestReview: { limit: 120, duration: "10 m", windowMs: 10 * 60 * 1000 },
  /** Task create/update/status/delete — per user per club. */
  taskWrite: { limit: 72, duration: "15 m", windowMs: 15 * 60 * 1000 },
  /** Stripe Checkout session creation for club dues — per user per club. */
  duesCheckout: { limit: 15, duration: "15 m", windowMs: 15 * 60 * 1000 },
  /** Global search — per user. Each call fans out to several ILIKE queries. */
  search: { limit: 30, duration: "1 m", windowMs: 60 * 1000 },
};

const localStore = globalThis.__cluboraRateLimitStore ?? new Map<string, LocalBucket>();
if (!globalThis.__cluboraRateLimitStore) {
  globalThis.__cluboraRateLimitStore = localStore;
}

let redisClient: Redis | null = null;
const ratelimiters = new Map<PolicyName, Ratelimit>();
let hasWarnedAboutLocalFallback = false;

function getRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis({ url, token });
  }

  return redisClient;
}

function getRatelimiter(policy: PolicyName) {
  if (ratelimiters.has(policy)) {
    return ratelimiters.get(policy)!;
  }

  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  const config = RATE_LIMIT_POLICIES[policy];
  const ratelimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, config.duration),
    prefix: `clubora:${policy}`,
    analytics: false,
  });

  ratelimiters.set(policy, ratelimiter);
  return ratelimiter;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getClientIp(headerStore: Awaited<ReturnType<typeof headers>>) {
  const forwardedFor = headerStore.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return (
    headerStore.get("x-real-ip") ??
    headerStore.get("cf-connecting-ip") ??
    headerStore.get("x-vercel-forwarded-for") ??
    null
  );
}

async function getIdentity({ userId, hint }: Pick<EnforceRateLimitOptions, "userId" | "hint">) {
  if (userId) {
    // Scope by club (or other hint) when provided — e.g. import/bulk/export per club, not global per user.
    const suffix = hint ? `:${hint}` : "";
    return hashValue(`user:${userId}${suffix}`);
  }

  const headerStore = await headers();
  const ip = getClientIp(headerStore) ?? "unknown";
  const safeHint = hint ? `:${hint}` : "";

  return hashValue(`ip:${ip}${safeHint}`);
}

function localLimit(policy: PolicyName, identifier: string): LimitResult {
  const config = RATE_LIMIT_POLICIES[policy];
  const key = `${policy}:${identifier}`;
  const now = Date.now();

  const existing = localStore.get(key);
  const bucket =
    existing && existing.reset > now ? existing : { count: 0, reset: now + config.windowMs };

  bucket.count += 1;
  localStore.set(key, bucket);

  return {
    success: bucket.count <= config.limit,
    reset: bucket.reset,
    limit: config.limit,
    remaining: Math.max(0, config.limit - bucket.count),
  };
}

export async function enforceRateLimit(options: EnforceRateLimitOptions): Promise<LimitResult> {
  const identifier = await getIdentity(options);
  const ratelimiter = getRatelimiter(options.policy);

  if (!ratelimiter) {
    const shouldWarn =
      !hasWarnedAboutLocalFallback &&
      (process.env.NODE_ENV === "production" ||
        process.env.VERCEL_ENV === "production" ||
        process.env.VERCEL_ENV === "preview");
    if (shouldWarn) {
      hasWarnedAboutLocalFallback = true;
      console.warn(
        "[clubora] Rate limiting uses in-memory fallback (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing). Not reliable across serverless instances — configure Upstash on the host.",
      );
    }

    return localLimit(options.policy, identifier);
  }

  try {
    const result = await ratelimiter.limit(identifier);
    return {
      success: result.success,
      reset: result.reset,
      remaining: result.remaining,
      limit: result.limit,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[clubora] Upstash ratelimit failed for policy "${options.policy}": ${msg}`);
    return localLimit(options.policy, identifier);
  }
}

export function getRateLimitErrorMessage() {
  return "Too many attempts. Please try again later.";
}

declare global {
  var __cluboraRateLimitStore: Map<string, LocalBucket> | undefined;
}
