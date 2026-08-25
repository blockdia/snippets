import { data, isRouteErrorResponse, Link } from "react-router";

import type { Route } from "./+types/snippet-detail";
import { publicPageHeaders } from "../http/public-page";
import { getMessages } from "../i18n/messages";
import {
  canonicalizeLocale,
  CONTENT_FALLBACK_LOCALE,
  toLocaleSegment,
} from "../i18n/locales";
import { platformContext } from "../platform/context";
import { canonicalUrl, requireRouteLocale } from "../routing/locale.server";
import { resolvePublishedSnippet } from "../services/snippets.server";

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const locale = requireRouteLocale(params.locale);
  const { db } = context.get(platformContext);
  const snippet = await resolvePublishedSnippet(db, params.slug, locale);

  if (!snippet) {
    throw data(
      { code: "SNIPPET_NOT_FOUND", locale, slug: params.slug },
      { status: 404 },
    );
  }

  const localeSegment = toLocaleSegment(locale);
  const path = `/${localeSegment}/snippets/${snippet.slug}`;
  const origin = new URL(request.url).origin;
  return {
    locale,
    snippet,
    canonicalUrl: canonicalUrl(request, path),
    alternateUrls: snippet.availableLocales.map((availableLocale) => ({
      locale: availableLocale,
      url: `${origin}/${toLocaleSegment(availableLocale)}/snippets/${snippet.slug}`,
    })),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  const { snippet } = loaderData;
  const title = snippet.localization.seoTitle ?? snippet.localization.title;
  const description =
    snippet.localization.seoDescription ?? snippet.localization.summary;

  return [
    { title: `${title} — Scratch Snippets` },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { property: "og:locale", content: snippet.localization.locale },
    { tagName: "link", rel: "canonical", href: loaderData.canonicalUrl },
    ...loaderData.alternateUrls.map((alternate) => ({
      tagName: "link" as const,
      rel: "alternate",
      hrefLang: alternate.locale,
      href: alternate.url,
    })),
    {
      tagName: "link" as const,
      rel: "alternate",
      hrefLang: "x-default",
      href:
        loaderData.alternateUrls.find(
          (alternate) => alternate.locale === CONTENT_FALLBACK_LOCALE,
        )?.url ?? loaderData.canonicalUrl,
    },
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "SoftwareSourceCode",
        name: snippet.localization.title,
        description,
        programmingLanguage: "Scratch",
        codeSampleType: "full",
        url: loaderData.canonicalUrl,
      },
    },
  ];
}

export const headers = publicPageHeaders;

function bodyParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export default function SnippetDetail({ loaderData }: Route.ComponentProps) {
  const messages = getMessages(loaderData.locale);
  const { snippet } = loaderData;
  const units = new Map(
    snippet.translationUnits.map((unit) => [unit.key, unit.text]),
  );
  const localeSegment = toLocaleSegment(loaderData.locale);

  return (
    <main className="detail-page">
      <Link className="back-link" to={`/${localeSegment}/snippets`}>
        <span aria-hidden="true">←</span> {messages.detail.back}
      </Link>

      <header className="detail-header">
        <div>
          <div className="detail-kicker-row">
            <span className="snippet-glyph" aria-hidden="true">
              ◆
            </span>
            <span>
              {messages.detail.revision} {snippet.revision.number}
            </span>
          </div>
          <h1>{snippet.localization.title}</h1>
          <p>{snippet.localization.summary}</p>
        </div>
        {snippet.tagSlugs.length ? (
          <div className="tag-list" aria-label={messages.detail.tags}>
            {snippet.tagSlugs.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : null}
      </header>

      {snippet.localization.fallbackUsed ? (
        <aside className="translation-notice">
          <span className="notice-icon" aria-hidden="true">
            文
          </span>
          <div>
            <h2>{messages.detail.translationFallbackTitle}</h2>
            <p>{messages.detail.translationFallbackDescription}</p>
          </div>
        </aside>
      ) : null}

      <div className="detail-layout">
        <section className="code-panel" aria-labelledby="code-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">scratchblocks</p>
              <h2 id="code-heading">{messages.detail.code}</h2>
            </div>
            <span className="representation-badge">
              {snippet.revision.representation} v
              {snippet.revision.representationVersion}
            </span>
          </div>
          <div className="script-stack">
            {snippet.scripts.map((script, index) => (
              <article className="script-source" key={script.key}>
                <h3>
                  {units.get(`script:${script.key}:title`) ??
                    `${messages.detail.scriptUntitled} ${index + 1}`}
                </h3>
                <pre>
                  <code>{script.source}</code>
                </pre>
              </article>
            ))}
          </div>
        </section>

        <aside className="detail-sidebar">
          <section>
            <h2>{messages.detail.availableLanguages}</h2>
            <div className="available-locales">
              {snippet.availableLocales.map((availableLocale) => (
                <Link
                  aria-current={
                    availableLocale === loaderData.locale ? "page" : undefined
                  }
                  key={availableLocale}
                  lang={availableLocale}
                  to={`/${toLocaleSegment(availableLocale)}/snippets/${snippet.slug}`}
                >
                  {availableLocale}
                </Link>
              ))}
            </div>
          </section>

          {snippet.symbols.length ? (
            <section>
              <h2>{messages.detail.symbols}</h2>
              <ul className="metadata-list">
                {snippet.symbols.map((symbol) => (
                  <li key={symbol.key}>
                    <span>{units.get(symbol.nameUnitKey) ?? symbol.key}</span>
                    <small>
                      {symbol.kind} · {symbol.scope}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {snippet.references.length ? (
            <section>
              <h2>{messages.detail.references}</h2>
              <ul className="reference-list">
                {snippet.references.map((reference) => (
                  <li key={reference.key}>
                    <a href={reference.url} rel="noreferrer" target="_blank">
                      {units.get(reference.titleUnitKey) ?? reference.url}
                      <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      {snippet.localization.bodyMarkdown ? (
        <section className="prose-section">
          <p className="eyebrow">{messages.detail.about}</p>
          <h2>{messages.detail.about}</h2>
          <div className="prose-body">
            {bodyParagraphs(snippet.localization.bodyMarkdown).map(
              (paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ),
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const locale = canonicalizeLocale(params.locale) ?? CONTENT_FALLBACK_LOCALE;
  const messages = getMessages(locale);
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className="route-error">
      <span className="error-code">{notFound ? "404" : "500"}</span>
      <h1>
        {notFound
          ? messages.errors.notFoundTitle
          : messages.errors.generalTitle}
      </h1>
      <p>
        {notFound
          ? messages.errors.notFoundDescription
          : messages.errors.generalDescription}
      </p>
      <Link
        className="primary-button"
        to={`/${toLocaleSegment(locale)}/snippets`}
      >
        {messages.detail.back}
      </Link>
    </main>
  );
}
