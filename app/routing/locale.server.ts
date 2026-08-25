import { data } from "react-router";

import { canonicalizeLocale, type Locale } from "../i18n/locales";

export function requireRouteLocale(value: string | undefined): Locale {
  const locale = value ? canonicalizeLocale(value) : null;
  if (!locale) {
    throw data(
      { code: "UNSUPPORTED_LOCALE", locale: value ?? null },
      { status: 404 },
    );
  }
  return locale;
}

export function canonicalUrl(request: Request, pathname: string): string {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}
