"use client";

import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      onClick={toggle}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Dark mode" : "Light mode"}
      style={{
        width: 34,
        height: 34,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-dim)",
        cursor: "pointer",
        transition: "border-color var(--duration-fast), color var(--duration-fast)",
      }}
    >
      {isLight ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
