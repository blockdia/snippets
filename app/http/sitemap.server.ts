import {
  CONTENT_FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  toLocaleSegment,
  type Locale,
} from "../i18n/locales";

export interface SitemapSnippet {
  slug: string;
  locale: Locale;
  updatedAt: string;
}

interface SitemapAlternate {
  locale: Locale | "x-default";
  path: string;
}

interface SitemapUrl {
  path: string;
  lastModified?: string;
  alternates: SitemapAlternate[];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function absoluteUrl(origin: string, path: string): string {
  return new URL(path, `${origin}/`).toString();
}

function localizedAlternates(pathForLocale: (locale: Locale) => string) {
  return [
    ...SUPPORTED_LOCALES.map((locale) => ({
      locale,
      path: pathForLocale(locale),
    })),
    {
      locale: "x-default" as const,
      path: pathForLocale(CONTENT_FALLBACK_LOCALE),
    },
  ];
}

function sitemapUrls(snippets: SitemapSnippet[]): SitemapUrl[] {
  const urls: SitemapUrl[] = [];

  for (const suffix of ["", "/snippets"]) {
    const pathForLocale = (locale: Locale) =>
      `/${toLocaleSegment(locale)}${suffix}`;
    const alternates = localizedAlternates(pathForLocale);
    for (const locale of SUPPORTED_LOCALES) {
      urls.push({ path: pathForLocale(locale), alternates });
    }
  }

  const snippetsBySlug = new Map<string, SitemapSnippet[]>();
  for (const snippet of snippets) {
    const entries = snippetsBySlug.get(snippet.slug) ?? [];
    entries.push(snippet);
    snippetsBySlug.set(snippet.slug, entries);
  }

  for (const [slug, entries] of snippetsBySlug) {
    const pathForLocale = (locale: Locale) =>
      `/${toLocaleSegment(locale)}/snippets/${encodeURIComponent(slug)}`;
    const alternates = [
      ...entries.map(({ locale }) => ({
        locale,
        path: pathForLocale(locale),
      })),
      {
        locale: "x-default" as const,
        path: pathForLocale(CONTENT_FALLBACK_LOCALE),
      },
    ];
    for (const entry of entries) {
      urls.push({
        path: pathForLocale(entry.locale),
        lastModified: entry.updatedAt,
        alternates,
      });
    }
  }

  return urls;
}

export function renderSitemapXml(
  requestUrl: string,
  snippets: SitemapSnippet[],
): string {
  const origin = new URL(requestUrl).origin;
  const entries = sitemapUrls(snippets)
    .map((url) => {
      const alternates = url.alternates
        .map(
          (alternate) =>
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.locale)}" href="${escapeXml(absoluteUrl(origin, alternate.path))}" />`,
        )
        .join("\n");
      const lastModified = url.lastModified
        ? `\n    <lastmod>${escapeXml(url.lastModified)}</lastmod>`
        : "";
      return `  <url>\n    <loc>${escapeXml(absoluteUrl(origin, url.path))}</loc>${lastModified}\n${alternates}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`;
}

export function sitemapResponse(
  request: Request,
  snippets: SitemapSnippet[],
): Response {
  return new Response(renderSitemapXml(request.url, snippets), {
    headers: {
      "Cache-Control":
        "public, max-age=30, s-maxage=300, stale-while-revalidate=86400",
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
