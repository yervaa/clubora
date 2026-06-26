/** Accent palette for club cards and feed dots (deterministic by club name). */
export const CLUB_ACCENT_COLORS = ["#B5D4F4", "#AFA9EC", "#9FE1CB", "#FAC775", "#F0997B"] as const;

export type ClubAccentColor = (typeof CLUB_ACCENT_COLORS)[number];

export type ClubCoverIconKind = "award" | "camera" | "trending" | "users" | "star";

/**
 * Simple string hash for picking a stable accent color from the club name.
 */
export function hashClubName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getClubAccentColor(name: string): ClubAccentColor {
  return CLUB_ACCENT_COLORS[hashClubName(name) % CLUB_ACCENT_COLORS.length];
}

/** Two-letter initials for club avatar dots (not member privacy rules). */
export function getClubInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  const compact = name.replace(/[^a-zA-Z0-9]/g, "");
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  if (compact.length === 1) return `${compact}X`.toUpperCase();
  return "CL";
}

export function inferClubCoverIcon(name: string): ClubCoverIconKind {
  const n = name.toLowerCase();
  if (/\b(nhs|honor|honour|society)\b/.test(n) || n.includes("honor")) return "award";
  if (/\b(photo|photography|camera|film|media)\b/.test(n)) return "camera";
  if (/\b(business|fbla|deca|economics|finance|entrepreneur|marketing)\b/.test(n)) return "trending";
  if (/\b(star|award)\b/.test(n)) return "star";
  return "users";
}

export function clubAccentTextColor(hex: string): string {
  if (hex === "#FAC775" || hex === "#9FE1CB" || hex === "#B5D4F4") return "#1e293b";
  return "#ffffff";
}

/** Darkest readable stop on each accent ramp (cover icons, role badge text). */
const CLUB_ACCENT_ICON_COLORS: Record<ClubAccentColor, string> = {
  "#B5D4F4": "#1e40af",
  "#AFA9EC": "#4c1d95",
  "#9FE1CB": "#065f46",
  "#FAC775": "#92400e",
  "#F0997B": "#9a3412",
};

export function getClubAccentIconColor(accent: ClubAccentColor): string {
  return CLUB_ACCENT_ICON_COLORS[accent];
}

/**
 * Soft diagonal gradient for club cover banners, derived from the deterministic
 * accent so it can't drift from the rest of a club's theming. Stays clearly
 * pastel (only ~20% toward slate) so the dark cover icon keeps strong contrast
 * across the whole band. `color-mix` degrades to the base accent if unsupported.
 */
export function getClubCoverGradient(accent: ClubAccentColor): string {
  return `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 80%, #0f172a) 100%)`;
}

export function getClubRoleBadgeColors(accent: ClubAccentColor): {
  backgroundColor: string;
  color: string;
} {
  return {
    backgroundColor: `color-mix(in srgb, ${accent} 38%, #0f172a)`,
    color: getClubAccentIconColor(accent),
  };
}

/** Dark text for pastel club cover bands (no dynamic contrast). */
export const CLUB_COVER_TEXT_COLOR = "#1a1a2e";

export function buildClubColorMap(clubs: Array<{ id: string; name: string }>): Map<string, ClubAccentColor> {
  const map = new Map<string, ClubAccentColor>();
  for (const club of clubs) {
    map.set(club.id, getClubAccentColor(club.name));
  }
  return map;
}
