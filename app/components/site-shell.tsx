import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation, useMatches } from "react-router";

import type { Messages } from "../i18n/messages";
import {
  SUPPORTED_LOCALES,
  toLocaleSegment,
  type Locale,
} from "../i18n/locales";
import {
  SCRATCHBLOCKS_SCALES,
  useScratchblocksConfig,
  type ScratchblocksScale,
  type ScratchblocksStyle,
  type ScratchblocksTranslation,
} from "./scratchblocks-config";

const localeLabels: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

const THEME_STORAGE_KEY = "scratch-snippets-theme";

type ThemePreference = "system" | "light" | "dark";

function getStoredThemePreference(): ThemePreference {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : "system";
  } catch {
    return "system";
  }
}

function applyThemePreference(preference: ThemePreference) {
  if (preference === "system") {
    try {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // The system theme still applies for this page when storage is blocked.
    }

    document.documentElement.dataset.theme = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches
      ? "dark"
      : "light";
    return;
  }

  document.documentElement.dataset.theme = preference;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The selected theme still applies for this page when storage is blocked.
  }
}

function pathForLocale(pathname: string, locale: Locale): string {
  const segments = pathname.split("/");
  segments[1] = toLocaleSegment(locale);
  return segments.join("/") || `/${toLocaleSegment(locale)}`;
}

interface SnippetLanguageContext {
  availableLocales: Locale[];
}

function getSnippetLanguageContext(
  matches: ReturnType<typeof useMatches>,
): SnippetLanguageContext | null {
  for (const match of matches) {
    if (!match.loaderData || typeof match.loaderData !== "object") continue;
    if (!("snippet" in match.loaderData)) continue;

    const snippet = match.loaderData.snippet;
    if (!snippet || typeof snippet !== "object") continue;
    if (!("availableLocales" in snippet)) continue;
    if (!Array.isArray(snippet.availableLocales)) continue;

    const availableLocales = snippet.availableLocales.filter(
      (value): value is Locale =>
        SUPPORTED_LOCALES.some((supportedLocale) => supportedLocale === value),
    );

    return { availableLocales };
  }

  return null;
}

