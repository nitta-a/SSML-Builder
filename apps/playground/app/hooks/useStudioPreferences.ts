import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../studio";
import { isStudioLocale } from "../studioCopy";
import type { StudioLocale } from "../studioCopy";

export type StudioTheme = "light" | "dark";
const THEME_STORAGE_KEY = "ssml-builder-playground-theme";
const LOCALE_STORAGE_KEY = "ssml-builder-studio-locale";

export function useStudioPreferences() {
  const [locale, setLocaleState] = useState<StudioLocale>("ja");
  const [theme, setTheme] = useState<StudioTheme | null>(null);
  const [error, setError] = useState<string | null>(null);
  const manualTheme = useRef(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    try {
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isStudioLocale(storedLocale)) setLocaleState(storedLocale);
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme === "light" || storedTheme === "dark") {
        manualTheme.current = true;
        setTheme(storedTheme);
      } else {
        setTheme(mediaQuery.matches ? "dark" : "light");
      }
    } catch (error) {
      setError(getErrorMessage(error));
      setTheme(mediaQuery.matches ? "dark" : "light");
    }
    const followSystem = (event: MediaQueryListEvent): void => {
      if (!manualTheme.current) setTheme(event.matches ? "dark" : "light");
    };
    mediaQuery.addEventListener("change", followSystem);
    return () => mediaQuery.removeEventListener("change", followSystem);
  }, []);

  useEffect(() => {
    globalThis.document.documentElement.lang = locale;
    if (theme) globalThis.document.documentElement.dataset.theme = theme;
  }, [locale, theme]);

  const setLocale = useCallback((locale: StudioLocale): void => {
    setLocaleState(locale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      setError(null);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }, []);

  const toggleTheme = (): void => {
    if (!theme) return;
    const nextTheme = theme === "dark" ? "light" : "dark";
    manualTheme.current = true;
    setTheme(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      setError(null);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  return { locale, theme, error, setLocale, toggleTheme };
}
