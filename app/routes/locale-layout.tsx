import { isRouteErrorResponse, Link, Outlet, redirect } from "react-router";

import type { Route } from "./+types/locale-layout";
import { SiteFooter, SiteHeader } from "../components/site-shell";
import { getMessages } from "../i18n/messages";
import {
  CONTENT_FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  toLocaleSegment,
} from "../i18n/locales";
import { requireRouteLocale } from "../routing/locale.server";

export function loader({ params, request }: Route.LoaderArgs) {
  const locale = requireRouteLocale(params.locale);
  const canonicalSegment = toLocaleSegment(locale);

  if (params.locale !== canonicalSegment) {
    const url = new URL(request.url);
    const segments = url.pathname.split("/");
    segments[1] = canonicalSegment;
    url.pathname = segments.join("/");
    throw redirect(`${url.pathname}${url.search}`, 308);
  }

  return { locale };
}

export default function LocaleLayout({ loaderData }: Route.ComponentProps) {
  const messages = getMessages(loaderData.locale);
  return (
    <div className="site-frame">
      <SiteHeader locale={loaderData.locale} messages={messages} />
      <div className="page-frame">
        <Outlet />
      </div>
      <SiteFooter messages={messages} />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const locale = CONTENT_FALLBACK_LOCALE;
  const messages = getMessages(locale);
  const unsupported = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className="standalone-error">
      <span className="error-code">{unsupported ? "404" : "500"}</span>
      <p className="eyebrow">{messages.brand}</p>
      <h1>
        {unsupported
          ? messages.errors.localeNotFoundTitle
          : messages.errors.generalTitle}
      </h1>
      <p>
        {unsupported
          ? messages.errors.localeNotFoundDescription
          : messages.errors.generalDescription}
      </p>
      <div className="error-language-links">
        {SUPPORTED_LOCALES.map((supportedLocale) => (
          <Link
            key={supportedLocale}
            lang={supportedLocale}
            to={`/${toLocaleSegment(supportedLocale)}`}
          >
            {supportedLocale}
          </Link>
        ))}
      </div>
    </main>
  );
}