function DisplaySettings({ messages }: { messages: Messages }) {
  const appearanceId = useId();
  const catHatsId = useId();
  const scaleId = useId();
  const themeId = useId();
  const translationId = useId();
  const panelId = useId();
  const settingsRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [themePreference, setThemePreference] =
    useState<ThemePreference>("system");
  const {
    catHats,
    scale,
    style,
    translation,
    setCatHats,
    setScale,
    setStyle,
    setTranslation,
  } = useScratchblocksConfig();

  useEffect(() => {
    setThemePreference(getStoredThemePreference());
  }, []);

  useEffect(() => {
    if (!open) return;

    function closeSettings(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !settingsRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function closeSettingsWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeSettings);
    document.addEventListener("keydown", closeSettingsWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeSettings);
      document.removeEventListener("keydown", closeSettingsWithKeyboard);
    };
  }, [open]);

  return (
    <div className="scratchblocks-settings" ref={settingsRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={messages.navigation.displaySettings}
        className="scratchblocks-settings-button"
        onClick={() => setOpen((current) => !current)}
        title={messages.navigation.displaySettings}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 8.25A3.75 3.75 0 1 0 12 15.75 3.75 3.75 0 0 0 12 8.25Z" />
          <path d="M19.4 13.42a7.8 7.8 0 0 0 .04-1.42 7.8 7.8 0 0 0-.04-1.42l2.03-1.58-2-3.46-2.38.96a8.1 8.1 0 0 0-2.46-1.42L14.23 2h-4.46l-.36 3.08A8.1 8.1 0 0 0 6.95 6.5l-2.38-.96-2 3.46 2.03 1.58A7.8 7.8 0 0 0 4.56 12c0 .48.02.95.04 1.42L2.57 15l2 3.46 2.38-.96a8.1 8.1 0 0 0 2.46 1.42l.36 3.08h4.46l.36-3.08a8.1 8.1 0 0 0 2.46-1.42l2.38.96 2-3.46-2.03-1.58Z" />
        </svg>
      </button>

      {open ? (
        <div
          aria-label={messages.navigation.displaySettings}
          className="scratchblocks-settings-popover"
          id={panelId}
        >
          <div className="scratchblocks-settings-heading">
            <h2>{messages.navigation.displaySettings}</h2>
          </div>

          <section className="scratchblocks-settings-section">
            <h3>{messages.navigation.interfaceAppearance}</h3>
            <label htmlFor={themeId}>
              <span>{messages.navigation.colorTheme}</span>
              <select
                id={themeId}
                onChange={(event) => {
                  const preference = event.currentTarget
                    .value as ThemePreference;
                  setThemePreference(preference);
                  applyThemePreference(preference);
                }}
                value={themePreference}
              >
                <option value="system">
                  {messages.navigation.followSystemTheme}
                </option>
                <option value="light">{messages.navigation.lightTheme}</option>
                <option value="dark">{messages.navigation.darkTheme}</option>
              </select>
            </label>
          </section>

          <section className="scratchblocks-settings-section">
            <h3>{messages.navigation.blockDisplay}</h3>
            <label htmlFor={appearanceId}>
              <span>{messages.detail.appearance}</span>
              <select
                id={appearanceId}
                onChange={(event) =>
                  setStyle(event.currentTarget.value as ScratchblocksStyle)
                }
                value={style}
              >
                <option value="scratch3">Scratch 3</option>
                <option value="scratch3-high-contrast">
                  Scratch 3 · {messages.detail.highContrast}
                </option>
                <option value="scratch3-outline">
                  Scratch 3 · {messages.detail.outline}
                </option>
                <option value="scratch2">Scratch 2</option>
              </select>
            </label>

            <label
              className="scratchblocks-settings-toggle"
              htmlFor={catHatsId}
            >
              <span>{messages.detail.catHats}</span>
              <input
                checked={catHats}
                className="visually-hidden"
                id={catHatsId}
                onChange={(event) => setCatHats(event.currentTarget.checked)}
                type="checkbox"
              />
              <span
                aria-hidden="true"
                className="scratchblocks-settings-toggle-track"
              />
            </label>

            <label htmlFor={scaleId}>
              <span>{messages.detail.blockScale}</span>
              <select
                id={scaleId}
                onChange={(event) =>
                  setScale(
                    Number(event.currentTarget.value) as ScratchblocksScale,
                  )
                }
                value={scale}
              >
                {SCRATCHBLOCKS_SCALES.map((scaleOption) => (
                  <option key={scaleOption} value={scaleOption}>
                    {scaleOption * 100}%
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor={translationId}>
              <span>{messages.detail.translateCode}</span>
              <select
                id={translationId}
                onChange={(event) =>
                  setTranslation(
                    event.currentTarget.value as ScratchblocksTranslation,
                  )
                }
                value={translation}
              >
                <option value="original">
                  {messages.detail.originalLanguage}
                </option>
                {SUPPORTED_LOCALES.map((targetLocale) => (
                  <option key={targetLocale} value={targetLocale}>
                    {localeLabels[targetLocale]}
                  </option>
                ))}
              </select>
            </label>
          </section>
        </div>
      ) : null}
    </div>
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
  const matches = useMatches();
  const localeSegment = toLocaleSegment(locale);
  const localeSwitcherRef = useRef<HTMLDetailsElement>(null);
  const snippetLanguageContext = getSnippetLanguageContext(matches);
  const snippetLocales = new Set(
    snippetLanguageContext?.availableLocales ?? [],
  );

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
        </nav>

        <div className="header-actions">
          <DisplaySettings messages={messages} />
          <details className="locale-switcher" ref={localeSwitcherRef}>
            <summary aria-label={messages.navigation.language}>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M3.5 9h17M3.5 15h17M12 3c2.25 2.45 3.4 5.45 3.4 9S14.25 18.55 12 21M12 3C9.75 5.45 8.6 8.45 8.6 12s1.15 6.55 3.4 9" />
              </svg>
              <span>{localeLabels[locale]}</span>
            </summary>
            <div className="locale-menu">
              <p className="locale-menu-heading">
                {messages.navigation.language}
              </p>
              {SUPPORTED_LOCALES.map((targetLocale) => (
                <Link
                  aria-current={targetLocale === locale ? "page" : undefined}
                  key={targetLocale}
                  lang={targetLocale}
                  to={`${pathForLocale(location.pathname, targetLocale)}${location.search}`}
                >
                  <span>{localeLabels[targetLocale]}</span>
                  {snippetLanguageContext &&
                  !snippetLocales.has(targetLocale) ? (
                    <small>{messages.detail.translationUnavailable}</small>
                  ) : null}
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
