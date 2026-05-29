"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "cogni:theme";

function currentDomTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/**
 * Reads the theme already applied to <html> by the no-flash inline script and
 * lets the user toggle it. Persists the choice to localStorage and updates the
 * data-theme attribute, which drives all CSS tokens.
 */
export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Sync from the DOM after mount (server render is always the default).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(currentDomTheme());
  }, []);

  const apply = useCallback((next: Theme) => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next);
    }
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore private-mode / quota errors
    }
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    apply(currentDomTheme() === "light" ? "dark" : "light");
  }, [apply]);

  return { theme, toggle, setTheme: apply };
}
