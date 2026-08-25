import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";
import { canonicalizeLocale, CONTENT_FALLBACK_LOCALE } from "./i18n/locales";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const locale =
    canonicalizeLocale(location.pathname.split("/")[1] ?? "") ??
    CONTENT_FALLBACK_LOCALE;

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "The page could not be rendered.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Page not found" : "Request failed";
    details =
      error.status === 404
        ? "The requested page does not exist."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="error-page">
      <div className="error-card">
        <p className="eyebrow">Scratch Snippets</p>
        <h1>{message}</h1>
        <p>{details}</p>
        <a href="/">Return home</a>
      </div>
      {stack && (
        <pre className="error-stack">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
