import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Form, Link, useNavigation } from "react-router";

import type { Route } from "./+types/snippets-index";
import { SnippetCard } from "../components/snippet-card";
import { publicPageHeaders } from "../http/public-page";
import { getMessages } from "../i18n/messages";
import { toLocaleSegment } from "../i18n/locales";
import { platformContext } from "../platform/context";
import { requireRouteLocale } from "../routing/locale.server";
import {
  parseSnippetSearchParameters,
  snippetSearchHref,
} from "../search/params";
import {
  listSearchTags,
  searchPublishedSnippets,
} from "../services/snippets.server";

const PAGE_SIZE = 24;

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const locale = requireRouteLocale(params.locale);
  const url = new URL(request.url);
  const { query, tag, page } = parseSnippetSearchParameters(url.searchParams);
  const localeSegment = toLocaleSegment(locale);
  const { db } = context.get(platformContext);
  const [tags, results] = await Promise.all([
    listSearchTags(db, locale),
    searchPublishedSnippets(db, locale, {
      query,
      tagSlug: tag,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  const canonical = new URL(
    snippetSearchHref(localeSegment, { query, tag, page }),
    request.url,
  );

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
    ? `${loaderData.query} — ${messages.navigation.snippets}`
    : messages.navigation.snippets;
  const pageSuffix = loaderData.page > 1 ? ` · ${loaderData.page}` : "";
  return [
    {
      title: `${title}${pageSuffix} — ${messages.brand}`,
    },
    { name: "description", content: messages.index.description },
    { property: "og:title", content: title },
    { property: "og:description", content: messages.index.description },
    { property: "og:type", content: "website" },
    { tagName: "link", rel: "canonical", href: loaderData.canonicalUrl },
  ];
}

export const headers = publicPageHeaders;

export default function SnippetsIndex({ loaderData }: Route.ComponentProps) {
  const messages = getMessages(loaderData.locale);
  const localeSegment = toLocaleSegment(loaderData.locale);
  const navigation = useNavigation();
  const isSearching = Boolean(
    navigation.location?.pathname === `/${localeSegment}/snippets`,
  );
  const pageCount = Math.max(
    1,
    Math.ceil(loaderData.results.total / PAGE_SIZE),
  );

  return (
    <main className="listing-page">
      <header className="listing-header">
        <h1>{messages.navigation.snippets}</h1>
        <Form
          aria-label={messages.navigation.search}
          className="search-form"
          key={`${loaderData.query}:${loaderData.tag}`}
          method="get"
        >
          <label className="search-query-field">
            <span className="visually-hidden">{messages.search.submit}</span>
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="search-icon"
              size={20}
              weight="bold"
            />
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
      </header>

      <section
        aria-busy={isSearching}
        aria-live="polite"
        className={`search-results${isSearching ? " pending" : ""}`}
      >
        {loaderData.searched && loaderData.results.total > 0 ? (
          <div className="search-summary">
            <strong>{loaderData.results.total}</strong>{" "}
            {loaderData.results.total === 1
              ? messages.search.result
              : messages.search.results}
          </div>
        ) : null}

        {loaderData.results.items.length ? (
          <div className="snippet-grid listing-grid">
            {loaderData.results.items.map((card) => (
              <SnippetCard
                card={card}
                key={card.id}
                locale={loaderData.locale}
                messages={messages}
              />
            ))}
          </div>
        ) : loaderData.searched ? (
          <div className="empty-library search-no-results">
            <h2>{messages.search.noResultsTitle}</h2>
          </div>
        ) : (
          <div className="empty-library empty-library-large">
            <div>
              <h2>{messages.index.emptyTitle}</h2>
              <p>{messages.index.emptyDescription}</p>
            </div>
          </div>
        )}

        {pageCount > 1 ? (
          <nav className="pagination" aria-label="Pagination">
            {loaderData.page > 1 ? (
              <Link
                to={snippetSearchHref(localeSegment, {
                  query: loaderData.query,
                  tag: loaderData.tag,
                  page: loaderData.page - 1,
                })}
              >
                ← {messages.index.previous}
              </Link>
            ) : (
              <span />
            )}
            <span className="page-count">
              {loaderData.page} / {pageCount}
            </span>
            {loaderData.page < pageCount ? (
              <Link
                to={snippetSearchHref(localeSegment, {
                  query: loaderData.query,
                  tag: loaderData.tag,
                  page: loaderData.page + 1,
                })}
              >
                {messages.index.next} →
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
