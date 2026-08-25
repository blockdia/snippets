import { Form, Link, useNavigation } from "react-router";

import type { Route } from "./+types/search";
import { SnippetCard } from "../components/snippet-card";
import { publicPageHeaders } from "../http/public-page";
import { getMessages } from "../i18n/messages";
import { toLocaleSegment } from "../i18n/locales";
import { platformContext } from "../platform/context";
import { canonicalUrl, requireRouteLocale } from "../routing/locale.server";
import {
  listSearchTags,
  searchPublishedSnippets,
} from "../services/snippets.server";

const PAGE_SIZE = 18;
const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const locale = requireRouteLocale(params.locale);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const rawTag = url.searchParams.get("tag") ?? "";
  const tag = TAG_PATTERN.test(rawTag) ? rawTag : "";
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const { db } = context.get(platformContext);
  const [tags, results] = await Promise.all([
    listSearchTags(db, locale),
    query || tag
      ? searchPublishedSnippets(db, locale, {
          query,
          tagSlug: tag,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        })
      : Promise.resolve({ items: [], total: 0 }),
  ]);
  const localeSegment = toLocaleSegment(locale);
  const canonical = new URL(canonicalUrl(request, `/${localeSegment}/search`));
  if (query) canonical.searchParams.set("q", query);
  if (tag) canonical.searchParams.set("tag", tag);
  if (page > 1) canonical.searchParams.set("page", String(page));

  return {
    locale,
    query,
    tag,
    page,
    tags,
    results,
    searched: Boolean(query || tag),
    canonicalUrl: canonical.toString(),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  const messages = getMessages(loaderData.locale);
  const title = loaderData.query
    ? `${loaderData.query} — ${messages.navigation.search}`
    : messages.search.title;
  return [
    { title: `${title} — ${messages.brand}` },
    { name: "description", content: messages.search.description },
    { property: "og:title", content: title },
    { property: "og:description", content: messages.search.description },
    { tagName: "link", rel: "canonical", href: loaderData.canonicalUrl },
  ];
}

export const headers = publicPageHeaders;

function searchHref(
  localeSegment: string,
  query: string,
  tag: string,
  page: number,
): string {
  const parameters = new URLSearchParams();
  if (query) parameters.set("q", query);
  if (tag) parameters.set("tag", tag);
  if (page > 1) parameters.set("page", String(page));
  const search = parameters.toString();
  return `/${localeSegment}/search${search ? `?${search}` : ""}`;
}

export default function SearchPage({ loaderData }: Route.ComponentProps) {
  const messages = getMessages(loaderData.locale);
  const localeSegment = toLocaleSegment(loaderData.locale);
  const navigation = useNavigation();
  const isSearching = Boolean(
    navigation.location?.pathname === `/${localeSegment}/search`,
  );
  const pageCount = Math.max(
    1,
    Math.ceil(loaderData.results.total / PAGE_SIZE),
  );

  return (
    <main className="search-page">
      <header className="search-header">
        <p className="eyebrow">{messages.search.eyebrow}</p>
        <h1>{messages.search.title}</h1>
        <p>{messages.search.description}</p>
      </header>

      <Form
        aria-label={messages.navigation.search}
        className="search-form"
        method="get"
      >
        <label className="search-query-field">
          <span className="visually-hidden">{messages.search.submit}</span>
          <span aria-hidden="true" className="search-icon">
            ⌕
          </span>
          <input
            defaultValue={loaderData.query}
            maxLength={200}
            name="q"
            placeholder={messages.search.placeholder}
            type="search"
          />
        </label>
        <label className="search-tag-field">
          <span className="visually-hidden">{messages.detail.tags}</span>
          <select defaultValue={loaderData.tag} name="tag">
            <option value="">{messages.search.allTags}</option>
            {loaderData.tags.map((tag) => (
              <option key={tag.slug} value={tag.slug}>
                {tag.name} ({tag.snippetCount})
              </option>
            ))}
          </select>
        </label>
        <button disabled={isSearching} type="submit">
          {isSearching ? messages.search.searching : messages.search.submit}
        </button>
      </Form>

      <section
        aria-busy={isSearching}
        aria-live="polite"
        className={`search-results${isSearching ? " pending" : ""}`}
      >
        {loaderData.searched ? (
          <div className="search-summary">
            <strong>{loaderData.results.total}</strong>{" "}
            {loaderData.results.total === 1
              ? messages.search.result
              : messages.search.results}
          </div>
        ) : null}

        {loaderData.results.items.length ? (
          <div className="snippet-grid search-grid">
            {loaderData.results.items.map((card) => (
              <SnippetCard
                card={card}
                key={card.id}
                locale={loaderData.locale}
                messages={messages}
              />
            ))}
          </div>
        ) : (
          <div className="empty-library empty-library-large search-empty">
            <span className="empty-icon" aria-hidden="true">
              {loaderData.searched ? "∅" : "⌕"}
            </span>
            <div>
              <h2>
                {loaderData.searched
                  ? messages.search.noResultsTitle
                  : messages.search.promptTitle}
              </h2>
              <p>
                {loaderData.searched
                  ? messages.search.noResultsDescription
                  : messages.search.promptDescription}
              </p>
            </div>
          </div>
        )}

        {pageCount > 1 ? (
          <nav className="pagination" aria-label="Pagination">
            {loaderData.page > 1 ? (
              <Link
                to={searchHref(
                  localeSegment,
                  loaderData.query,
                  loaderData.tag,
                  loaderData.page - 1,
                )}
              >
                ← {messages.search.previous}
              </Link>
            ) : (
              <span />
            )}
            <span className="page-count">
              {loaderData.page} / {pageCount}
            </span>
            {loaderData.page < pageCount ? (
              <Link
                to={searchHref(
                  localeSegment,
                  loaderData.query,
                  loaderData.tag,
                  loaderData.page + 1,
                )}
              >
                {messages.search.next} →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
