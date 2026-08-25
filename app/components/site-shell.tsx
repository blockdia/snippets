import { useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router";

import type { Messages } from "../i18n/messages";
import {
  SUPPORTED_LOCALES,
  toLocaleSegment,
  type Locale,
} from "../i18n/locales";

const localeLabels: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

const THEME_STORAGE_KEY = "scratch-snippets-theme";

function pathForLocale(pathname: string, locale: Locale): string {
  const segments = pathname.split("/");
  segments[1] = toLocaleSegment(locale);
  return segments.join("/") || `/${toLocaleSegment(locale)}`;
}

function ThemeToggle({ label }: { label: string }) {
  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

    function followSystemTheme(event: MediaQueryListEvent) {
      try {
        const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (storedTheme === "light" || storedTheme === "dark") return;
      } catch {
        // Continue following the system preference when storage is unavailable.
      }

      document.documentElement.dataset.theme = event.matches ? "dark" : "light";
    }

    colorScheme.addEventListener("change", followSystemTheme);
    return () => colorScheme.removeEventListener("change", followSystemTheme);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";

    root.dataset.theme = nextTheme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The selected theme still applies for this page when storage is blocked.
    }
  }

  return (
    <button
      aria-label={label}
      className="theme-toggle"
      onClick={toggleTheme}
      title={label}
      type="button"
    >
      <span aria-hidden="true" className="theme-icon theme-icon-sun">
        ☀
      </span>
      <span aria-hidden="true" className="theme-icon theme-icon-moon">
        ◐
      </span>
    </button>
  );
}

export function SiteHeader({
  locale,
  messages,
}: {
  locale: Locale;
  messages: Messages;
}) {
  const location = useLocation();
  const localeSegment = toLocaleSegment(locale);
  const localeSwitcherRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeLocaleSwitcher(event: MouseEvent) {
      const localeSwitcher = localeSwitcherRef.current;

      if (
        localeSwitcher?.open &&
        event.target instanceof Node &&
        !localeSwitcher.contains(event.target)
      ) {
        localeSwitcher.open = false;
      }
    }

    document.addEventListener("click", closeLocaleSwitcher);
    return () => document.removeEventListener("click", closeLocaleSwitcher);
  }, []);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" to={`/${localeSegment}`}>
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>{messages.brand}</span>
        </Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          <NavLink end to={`/${localeSegment}`}>
            {messages.navigation.home}
          </NavLink>
          <NavLink to={`/${localeSegment}/snippets`}>
            {messages.navigation.snippets}
          </NavLink>
          <NavLink to={`/${localeSegment}/search`}>
            {messages.navigation.search}
          </NavLink>
        </nav>

        <div className="header-actions">
          <ThemeToggle label={messages.navigation.theme} />
          <details className="locale-switcher" ref={localeSwitcherRef}>
            <summary aria-label={messages.navigation.language}>
              <span aria-hidden="true">◎</span>
              <span>{localeLabels[locale]}</span>
            </summary>
            <div className="locale-menu">
              {SUPPORTED_LOCALES.map((targetLocale) => (
                <Link
                  aria-current={targetLocale === locale ? "page" : undefined}
                  key={targetLocale}
                  lang={targetLocale}
                  to={`${pathForLocale(location.pathname, targetLocale)}${location.search}`}
                >
                  {localeLabels[targetLocale]}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ messages }: { messages: Messages }) {
  return (
    <footer className="site-footer">
      <span className="footer-mark" aria-hidden="true">
        S
      </span>
      <p>{messages.footer.description}</p>
      <p className="footer-license">AGPL-3.0 · Content licenses vary</p>
    </footer>
  );
}
