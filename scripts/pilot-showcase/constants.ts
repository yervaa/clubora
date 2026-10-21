export const PILOT_SHOWCASE_ENV_FLAG = "ALLOW_PILOT_SHOWCASE";
export const PILOT_SHOWCASE_REMOTE_OK_FLAG = "PILOT_SHOWCASE_TARGET_OK";

/**
 * Built-in defaults for **throwaway / pilot** databases only (see script safety gates).
 * They are not deployment secrets, but anyone who knows them can sign in after a seed —
 * set `PILOT_SHOWCASE_*` env vars for real pilots or change these before wider use.
 */
export const DEFAULT_PILOT_EMAIL = "showcase.pilot@clubora.local";
export const DEFAULT_PILOT_PASSWORD = "ShowcaseClubora!2026";

/** Second primary tester — President / Member / Officer across the same three clubs (see run.ts). */
export const DEFAULT_PILOT2_EMAIL = "showcase.pilot2@clubora.local";
export const DEFAULT_PILOT2_PASSWORD = "ShowcaseClubora!2026";

export const ROSTER_PASSWORD_ENV_FLAG = "PILOT_SHOWCASE_ROSTER_PASSWORD";
export const DEFAULT_ROSTER_PASSWORD = "ShowcaseClubora!2026";
