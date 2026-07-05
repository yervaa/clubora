"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CopyPublicClubPageButtonProps = {
  clubId: string;
  className?: string;
  children?: React.ReactNode;
};

export function CopyPublicClubPageButton({
  clubId,
  className = "",
  children = "Copy public page link",
}: CopyPublicClubPageButtonProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const publicPath = useMemo(() => `/club/${encodeURIComponent(clubId)}`, [clubId]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const scheduleReset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setCopied(false);
      setError(false);
      timeoutRef.current = null;
    }, 2200);
  }, []);

  const handleCopy = async () => {
    setError(false);
    const url = `${window.location.origin}${publicPath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
      setError(true);
    }
    scheduleReset();
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      disabled={copied}
      aria-live="polite"
    >
      {copied ? "Public link copied" : error ? "Could not copy — tap to try again" : children}
    </button>
  );
}
