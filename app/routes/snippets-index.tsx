import { Link } from "react-router";

import type { Route } from "./+types/snippets-index";
import { SnippetCard } from "../components/snippet-card";
import { publicPageHeaders } from "../http/public-page";
import { getMessages } from "../i18n/messages";
import { toLocaleSegment } from "../i18n/locales";
import { platformContext } from "../platform/context";
import { canonicalUrl, requireRouteLocale } from "../routing/locale.server";
import { listPublishedSnippets } from "../services/snippets.server";

const PAGE_SIZE = 24;

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const locale = requireRouteLocale(params.locale);
  const url = new URL(request.url);
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const { db } = context.get(platformContext);
  const cards = await listPublishedSnippets(db, locale, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const localeSegment = toLocaleSegment(locale);
  const canonical = canonicalUrl(request, `/${localeSegment}/snippets`);
  return {
    locale,
    cards,
    page,
    hasNextPage: cards.length === PAGE_SIZE,
    canonicalUrl: page > 1 ? `${canonical}?page=${page}` : canonical,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  const messages = getMessages(loaderData.locale);
  const pageSuffix = loaderData.page > 1 ? ` · ${loaderData.page}` : "";
  return [
    {
      title: `${messages.navigation.snippets}${pageSuffix} — ${messages.brand}`,
    },
    { name: "description", content: messages.index.description },
    { property: "og:title", content: messages.index.title },
    { property: "og:description", content: messages.index.description },
    { property: "og:type", content: "website" },
    { tagName: "link", rel: "canonical", href: loaderData.canonicalUrl },
  ];
}

export const headers = publicPageHeaders;

export default function SnippetsIndex({ loaderData }: Route.ComponentProps) {
  const messages = getMessages(loaderData.locale);
  const localeSegment = toLocaleSegment(loaderData.locale);

  return (
    <main className="listing-page">
      <header className="listing-header">
        <p className="eyebrow">{messages.index.eyebrow}</p>
        <h1>{messages.index.title}</h1>
        <p>{messages.index.description}</p>
      </header>

      {loaderData.cards.length ? (
        <div className="snippet-grid listing-grid">
          {loaderData.cards.map((card) => (
            <SnippetCard
              card={card}
              key={card.id}
              locale={loaderData.locale}
              messages={messages}
            />
          ))}
        </div>
      ) : (
        <div className="empty-library empty-library-large">
          <span className="empty-icon" aria-hidden="true">
            ◇
          </span>
          <div>
            <h2>{messages.index.emptyTitle}</h2>
            <p>{messages.index.emptyDescription}</p>
          </div>
        </div>
      )}

      {loaderData.page > 1 || loaderData.hasNextPage ? (
        <nav className="pagination" aria-label="Pagination">
          {loaderData.page > 1 ? (
            <Link to={`/${localeSegment}/snippets?page=${loaderData.page - 1}`}>
              ← {messages.index.previous}
            </Link>
          ) : (
            <span />
          )}
          {loaderData.hasNextPage ? (
            <Link to={`/${localeSegment}/snippets?page=${loaderData.page + 1}`}>
              {messages.index.next} →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
