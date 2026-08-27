import { ProgressProvider, useProgress } from "@bprogress/react";
import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigation,
} from "react-router";

import type { Route } from "./+types/root";
import { canonicalizeLocale, CONTENT_FALLBACK_LOCALE } from "./i18n/locales";
import "./app.css";

const themeInitializationScript = `
  (() => {
    const storageKey = "scratch-snippets-theme";
    let theme;

    try {
      const storedTheme = window.localStorage.getItem(storageKey);
      if (storedTheme === "light" || storedTheme === "dark") {
        theme = storedTheme;
      }
    } catch {}

    if (!theme) {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    document.documentElement.dataset.theme = theme;
  })();
`;

const THEME_STORAGE_KEY = "scratch-snippets-theme";

function ThemePreferenceSync() {
  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

    function storedTheme() {
      try {
        const value = window.localStorage.getItem(THEME_STORAGE_KEY);
        return value === "light" || value === "dark" ? value : null;
      } catch {
        return null;
      }
    }

    function applyTheme() {
      document.documentElement.dataset.theme =
        storedTheme() ?? (colorScheme.matches ? "dark" : "light");
    }

    function followSystemTheme(event: MediaQueryListEvent) {
      if (storedTheme()) return;
      document.documentElement.dataset.theme = event.matches ? "dark" : "light";
    }

    applyTheme();
    colorScheme.addEventListener("change", followSystemTheme);
    return () => colorScheme.removeEventListener("change", followSystemTheme);
  }, []);

  return null;
}

function NavigationProgress() {
  const navigation = useNavigation();
  const { start, stop } = useProgress();
  const isNavigating = Boolean(navigation.location);

  useEffect(() => {
    if (!isNavigating) {
      stop();
      return;
    }

    const timer = window.setTimeout(() => start(0.08), 120);
    return () => window.clearTimeout(timer);
  }, [isNavigating, start, stop]);

  return null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const firstSegment = location.pathname.split("/")[1] ?? "";
  const locale =
    firstSegment === "admin"
      ? "zh-CN"
      : (canonicalizeLocale(firstSegment) ?? CONTENT_FALLBACK_LOCALE);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any" />
        <script
          dangerouslySetInnerHTML={{ __html: themeInitializationScript }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        <ProgressProvider
          color="var(--purple)"
          height="3px"
          options={{ showSpinner: false }}
        >
          <ThemePreferenceSync />
          <NavigationProgress />
          {children}
        </ProgressProvider>
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
