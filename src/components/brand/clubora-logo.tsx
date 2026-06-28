type CluboraLogoVariant = "full" | "icon";
type CluboraLogoTheme = "dark" | "light";

const LOGO_SOURCES: Record<CluboraLogoVariant, Record<CluboraLogoTheme, string>> = {
  full: { dark: "/logo.svg", light: "/logo-light.svg" },
  icon: { dark: "/favicon.svg", light: "/favicon-light.svg" },
};

export type CluboraLogoProps = {
  /** Full wordmark or icon-only mark. */
  variant?: CluboraLogoVariant;
  /** `dark` = navy on light backgrounds; `light` = pale on dark backgrounds. */
  theme?: CluboraLogoTheme;
  height?: number;
  className?: string;
};

export function CluboraLogo({
  variant = "full",
  theme = "dark",
  height = 36,
  className,
}: CluboraLogoProps) {
  const src = LOGO_SOURCES[variant][theme];
  const isIconOnly = variant === "icon";

  if (isIconOnly) {
    return (
      <span
        className={["clubora-logo-icon inline-flex shrink-0 items-center justify-center", className]
          .filter(Boolean)
          .join(" ")}
        style={{ height, width: height }}
        aria-hidden
      >
        <img
          src={src}
          alt=""
          className="block h-[84%] w-[84%] object-contain"
          decoding="async"
        />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt="Clubora"
      className={["clubora-logo block w-auto max-w-full shrink-0 object-contain", className].filter(Boolean).join(" ")}
      style={{ height, width: "auto" }}
      decoding="async"
    />
  );
}
