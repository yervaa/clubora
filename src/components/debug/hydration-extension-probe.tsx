"use client";

import { useEffect } from "react";

type HydrationExtensionProbeProps = {
  /** Where this probe is mounted (for log correlation). */
  location: string;
  runId?: string;
};

/** Debug-only: logs extension-injected DOM attrs that commonly cause hydration mismatches. */
export function HydrationExtensionProbe({ location, runId = "pre-fix" }: HydrationExtensionProbeProps) {
  useEffect(() => {
    const fdNodes = document.querySelectorAll("[fdprocessedid]");
    const htmlAttrNames = [...document.documentElement.attributes].map((a) => a.name);
    const extensionHtmlAttrs = htmlAttrNames.filter(
      (name) => name.startsWith("data-") || name === "fdprocessedid" || name.includes("qb"),
    );
    const sampleFd = [...fdNodes].slice(0, 5).map((el) => ({
      tag: el.tagName.toLowerCase(),
      id: (el as HTMLElement).id || null,
      name: (el as HTMLInputElement).name || null,
      fdprocessedid: el.getAttribute("fdprocessedid"),
    }));

    // #region agent log
    fetch("http://127.0.0.1:7746/ingest/1084cd5d-3804-45a9-a570-14fc1ea819d7", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "381675" },
      body: JSON.stringify({
        sessionId: "381675",
        runId,
        hypothesisId: "H1",
        location: `hydration-extension-probe.tsx:${location}`,
        message: "extension DOM attrs after mount",
        data: { fdprocessedidCount: fdNodes.length, sampleFd, extensionHtmlAttrs },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [location, runId]);

  return null;
}
