import "server-only";

import Stripe from "stripe";

let stripe: Stripe | null = null;

/** Demo site: only Stripe test-mode keys are accepted. Live keys are refused outright. */
const TEST_KEY_PREFIXES = ["sk_test_", "rk_test_"];

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripe(): Stripe {
  if (stripe) return stripe;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  if (!TEST_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    throw new Error("Refusing to use a non-test Stripe key: this demo site runs Stripe in test mode only.");
  }
  stripe = new Stripe(key);
  return stripe;
}
