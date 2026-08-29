import { Link } from "react-router";

import type { Route } from "./+types/locale-home";
import { HeroBlocks } from "../components/hero-blocks";
import { SnippetCard } from "../components/snippet-card";
import { getMessages } from "../i18n/messages";
import { toLocaleSegment } from "../i18n/locales";
import { platformContext } from "../platform/context";
import { requireRouteLocale, canonicalUrl } from "../routing/locale.server";
import { listPublishedSnippets } from "../services/snippets.server";
import { publicPageHeaders } from "../http/public-page";

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const locale = requireRouteLocale(params.locale);
  const { db } = context.get(platformContext);
  const cards = await listPublishedSnippets(db, locale, { limit: 6 });
  const localeSegment = toLocaleSegment(locale);
  return {
    locale,
    cards,
    canonicalUrl: canonicalUrl(request, `/${localeSegment}`),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  const messages = getMessages(loaderData.locale);
  return [
    { title: `${messages.brand} — ${messages.home.title}` },
    { name: "description", content: messages.home.description },
    { property: "og:title", content: messages.home.title },
    { property: "og:description", content: messages.home.description },
    { property: "og:type", content: "website" },
    { tagName: "link", rel: "canonical", href: loaderData.canonicalUrl },
  ];
}

export const headers = publicPageHeaders;

export default function LocaleHome({ loaderData }: Route.ComponentProps) {
  const messages = getMessages(loaderData.locale);
  const localeSegment = toLocaleSegment(loaderData.locale);

  return (
    <main>
      <section className="product-hero">
        <div className="hero-copy-block">
          <p className="eyebrow">{messages.home.eyebrow}</p>
          <h1>{messages.home.title}</h1>
          <p className="hero-copy">{messages.home.description}</p>
          <Link className="primary-button" to={`/${localeSegment}/snippets`}>
            {messages.home.primaryAction}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <HeroBlocks locale={loaderData.locale} />
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{messages.navigation.snippets}</p>
            <h2>{messages.home.latestTitle}</h2>
            <p>{messages.home.latestDescription}</p>
          </div>
          <Link className="text-link" to={`/${localeSegment}/snippets`}>
            {messages.home.primaryAction} <span aria-hidden="true">→</span>
          </Link>
        </div>

        {loaderData.cards.length ? (
          <div className="snippet-grid">
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
          <div className="empty-library">
            <span className="empty-icon" aria-hidden="true">
              ◇
            </span>
            <div>
              <h3>{messages.index.emptyTitle}</h3>
              <p>{messages.index.emptyDescription}</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
