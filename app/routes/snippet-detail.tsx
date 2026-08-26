import { data, isRouteErrorResponse, Link } from "react-router";

import type { Route } from "./+types/snippet-detail";
import { CopyButton } from "../components/copy-button";
import { ScratchblocksRenderer } from "../components/scratchblocks-renderer";
import { ShareButton } from "../components/share-button";
import { SnippetDemo } from "../components/snippet-demo";
import { SnippetMarkdown } from "../components/snippet-markdown";
import { SnippetToc, type SnippetTocItem } from "../components/snippet-toc";
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
import { scratchblocksScriptAnchorId } from "../markdown/render";

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
    demoUrl: snippet.demo ? new URL(snippet.demo.path, origin).href : null,
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
        datePublished: snippet.publication.publishedAt,
        dateModified: snippet.publication.updatedAt,
        license: [snippet.licenses.code, snippet.licenses.prose],
        author: snippet.contributors.map((contributor) => ({
          "@type":
            contributor.kind === "organization" ? "Organization" : "Person",
          name: contributor.displayName,
          ...(contributor.profileUrl ? { url: contributor.profileUrl } : {}),
        })),
      },
    },
  ];
}

export const headers = publicPageHeaders;

function translatedEnum(values: Record<string, string>, value: string): string {
  return values[value] ?? value;
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatFileSize(bytes: number, locale: string): string {
  const value = bytes >= 1024 * 1024 ? bytes / (1024 * 1024) : bytes / 1024;
  const unit = bytes >= 1024 * 1024 ? "MB" : "KB";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

const LICENSE_URLS: Record<string, string> = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  MIT: "https://opensource.org/license/mit",
};

export default function SnippetDetail({ loaderData }: Route.ComponentProps) {
  const messages = getMessages(loaderData.locale);
  const { snippet } = loaderData;
  const localeSegment = toLocaleSegment(loaderData.locale);
  const units = new Map(
    snippet.translationUnits.map((unit) => [unit.key, unit.text]),
  );
  const scriptTitles = new Map(
    snippet.scripts.map((script, index) => [
      script.key,
      units.get(`script:${script.key}:title`) ??
        `${messages.detail.scriptUntitled} ${index + 1}`,
    ]),
  );
  const tocItems: SnippetTocItem[] = [
    {
      id: "code",
      label: messages.detail.code,
      children: snippet.scripts.flatMap((script) =>
        script.importedFrom
          ? []
          : [
              {
                id: scratchblocksScriptAnchorId(script.key),
                label: scriptTitles.get(script.key) ?? script.key,
              },
            ],
      ),
    },
    ...(snippet.demo ? [{ id: "demo", label: messages.detail.demo }] : []),
    ...(snippet.symbols.length
      ? [{ id: "symbols", label: messages.detail.symbols }]
      : []),
    ...(snippet.localization.bodyMarkdown
      ? [{ id: "about", label: messages.detail.about }]
      : []),
    ...(snippet.references.length
      ? [{ id: "references", label: messages.detail.references }]
      : []),
  ];

  function renderScript(script: (typeof snippet.scripts)[number]) {
    if (snippet.revision.representation === "scratchblocks") {
      return (
        <ScratchblocksRenderer
          labels={{
            copy: messages.detail.copyCode,
            copied: messages.detail.copied,
            copyFailed: messages.detail.copyFailed,
            exportSvg: messages.detail.exportSvg,
            exportPng: messages.detail.exportPng,
            renderFailed: messages.detail.renderFailed,
            codePreview: messages.detail.codePreview,
          }}
          scriptKey={script.key}
          source={script.source}
          sourceLocale={snippet.localization.locale}
        />
      );
    }
    return (
      <pre>
        <code>{script.source}</code>
      </pre>
    );
  }

  return (
    <main className="detail-page">
      <header className="detail-header">
        <div className="detail-header-copy">
          <h1>{snippet.localization.title}</h1>
          <p>{snippet.localization.summary}</p>
        </div>
        <div className="detail-header-tools">
          <ShareButton
            labels={{
              share: messages.detail.share,
              shared: messages.detail.shared,
              copied: messages.detail.linkCopied,
              failed: messages.detail.shareFailed,
            }}
            text={snippet.localization.summary}
            title={snippet.localization.title}
            url={loaderData.canonicalUrl}
          />
          {snippet.tagSlugs.length ? (
            <div className="tag-list" aria-label={messages.detail.tags}>
              {snippet.tagSlugs.map((tag) => (
                <Link
                  key={tag}
                  to={`/${localeSegment}/search?tag=${encodeURIComponent(tag)}`}
                >
                  {tag}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
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
        <aside className="detail-sidebar">
          <section>
            <h2>{messages.detail.onThisPage}</h2>
            <SnippetToc
              items={tocItems}
              label={messages.detail.onThisPage}
              toggleLabel={messages.detail.toggleContents}
            />
          </section>

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

          <section>
            <h2>{messages.detail.details}</h2>
            <dl className="snippet-facts">
              <div>
                <dt>{messages.detail.revision}</dt>
                <dd>#{snippet.revision.number}</dd>
              </div>
              <div>
                <dt>{messages.detail.published}</dt>
                <dd>
                  <time dateTime={snippet.publication.publishedAt}>
                    {formatDate(
                      snippet.publication.publishedAt,
                      loaderData.locale,
                    )}
                  </time>
                </dd>
              </div>
              {snippet.publication.updatedAt !==
              snippet.publication.publishedAt ? (
                <div>
                  <dt>{messages.detail.updated}</dt>
                  <dd>
                    <time dateTime={snippet.publication.updatedAt}>
                      {formatDate(
                        snippet.publication.updatedAt,
                        loaderData.locale,
                      )}
                    </time>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section>
            <h2>{messages.detail.licenses}</h2>
            <dl className="license-list">
              {(
                [
                  [messages.detail.codeLicense, snippet.licenses.code],
                  [messages.detail.proseLicense, snippet.licenses.prose],
                ] as const
              ).map(([label, license]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {LICENSE_URLS[license] ? (
                      <a
                        href={LICENSE_URLS[license]}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {license}
                        <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span>{license}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {snippet.contributors.length ? (
            <section>
              <h2>{messages.detail.contributors}</h2>
              <ul className="contributor-list">
                {snippet.contributors.map((contributor) => (
                  <li key={contributor.id}>
                    {contributor.profileUrl ? (
                      <a
                        href={contributor.profileUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {contributor.displayName}
                        <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span>{contributor.displayName}</span>
                    )}
                    <small>
                      {contributor.roles
                        .map((role) =>
                          translatedEnum(
                            messages.detail.contributorRoles,
                            role,
                          ),
                        )
                        .join(" · ")}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>

        <div className="detail-content">
          <section
            className="code-panel detail-section"
            id="code"
            aria-labelledby="code-heading"
          >
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
              {snippet.scripts.map((script) =>
                script.importedFrom ? (
                  <details className="imported-script" key={script.key}>
                    <summary>
                      <span className="imported-script-title">
                        <small>{messages.detail.importedScript}</small>
                        {scriptTitles.get(script.key)}
                      </span>
                      <span className="imported-script-source">
                        {messages.detail.importedFrom}{" "}
                        {script.importedFrom.sourceTitle ??
                          script.importedFrom.moduleId}
                      </span>
                    </summary>
                    <div className="imported-script-body">
                      <p className="imported-script-provenance">
                        <span>{messages.detail.importedFrom}</span>
                        {script.importedFrom.sourceSlug ? (
                          <Link
                            to={`/${localeSegment}/snippets/${script.importedFrom.sourceSlug}`}
                          >
                            {script.importedFrom.sourceTitle ??
                              script.importedFrom.moduleId}
                          </Link>
                        ) : (
                          <strong>{script.importedFrom.moduleId}</strong>
                        )}
                        <code>{script.importedFrom.scriptId}</code>
                      </p>
                      {renderScript(script)}
                    </div>
                  </details>
                ) : (
                  <article
                    className="script-source"
                    id={scratchblocksScriptAnchorId(script.key)}
                    key={script.key}
                  >
                    <h3>{scriptTitles.get(script.key)}</h3>
                    {renderScript(script)}
                  </article>
                ),
              )}
            </div>
          </section>

          {snippet.demo && loaderData.demoUrl ? (
            <section className="demo-section detail-section" id="demo">
              <div className="demo-section-heading">
                <div>
                  <p className="eyebrow">SB3</p>
                  <h2>{messages.detail.demo}</h2>
                </div>
                <span className="demo-license">{snippet.demo.license}</span>
              </div>
              <SnippetDemo
                demoUrl={loaderData.demoUrl}
                downloadName={`${snippet.slug}-demo.sb3`}
                fileDescription={`${messages.detail.demoFile} · ${formatFileSize(snippet.demo.byteSize, loaderData.locale)}`}
                labels={{
                  description: messages.detail.demoDescription,
                  load: messages.detail.loadDemo,
                  open: messages.detail.openInTurboWarp,
                  download: messages.detail.downloadDemo,
                  frameTitle: messages.detail.demoFrameTitle,
                }}
              />
              {snippet.demo.attribution ? (
                <p className="demo-attribution">{snippet.demo.attribution}</p>
              ) : null}
            </section>
          ) : null}

          {snippet.symbols.length ? (
            <section className="detail-section symbols-section" id="symbols">
              <p className="eyebrow">{messages.detail.symbols}</p>
              <h2>{messages.detail.symbols}</h2>
              <div className="symbols-table-wrap">
                <table className="symbols-table">
                  <thead>
                    <tr>
                      <th>{messages.detail.symbolName}</th>
                      <th>{messages.detail.symbolType}</th>
                      <th>{messages.detail.symbolScope}</th>
                      <th>
                        <span className="visually-hidden">
                          {messages.detail.copyName}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {snippet.symbols.map((symbol) => {
                      const name = units.get(symbol.nameUnitKey) ?? symbol.key;
                      return (
                        <tr key={symbol.key}>
                          <th scope="row">{name}</th>
                          <td>
                            {translatedEnum(
                              messages.detail.symbolKinds,
                              symbol.kind,
                            )}
                          </td>
                          <td>
                            {translatedEnum(
                              messages.detail.symbolScopes,
                              symbol.scope,
                            )}
                          </td>
                          <td>
                            <CopyButton
                              labels={{
                                copy: messages.detail.copyName,
                                copied: messages.detail.copied,
                                failed: messages.detail.copyFailed,
                              }}
                              value={name}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {snippet.localization.bodyMarkdown ? (
            <section className="prose-section detail-section" id="about">
              <p className="eyebrow">{messages.detail.about}</p>
              <h2>{messages.detail.about}</h2>
              <div className="prose-body">
                <SnippetMarkdown
                  labels={{
                    copy: messages.detail.copyCode,
                    copied: messages.detail.copied,
                    copyFailed: messages.detail.copyFailed,
                    exportSvg: messages.detail.exportSvg,
                    exportPng: messages.detail.exportPng,
                    renderFailed: messages.detail.renderFailed,
                    codePreview: messages.detail.codePreview,
                  }}
                  locale={snippet.localization.locale}
                  markdown={snippet.localization.bodyMarkdown}
                />
              </div>
            </section>
          ) : null}

          {snippet.references.length ? (
            <section
              className="detail-section references-section"
              id="references"
            >
              <p className="eyebrow">{messages.detail.references}</p>
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
        </div>
      </div>
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
