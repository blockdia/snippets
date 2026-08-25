import { Link } from "react-router";

import type { Messages } from "../i18n/messages";
import { toLocaleSegment, type Locale } from "../i18n/locales";
import type { PublishedSnippetCard } from "../services/snippets.server";

export function SnippetCard({
  card,
  locale,
  messages,
}: {
  card: PublishedSnippetCard;
  locale: Locale;
  messages: Messages;
}) {
  return (
    <Link
      className="snippet-card"
      to={`/${toLocaleSegment(locale)}/snippets/${card.slug}`}
    >
      <article className="snippet-card-content">
        <div className="snippet-card-topline">
          <span className="snippet-glyph" aria-hidden="true">
            ◆
          </span>
          {card.fallbackUsed ? (
            <span className="fallback-pill">{messages.card.fallback}</span>
          ) : null}
        </div>
        <div>
          <h3>{card.title}</h3>
          <p>{card.summary}</p>
        </div>
      </article>
    </Link>
  );
}
