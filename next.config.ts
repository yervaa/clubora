import type { NextConfig } from "next";

function getSupabaseOrigin() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/^['"]|['"]$/g, "");

  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function buildCspValue() {
  const supabaseOrigin = getSupabaseOrigin();
  // connect-src must cover Supabase (REST + realtime websocket) and Stripe so
  // dues checkout JS can talk to the Stripe API. `https:`/`wss:` already cover
  // these broadly; the explicit origins are kept for clarity and in case the
  // broad schemes are tightened later.
  const connectSources = [
    "'self'",
    "https:",
    "wss:",
    "https://api.stripe.com",
    ...(supabaseOrigin ? [supabaseOrigin] : []),
  ];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSources.join(" ")}`,
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
}

const securityHeaders = [
  {
    // ENFORCED CSP. NOTE: this policy still allows 'unsafe-inline' in script-src
    // (nonce-based tightening is a separate future task). Before relying on this
    // in production, validate it end-to-end in a Vercel preview deployment — click
    // through dues checkout (Stripe redirect), announcements with attachments
    // (signed Supabase URLs), and every interactive flow — and watch the browser
    // console for CSP violations. If something breaks, widen the relevant
    // directive (or temporarily revert to Content-Security-Policy-Report-Only).
    key: "Content-Security-Policy",
    value: buildCspValue(),
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
