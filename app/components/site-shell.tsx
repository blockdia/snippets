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

function pathForLocale(pathname: string, locale: Locale): string {
  const segments = pathname.split("/");
  segments[1] = toLocaleSegment(locale);
  return segments.join("/") || `/${toLocaleSegment(locale)}`;
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

        <details className="locale-switcher">
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
