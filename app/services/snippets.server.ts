import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { AppDatabase } from "../db/client";
import type { SnippetRevisionScriptMetadata } from "../db/schema";
import {
  artifacts,
  contributors,
  searchDocuments,
  snippetLocalizationPublications,
  snippetLocalizationRevisionContributors,
  snippetLocalizationRevisionScripts,
  snippetLocalizationRevisionUnits,
  snippetLocalizationRevisions,
  snippetLocalizations,
  snippetPublications,
  snippetRevisionContributors,
  snippetRevisionReferences,
  snippetRevisionScripts,
  snippetRevisionSymbols,
  snippetRevisionTags,
  snippetRevisionTranslationUnits,
  snippetRevisions,
  snippets,
  tagLocalizations,
  tags,
} from "../db/schema";
import { computeTranslationBasisHash } from "../domain/translation-basis";
import {
  CONTENT_FALLBACK_LOCALE,
  canonicalizeLocale,
  type Locale,
} from "../i18n/locales";
import { createCjkSearchTerms, createFtsQuery } from "../search/fts";

type SearchDocumentInsert = typeof searchDocuments.$inferInsert;

interface LocalizationDocumentSource {
  locale: string;
  localizationRevisionId: string;
  title: string;
  summary: string;
  body: string;
  keywords: string[];
}

function safePublicUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function r2ArtifactPath(storageKey: string): string | null {
  const match = /^sb3\/([a-f0-9]{64})\.sb3$/.exec(storageKey);
  return match ? `/artifacts/sb3/${match[1]}.sb3` : null;
}

export type PublicationErrorCode =
  | "NOT_FOUND"
  | "OWNERSHIP_MISMATCH"
  | "INVALID_STATE"
  | "INVALID_PREVIEW"
  | "LOCALE_MISMATCH"
  | "BASIS_MISMATCH"
  | "BASIS_INTEGRITY_MISMATCH"
  | "NO_CURRENT_REVISION";

export class PublicationError extends Error {
  constructor(
    public readonly code: PublicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PublicationError";
  }
}

export interface PublishSnippetRevisionInput {
  snippetId: string;
  revisionId: string;
  englishLocalizationRevisionId: string;
  publishedAt?: string;
}

export interface PublishLocalizationRevisionInput {
  localizationRevisionId: string;
  publishedAt?: string;
}

export interface PublishedSnippet {
  id: string;
  slug: string;
  revision: {
    id: string;
    number: number;
    representation: "scratchblocks" | "scratch-blocks-ast";
    representationVersion: number;
    translationBasisHash: string;
  };
  localization: {
    id: string;
    revisionId: string;
    requestedLocale: Locale;
    locale: Locale;
    fallbackUsed: boolean;
    title: string;
    summary: string;
    seoTitle: string | null;
    seoDescription: string | null;
    bodyMarkdown: string;
    keywords: string[];
  };
  publication: {
    publishedAt: string;
    updatedAt: string;
  };
  licenses: {
    code: string;
    prose: string;
  };
  contributors: {
    id: string;
    kind: "user" | "github" | "scratch" | "name" | "organization";
    displayName: string;
    profileUrl: string | null;
    roles: ("author" | "maintainer" | "source" | "translator" | "reviewer")[];
  }[];
  demo: {
    path: string;
    contentType: string;
    byteSize: number;
    sha256: string;
    license: string;
    attribution: string | null;
  } | null;
  scripts: {
    key: string;
    position: number;
    source: string;
    localized: boolean;
    importedFrom: {
      moduleId: string;
      scriptId: string;
      sourceSlug: string | null;
      sourceTitle: string | null;
    } | null;
  }[];
  translationUnits: {
    key: string;
    kind: string;
    position: number;
    sourceText: string;
    text: string;
    localized: boolean;
  }[];
  symbols: {
    key: string;
    kind: string;
    scope: string;
    nameUnitKey: string;
    position: number;
  }[];
  references: {
    key: string;
    kind: string;
    url: string;
    titleUnitKey: string;
    position: number;
  }[];
  tagSlugs: string[];
  availableLocales: Locale[];
}

export interface PublishedSnippetCard {
  id: string;
  slug: string;
  requestedLocale: Locale;
  locale: Locale;
  fallbackUsed: boolean;
  title: string;
  summary: string;
  updatedAt: string;
  previewSource: string | null;
}

export interface SearchResultPage {
  items: (PublishedSnippetCard & { rank: number })[];
  total: number;
}

export interface SearchTag {
  slug: string;
  name: string;
  snippetCount: number;
}

export async function searchPublishedSnippets(
  db: AppDatabase,
  requestedLocale: Locale,
  options: {
    query: string;
    tagSlug?: string | null;
    limit?: number;
    offset?: number;
  },
): Promise<SearchResultPage> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const tagSlug = options.tagSlug || null;
  const query = options.query.trim().slice(0, 200);
  const ftsQuery = createFtsQuery(query);

  if (query && !ftsQuery) return { items: [], total: 0 };

  type SearchRow = {
    id: string;
    slug: string;
    locale: string;
    title: string;
    summary: string;
    updatedAt: string;
    previewSource: string | null;
    rank: number;
  };
  type CountRow = { total: number };

  const eligibleDocuments = sql`
    SELECT sd.id AS document_id
    FROM ${searchDocuments} AS sd
    WHERE
      sd.locale = ${requestedLocale}
      OR (
        sd.locale = ${CONTENT_FALLBACK_LOCALE}
        AND NOT EXISTS (
          SELECT 1
          FROM ${searchDocuments} AS preferred
          WHERE preferred.snippet_id = sd.snippet_id
            AND preferred.locale = ${requestedLocale}
        )
      )
  `;

  const previewSource = sql`
    (
      SELECT coalesce(localized_preview.source, source_preview.source)
      FROM ${snippetPublications} AS preview_publication
      INNER JOIN ${snippetRevisions} AS preview_revision
        ON preview_revision.id = preview_publication.revision_id
      INNER JOIN ${snippetRevisionScripts} AS source_preview
        ON source_preview.revision_id = preview_publication.revision_id
      LEFT JOIN ${snippetLocalizationRevisionScripts} AS localized_preview
        ON localized_preview.localization_revision_id = sd.localization_revision_id
        AND localized_preview.script_key = source_preview.script_key
      WHERE preview_publication.snippet_id = sd.snippet_id
      ORDER BY
        CASE
          WHEN json_type(preview_revision.metadata, '$.previewScriptKey') = 'text'
            AND source_preview.script_key = json_extract(preview_revision.metadata, '$.previewScriptKey')
          THEN 0
          ELSE 1
        END,
        source_preview.position ASC
      LIMIT 1
    )
  `;

  const tagPredicate = sql`
    AND (
      ${tagSlug} IS NULL
      OR EXISTS (
        SELECT 1
        FROM ${snippetPublications} AS current_publication
        INNER JOIN ${snippetRevisionTags} AS revision_tag
          ON revision_tag.revision_id = current_publication.revision_id
        INNER JOIN ${tags} AS filter_tag ON filter_tag.id = revision_tag.tag_id
        WHERE current_publication.snippet_id = sd.snippet_id
          AND filter_tag.slug = ${tagSlug}
      )
    )
  `;

  const [rows, countRows] = ftsQuery
    ? await Promise.all([
        db.all<SearchRow>(sql`
        WITH eligible AS (${eligibleDocuments})
        SELECT
          sd.snippet_id AS id,
          s.slug AS slug,
          sd.locale AS locale,
          sd.title AS title,
          sd.summary AS summary,
          sd.updated_at AS updatedAt,
          ${previewSource} AS previewSource,
          bm25(snippet_search_fts, 8.0, 4.0, 1.0, 3.0, 2.0) AS rank
        FROM snippet_search_fts
        INNER JOIN eligible ON eligible.document_id = snippet_search_fts.rowid
        INNER JOIN ${searchDocuments} AS sd ON sd.id = snippet_search_fts.rowid
        INNER JOIN ${snippets} AS s ON s.id = sd.snippet_id
        WHERE snippet_search_fts MATCH ${ftsQuery}
          AND s.status = 'active'
          ${tagPredicate}
        ORDER BY rank ASC, sd.updated_at DESC, sd.snippet_id ASC
        LIMIT ${limit} OFFSET ${offset}
      `),
        db.all<CountRow>(sql`
          WITH eligible AS (${eligibleDocuments})
          SELECT count(*) AS total
          FROM snippet_search_fts
          INNER JOIN eligible ON eligible.document_id = snippet_search_fts.rowid
          INNER JOIN ${searchDocuments} AS sd ON sd.id = snippet_search_fts.rowid
          INNER JOIN ${snippets} AS s ON s.id = sd.snippet_id
          WHERE snippet_search_fts MATCH ${ftsQuery}
            AND s.status = 'active'
            ${tagPredicate}
        `),
      ])
    : await Promise.all([
        db.all<SearchRow>(sql`
        WITH eligible AS (${eligibleDocuments})
        SELECT
          sd.snippet_id AS id,
          s.slug AS slug,
          sd.locale AS locale,
          sd.title AS title,
          sd.summary AS summary,
          sd.updated_at AS updatedAt,
          ${previewSource} AS previewSource,
          0 AS rank
        FROM eligible
        INNER JOIN ${searchDocuments} AS sd ON sd.id = eligible.document_id
        INNER JOIN ${snippets} AS s ON s.id = sd.snippet_id
        WHERE s.status = 'active'
          ${tagPredicate}
        ORDER BY sd.updated_at DESC, sd.snippet_id ASC
        LIMIT ${limit} OFFSET ${offset}
      `),
        db.all<CountRow>(sql`
          WITH eligible AS (${eligibleDocuments})
          SELECT count(*) AS total
          FROM eligible
          INNER JOIN ${searchDocuments} AS sd ON sd.id = eligible.document_id
          INNER JOIN ${snippets} AS s ON s.id = sd.snippet_id
          WHERE s.status = 'active'
            ${tagPredicate}
        `),
      ]);

  const items = rows.flatMap((row) => {
    const locale = canonicalizeLocale(row.locale);
    return locale
      ? [
          {
            id: row.id,
            slug: row.slug,
            requestedLocale,
            locale,
            fallbackUsed: locale !== requestedLocale,
            title: row.title,
            summary: row.summary,
            updatedAt: row.updatedAt,
            previewSource: row.previewSource,
            rank: row.rank,
          },
        ]
      : [];
  });

  return { items, total: countRows[0]?.total ?? 0 };
}

export async function listSearchTags(
  db: AppDatabase,
  requestedLocale: Locale,
): Promise<SearchTag[]> {
  return db.all<SearchTag>(sql`
    SELECT
      t.slug AS slug,
      coalesce(preferred.name, fallback.name, t.slug) AS name,
      count(DISTINCT p.snippet_id) AS snippetCount
    FROM ${tags} AS t
    INNER JOIN ${snippetRevisionTags} AS rt ON rt.tag_id = t.id
    INNER JOIN ${snippetPublications} AS p ON p.revision_id = rt.revision_id
    INNER JOIN ${snippets} AS s ON s.id = p.snippet_id AND s.status = 'active'
    LEFT JOIN ${tagLocalizations} AS preferred
      ON preferred.tag_id = t.id AND preferred.locale = ${requestedLocale}
    LEFT JOIN ${tagLocalizations} AS fallback
      ON fallback.tag_id = t.id AND fallback.locale = ${CONTENT_FALLBACK_LOCALE}
    GROUP BY t.id, t.slug, preferred.name, fallback.name
    ORDER BY name COLLATE NOCASE ASC, t.slug ASC
  `);
}

export async function listPublishedSnippets(
  db: AppDatabase,
  requestedLocale: Locale,
  options: { limit?: number; offset?: number } = {},
): Promise<PublishedSnippetCard[]> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await db.all<{
    id: string;
    slug: string;
    locale: string;
    title: string;
    summary: string;
    updatedAt: string;
    previewSource: string | null;
  }>(sql`
    SELECT
      sd.snippet_id AS id,
      s.slug AS slug,
      sd.locale AS locale,
      sd.title AS title,
      sd.summary AS summary,
      sd.updated_at AS updatedAt,
      (
        SELECT coalesce(localized_preview.source, source_preview.source)
        FROM ${snippetPublications} AS preview_publication
        INNER JOIN ${snippetRevisions} AS preview_revision
          ON preview_revision.id = preview_publication.revision_id
        INNER JOIN ${snippetRevisionScripts} AS source_preview
          ON source_preview.revision_id = preview_publication.revision_id
        LEFT JOIN ${snippetLocalizationRevisionScripts} AS localized_preview
          ON localized_preview.localization_revision_id = sd.localization_revision_id
          AND localized_preview.script_key = source_preview.script_key
        WHERE preview_publication.snippet_id = sd.snippet_id
        ORDER BY
          CASE
            WHEN json_type(preview_revision.metadata, '$.previewScriptKey') = 'text'
              AND source_preview.script_key = json_extract(preview_revision.metadata, '$.previewScriptKey')
            THEN 0
            ELSE 1
          END,
          source_preview.position ASC
        LIMIT 1
      ) AS previewSource
    FROM ${searchDocuments} AS sd
    INNER JOIN ${snippets} AS s ON s.id = sd.snippet_id
    WHERE s.status = 'active'
      AND (
        sd.locale = ${requestedLocale}
        OR (
          sd.locale = ${CONTENT_FALLBACK_LOCALE}
          AND NOT EXISTS (
            SELECT 1
            FROM ${searchDocuments} AS preferred
            WHERE preferred.snippet_id = sd.snippet_id
              AND preferred.locale = ${requestedLocale}
          )
        )
      )
    ORDER BY sd.updated_at DESC, sd.snippet_id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return rows.flatMap((row) => {
    const locale = canonicalizeLocale(row.locale);
    return locale
      ? [
          {
            ...row,
            requestedLocale,
            locale,
            fallbackUsed: locale !== requestedLocale,
          },
        ]
      : [];
  });
}

export async function publishSnippetRevision(
  db: AppDatabase,
  input: PublishSnippetRevisionInput,
): Promise<void> {
  const publishedAt = input.publishedAt ?? new Date().toISOString();

  const [revision] = await db
    .select({
      id: snippetRevisions.id,
      snippetId: snippetRevisions.snippetId,
      status: snippetRevisions.status,
      basis: snippetRevisions.translationBasisHash,
      representation: snippetRevisions.representation,
      representationVersion: snippetRevisions.representationVersion,
      metadata: snippetRevisions.metadata,
      snippetStatus: snippets.status,
    })
    .from(snippetRevisions)
    .innerJoin(snippets, eq(snippets.id, snippetRevisions.snippetId))
    .where(eq(snippetRevisions.id, input.revisionId))
    .limit(1);

  if (!revision) {
    throw new PublicationError("NOT_FOUND", "Snippet revision was not found");
  }
  if (revision.snippetId !== input.snippetId) {
    throw new PublicationError(
      "OWNERSHIP_MISMATCH",
      "Snippet revision does not belong to the requested snippet",
    );
  }
  if (revision.status === "withdrawn") {
    throw new PublicationError(
      "INVALID_STATE",
      "A withdrawn snippet revision cannot be published",
    );
  }
  if (revision.snippetStatus !== "active") {
    throw new PublicationError(
      "INVALID_STATE",
      "An archived snippet cannot publish a new revision",
    );
  }

  const previewScriptKey = revision.metadata?.previewScriptKey;
  if (
    previewScriptKey !== undefined &&
    (typeof previewScriptKey !== "string" ||
      !previewScriptKey.trim() ||
      previewScriptKey !== previewScriptKey.trim())
  ) {
    throw new PublicationError(
      "INVALID_PREVIEW",
      "Preview script key must be a non-empty canonical script key",
    );
  }
  if (previewScriptKey) {
    const [previewScript] = await db
      .select({ id: snippetRevisionScripts.id })
      .from(snippetRevisionScripts)
      .where(
        and(
          eq(snippetRevisionScripts.revisionId, revision.id),
          eq(snippetRevisionScripts.scriptKey, previewScriptKey),
        ),
      )
      .limit(1);
    if (!previewScript) {
      throw new PublicationError(
        "INVALID_PREVIEW",
        `Preview script ${previewScriptKey} does not exist in this revision`,
      );
    }
  }

  const computedBasis = await computeStoredTranslationBasisHash(
    db,
    revision.id,
    revision.representation,
    revision.representationVersion,
  );
  if (computedBasis !== revision.basis) {
    throw new PublicationError(
      "BASIS_INTEGRITY_MISMATCH",
      "Stored translation basis hash does not match revision content",
    );
  }

  const [english] = await db
    .select({
      id: snippetLocalizationRevisions.id,
      status: snippetLocalizationRevisions.status,
      basis: snippetLocalizationRevisions.translationBasisHash,
      localizationId: snippetLocalizations.id,
      snippetId: snippetLocalizations.snippetId,
      locale: snippetLocalizations.locale,
      title: snippetLocalizationRevisions.title,
      summary: snippetLocalizationRevisions.summary,
      body: snippetLocalizationRevisions.bodyMarkdown,
      keywords: snippetLocalizationRevisions.keywords,
    })
    .from(snippetLocalizationRevisions)
    .innerJoin(
      snippetLocalizations,
      eq(snippetLocalizations.id, snippetLocalizationRevisions.localizationId),
    )
    .where(
      eq(snippetLocalizationRevisions.id, input.englishLocalizationRevisionId),
    )
    .limit(1);

  if (!english) {
    throw new PublicationError(
      "NOT_FOUND",
      "English localization revision was not found",
    );
  }
  if (english.snippetId !== input.snippetId) {
    throw new PublicationError(
      "OWNERSHIP_MISMATCH",
      "English localization does not belong to the requested snippet",
    );
  }
  if (english.locale !== CONTENT_FALLBACK_LOCALE) {
    throw new PublicationError(
      "LOCALE_MISMATCH",
      "Code publication requires the global English fallback localization",
    );
  }
  if (english.basis !== revision.basis) {
    throw new PublicationError(
      "BASIS_MISMATCH",
      "English localization does not target the snippet revision basis",
    );
  }
  if (english.status === "withdrawn") {
    throw new PublicationError(
      "INVALID_STATE",
      "A withdrawn English localization cannot be published",
    );
  }

  const documents = await collectSearchDocuments(db, {
    snippetId: input.snippetId,
    revisionId: revision.id,
    basis: revision.basis,
    updatedAt: publishedAt,
    override: {
      locale: english.locale,
      localizationRevisionId: english.id,
      title: english.title,
      summary: english.summary,
      body: english.body,
      keywords: english.keywords,
    },
  });

  await db.batch([
    db
      .update(snippetRevisions)
      .set({
        status: "published",
        publishedAt: sql`coalesce(${snippetRevisions.publishedAt}, ${publishedAt})`,
      })
      .where(eq(snippetRevisions.id, revision.id)),
    db
      .update(snippetLocalizationRevisions)
      .set({
        status: "published",
        publishedAt: sql`coalesce(${snippetLocalizationRevisions.publishedAt}, ${publishedAt})`,
      })
      .where(eq(snippetLocalizationRevisions.id, english.id)),
    db
      .insert(snippetPublications)
      .values({
        snippetId: input.snippetId,
        revisionId: revision.id,
        publishedAt,
      })
      .onConflictDoUpdate({
        target: snippetPublications.snippetId,
        set: { revisionId: revision.id, publishedAt },
      }),
    db
      .insert(snippetLocalizationPublications)
      .values({
        localizationId: english.localizationId,
        localizationRevisionId: english.id,
        publishedAt,
      })
      .onConflictDoUpdate({
        target: snippetLocalizationPublications.localizationId,
        set: { localizationRevisionId: english.id, publishedAt },
      }),
    db
      .delete(searchDocuments)
      .where(eq(searchDocuments.snippetId, input.snippetId)),
    db.insert(searchDocuments).values(documents),
  ]);
}

export async function publishLocalizationRevision(
  db: AppDatabase,
  input: PublishLocalizationRevisionInput,
): Promise<void> {
  const publishedAt = input.publishedAt ?? new Date().toISOString();

  const [candidate] = await db
    .select({
      id: snippetLocalizationRevisions.id,
      status: snippetLocalizationRevisions.status,
      basis: snippetLocalizationRevisions.translationBasisHash,
      localizationId: snippetLocalizations.id,
      snippetId: snippetLocalizations.snippetId,
      locale: snippetLocalizations.locale,
      title: snippetLocalizationRevisions.title,
      summary: snippetLocalizationRevisions.summary,
      body: snippetLocalizationRevisions.bodyMarkdown,
      keywords: snippetLocalizationRevisions.keywords,
      currentRevisionId: snippetRevisions.id,
      currentBasis: snippetRevisions.translationBasisHash,
      snippetStatus: snippets.status,
    })
    .from(snippetLocalizationRevisions)
    .innerJoin(
      snippetLocalizations,
      eq(snippetLocalizations.id, snippetLocalizationRevisions.localizationId),
    )
    .innerJoin(snippets, eq(snippets.id, snippetLocalizations.snippetId))
    .leftJoin(
      snippetPublications,
      eq(snippetPublications.snippetId, snippetLocalizations.snippetId),
    )
    .leftJoin(
      snippetRevisions,
      eq(snippetRevisions.id, snippetPublications.revisionId),
    )
    .where(eq(snippetLocalizationRevisions.id, input.localizationRevisionId))
    .limit(1);

  if (!candidate) {
    throw new PublicationError(
      "NOT_FOUND",
      "Localization revision was not found",
    );
  }
  if (!candidate.currentRevisionId || !candidate.currentBasis) {
    throw new PublicationError(
      "NO_CURRENT_REVISION",
      "A localization cannot be published before its snippet",
    );
  }
  if (candidate.status === "withdrawn") {
    throw new PublicationError(
      "INVALID_STATE",
      "A withdrawn localization revision cannot be published",
    );
  }
  if (candidate.snippetStatus !== "active") {
    throw new PublicationError(
      "INVALID_STATE",
      "An archived snippet cannot publish a localization",
    );
  }
  if (candidate.basis !== candidate.currentBasis) {
    throw new PublicationError(
      "BASIS_MISMATCH",
      "Localization does not target the current snippet revision basis",
    );
  }

  const documents = await collectSearchDocuments(db, {
    snippetId: candidate.snippetId,
    revisionId: candidate.currentRevisionId,
    basis: candidate.currentBasis,
    updatedAt: publishedAt,
    override: {
      locale: candidate.locale,
      localizationRevisionId: candidate.id,
      title: candidate.title,
      summary: candidate.summary,
      body: candidate.body,
      keywords: candidate.keywords,
    },
  });

  await db.batch([
    db
      .update(snippetLocalizationRevisions)
      .set({
        status: "published",
        publishedAt: sql`coalesce(${snippetLocalizationRevisions.publishedAt}, ${publishedAt})`,
      })
      .where(eq(snippetLocalizationRevisions.id, candidate.id)),
    db
      .insert(snippetLocalizationPublications)
      .values({
        localizationId: candidate.localizationId,
        localizationRevisionId: candidate.id,
        publishedAt,
      })
      .onConflictDoUpdate({
        target: snippetLocalizationPublications.localizationId,
        set: {
          localizationRevisionId: candidate.id,
          publishedAt,
        },
      }),
    db
      .delete(searchDocuments)
      .where(eq(searchDocuments.snippetId, candidate.snippetId)),
    db.insert(searchDocuments).values(documents),
  ]);
}

export async function resolvePublishedSnippet(
  db: AppDatabase,
  slug: string,
  requestedLocale: Locale,
): Promise<PublishedSnippet | null> {
  const candidateLocales =
    requestedLocale === CONTENT_FALLBACK_LOCALE
      ? [CONTENT_FALLBACK_LOCALE]
      : [requestedLocale, CONTENT_FALLBACK_LOCALE];

  const [content] = await db
    .select({
      snippetId: snippets.id,
      slug: snippets.slug,
      revisionId: snippetRevisions.id,
      revisionNumber: snippetRevisions.revisionNumber,
      representation: snippetRevisions.representation,
      representationVersion: snippetRevisions.representationVersion,
      basis: snippetRevisions.translationBasisHash,
      codeLicense: snippetRevisions.codeLicense,
      codeUpdatedAt: snippetPublications.publishedAt,
      localizationId: snippetLocalizations.id,
      locale: snippetLocalizations.locale,
      localizationRevisionId: snippetLocalizationRevisions.id,
      title: snippetLocalizationRevisions.title,
      summary: snippetLocalizationRevisions.summary,
      seoTitle: snippetLocalizationRevisions.seoTitle,
      seoDescription: snippetLocalizationRevisions.seoDescription,
      bodyMarkdown: snippetLocalizationRevisions.bodyMarkdown,
      keywords: snippetLocalizationRevisions.keywords,
      proseLicense: snippetLocalizationRevisions.proseLicense,
      localizationUpdatedAt: snippetLocalizationPublications.publishedAt,
    })
    .from(snippets)
    .innerJoin(
      snippetPublications,
      eq(snippetPublications.snippetId, snippets.id),
    )
    .innerJoin(
      snippetRevisions,
      eq(snippetRevisions.id, snippetPublications.revisionId),
    )
    .innerJoin(
      snippetLocalizations,
      eq(snippetLocalizations.snippetId, snippets.id),
    )
    .innerJoin(
      snippetLocalizationPublications,
      eq(
        snippetLocalizationPublications.localizationId,
        snippetLocalizations.id,
      ),
    )
    .innerJoin(
      snippetLocalizationRevisions,
      eq(
        snippetLocalizationRevisions.id,
        snippetLocalizationPublications.localizationRevisionId,
      ),
    )
    .where(
      and(
        eq(snippets.slug, slug),
        eq(snippets.status, "active"),
        eq(snippetRevisions.status, "published"),
        eq(snippetLocalizationRevisions.status, "published"),
        eq(
          snippetLocalizationRevisions.translationBasisHash,
          snippetRevisions.translationBasisHash,
        ),
        inArray(snippetLocalizations.locale, candidateLocales),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${snippetLocalizations.locale} = ${requestedLocale} THEN 0 ELSE 1 END`,
    )
    .limit(1);

  if (!content) {
    return null;
  }

  const [
    scriptRows,
    unitRows,
    symbols,
    references,
    tagRows,
    localeRows,
    codeContributorRows,
    localizationContributorRows,
    publicationRows,
    demoRows,
  ] = await Promise.all([
    db
      .select({
        key: snippetRevisionScripts.scriptKey,
        position: snippetRevisionScripts.position,
        source: sql<string>`coalesce(${snippetLocalizationRevisionScripts.source}, ${snippetRevisionScripts.source})`,
        localized: sql<boolean>`${snippetLocalizationRevisionScripts.id} IS NOT NULL`,
        metadata: snippetRevisionScripts.metadata,
      })
      .from(snippetRevisionScripts)
      .leftJoin(
        snippetLocalizationRevisionScripts,
        and(
          eq(
            snippetLocalizationRevisionScripts.localizationRevisionId,
            content.localizationRevisionId,
          ),
          eq(
            snippetLocalizationRevisionScripts.scriptKey,
            snippetRevisionScripts.scriptKey,
          ),
        ),
      )
      .where(eq(snippetRevisionScripts.revisionId, content.revisionId))
      .orderBy(asc(snippetRevisionScripts.position)),
    db
      .select({
        key: snippetRevisionTranslationUnits.unitKey,
        kind: snippetRevisionTranslationUnits.kind,
        position: snippetRevisionTranslationUnits.position,
        sourceText: snippetRevisionTranslationUnits.sourceText,
        text: sql<string>`coalesce(${snippetLocalizationRevisionUnits.translatedText}, ${snippetRevisionTranslationUnits.sourceText})`,
        localized: sql<boolean>`${snippetLocalizationRevisionUnits.id} IS NOT NULL`,
      })
      .from(snippetRevisionTranslationUnits)
      .leftJoin(
        snippetLocalizationRevisionUnits,
        and(
          eq(
            snippetLocalizationRevisionUnits.localizationRevisionId,
            content.localizationRevisionId,
          ),
          eq(
            snippetLocalizationRevisionUnits.unitKey,
            snippetRevisionTranslationUnits.unitKey,
          ),
        ),
      )
      .where(eq(snippetRevisionTranslationUnits.revisionId, content.revisionId))
      .orderBy(asc(snippetRevisionTranslationUnits.position)),
    db
      .select({
        key: snippetRevisionSymbols.symbolKey,
        kind: snippetRevisionSymbols.kind,
        scope: snippetRevisionSymbols.scope,
        nameUnitKey: snippetRevisionSymbols.nameUnitKey,
        position: snippetRevisionSymbols.position,
      })
      .from(snippetRevisionSymbols)
      .where(eq(snippetRevisionSymbols.revisionId, content.revisionId))
      .orderBy(asc(snippetRevisionSymbols.position)),
    db
      .select({
        key: snippetRevisionReferences.referenceKey,
        kind: snippetRevisionReferences.kind,
        url: snippetRevisionReferences.url,
        titleUnitKey: snippetRevisionReferences.titleUnitKey,
        position: snippetRevisionReferences.position,
      })
      .from(snippetRevisionReferences)
      .where(eq(snippetRevisionReferences.revisionId, content.revisionId))
      .orderBy(asc(snippetRevisionReferences.position)),
    db
      .select({ slug: tags.slug, position: snippetRevisionTags.position })
      .from(snippetRevisionTags)
      .innerJoin(tags, eq(tags.id, snippetRevisionTags.tagId))
      .where(eq(snippetRevisionTags.revisionId, content.revisionId))
      .orderBy(asc(snippetRevisionTags.position)),
    db
      .select({ locale: snippetLocalizations.locale })
      .from(snippetLocalizations)
      .innerJoin(
        snippetLocalizationPublications,
        eq(
          snippetLocalizationPublications.localizationId,
          snippetLocalizations.id,
        ),
      )
      .innerJoin(
        snippetLocalizationRevisions,
        eq(
          snippetLocalizationRevisions.id,
          snippetLocalizationPublications.localizationRevisionId,
        ),
      )
      .where(
        and(
          eq(snippetLocalizations.snippetId, content.snippetId),
          eq(snippetLocalizationRevisions.status, "published"),
          eq(snippetLocalizationRevisions.translationBasisHash, content.basis),
        ),
      )
      .orderBy(asc(snippetLocalizations.locale)),
    db
      .select({
        id: contributors.id,
        kind: contributors.kind,
        displayName: contributors.displayName,
        profileUrl: contributors.profileUrl,
        role: snippetRevisionContributors.role,
        position: snippetRevisionContributors.position,
      })
      .from(snippetRevisionContributors)
      .innerJoin(
        contributors,
        eq(contributors.id, snippetRevisionContributors.contributorId),
      )
      .where(eq(snippetRevisionContributors.revisionId, content.revisionId))
      .orderBy(asc(snippetRevisionContributors.position)),
    db
      .select({
        id: contributors.id,
        kind: contributors.kind,
        displayName: contributors.displayName,
        profileUrl: contributors.profileUrl,
        role: snippetLocalizationRevisionContributors.role,
        position: snippetLocalizationRevisionContributors.position,
      })
      .from(snippetLocalizationRevisionContributors)
      .innerJoin(
        contributors,
        eq(
          contributors.id,
          snippetLocalizationRevisionContributors.contributorId,
        ),
      )
      .where(
        eq(
          snippetLocalizationRevisionContributors.localizationRevisionId,
          content.localizationRevisionId,
        ),
      )
      .orderBy(asc(snippetLocalizationRevisionContributors.position)),
    db
      .select({
        publishedAt: sql<string | null>`min(${snippetRevisions.publishedAt})`,
      })
      .from(snippetRevisions)
      .where(eq(snippetRevisions.snippetId, content.snippetId)),
    db
      .select({
        storageKey: artifacts.storageKey,
        contentType: artifacts.contentType,
        byteSize: artifacts.byteSize,
        sha256: artifacts.sha256,
        license: artifacts.license,
        attribution: artifacts.attribution,
      })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.revisionId, content.revisionId),
          eq(artifacts.artifactKey, "demo"),
          eq(artifacts.kind, "sb3"),
          eq(artifacts.storage, "r2"),
        ),
      )
      .limit(1),
  ]);

  const contributorMap = new Map<
    string,
    PublishedSnippet["contributors"][number]
  >();
  for (const contributor of [
    ...codeContributorRows,
    ...localizationContributorRows,
  ]) {
    const existing = contributorMap.get(contributor.id);
    if (existing) {
      if (!existing.roles.includes(contributor.role)) {
        existing.roles.push(contributor.role);
      }
      continue;
    }
    contributorMap.set(contributor.id, {
      id: contributor.id,
      kind: contributor.kind,
      displayName: contributor.displayName,
      profileUrl: safePublicUrl(contributor.profileUrl),
      roles: [contributor.role],
    });
  }

  function importedSourceFromMetadata(
    scriptMetadata: SnippetRevisionScriptMetadata | null,
  ): { moduleId: string; scriptId: string } | null {
    const importedFrom = scriptMetadata?.importedFrom;
    if (
      !importedFrom ||
      typeof importedFrom.moduleId !== "string" ||
      typeof importedFrom.scriptId !== "string" ||
      !importedFrom.moduleId ||
      !importedFrom.scriptId
    ) {
      return null;
    }
    return importedFrom;
  }

  const importedModuleIds = [
    ...new Set(
      scriptRows.flatMap((script) => {
        const importedFrom = importedSourceFromMetadata(script.metadata);
        return importedFrom ? [importedFrom.moduleId] : [];
      }),
    ),
  ];
  const sourceRows = importedModuleIds.length
    ? await db
        .select({
          slug: snippets.slug,
          title: snippetLocalizationRevisions.title,
        })
        .from(snippets)
        .innerJoin(
          snippetPublications,
          eq(snippetPublications.snippetId, snippets.id),
        )
        .innerJoin(
          snippetRevisions,
          eq(snippetRevisions.id, snippetPublications.revisionId),
        )
        .innerJoin(
          snippetLocalizations,
          eq(snippetLocalizations.snippetId, snippets.id),
        )
        .innerJoin(
          snippetLocalizationPublications,
          eq(
            snippetLocalizationPublications.localizationId,
            snippetLocalizations.id,
          ),
        )
        .innerJoin(
          snippetLocalizationRevisions,
          eq(
            snippetLocalizationRevisions.id,
            snippetLocalizationPublications.localizationRevisionId,
          ),
        )
        .where(
          and(
            inArray(snippets.slug, importedModuleIds),
            eq(snippets.status, "active"),
            eq(snippetRevisions.status, "published"),
            eq(snippetLocalizationRevisions.status, "published"),
            eq(
              snippetLocalizationRevisions.translationBasisHash,
              snippetRevisions.translationBasisHash,
            ),
            inArray(snippetLocalizations.locale, candidateLocales),
          ),
        )
        .orderBy(
          asc(snippets.slug),
          sql`CASE WHEN ${snippetLocalizations.locale} = ${requestedLocale} THEN 0 ELSE 1 END`,
        )
    : [];
  const publishedSources = new Map<string, { slug: string; title: string }>();
  for (const source of sourceRows) {
    if (!publishedSources.has(source.slug)) {
      publishedSources.set(source.slug, source);
    }
  }

  const resolvedLocale = content.locale as Locale;
  const demoPath = demoRows[0] ? r2ArtifactPath(demoRows[0].storageKey) : null;
  return {
    id: content.snippetId,
    slug: content.slug,
    revision: {
      id: content.revisionId,
      number: content.revisionNumber,
      representation: content.representation,
      representationVersion: content.representationVersion,
      translationBasisHash: content.basis,
    },
    localization: {
      id: content.localizationId,
      revisionId: content.localizationRevisionId,
      requestedLocale,
      locale: resolvedLocale,
      fallbackUsed: resolvedLocale !== requestedLocale,
      title: content.title,
      summary: content.summary,
      seoTitle: content.seoTitle,
      seoDescription: content.seoDescription,
      bodyMarkdown: content.bodyMarkdown,
      keywords: content.keywords,
    },
    publication: {
      publishedAt: publicationRows[0]?.publishedAt ?? content.codeUpdatedAt,
      updatedAt:
        content.codeUpdatedAt > content.localizationUpdatedAt
          ? content.codeUpdatedAt
          : content.localizationUpdatedAt,
    },
    licenses: {
      code: content.codeLicense,
      prose: content.proseLicense,
    },
    contributors: [...contributorMap.values()],
    demo:
      demoRows[0] && demoPath
        ? {
            path: demoPath,
            contentType: demoRows[0].contentType,
            byteSize: demoRows[0].byteSize,
            sha256: demoRows[0].sha256,
            license: demoRows[0].license,
            attribution:
              demoRows[0].attribution === "Legacy module contributors"
                ? null
                : demoRows[0].attribution,
          }
        : null,
    scripts: scriptRows.map(({ metadata, ...script }) => {
      const importedFrom = importedSourceFromMetadata(metadata);
      const publishedSource = importedFrom
        ? publishedSources.get(importedFrom.moduleId)
        : undefined;
      return {
        ...script,
        localized: Boolean(script.localized),
        importedFrom: importedFrom
          ? {
              ...importedFrom,
              sourceSlug: publishedSource?.slug ?? null,
              sourceTitle: publishedSource?.title ?? null,
            }
          : null,
      };
    }),
    translationUnits: unitRows.map((unit) => ({
      ...unit,
      localized: Boolean(unit.localized),
    })),
    symbols,
    references,
    tagSlugs: tagRows.map((tag) => tag.slug),
    availableLocales: localeRows.flatMap((row) => {
      const locale = canonicalizeLocale(row.locale);
      return locale ? [locale] : [];
    }),
  };
}

async function collectSearchDocuments(
  db: AppDatabase,
  input: {
    snippetId: string;
    revisionId: string;
    basis: string;
    updatedAt: string;
    override: LocalizationDocumentSource;
  },
): Promise<[SearchDocumentInsert, ...SearchDocumentInsert[]]> {
  const publishedLocalizations = await db
    .select({
      locale: snippetLocalizations.locale,
      localizationRevisionId: snippetLocalizationRevisions.id,
      title: snippetLocalizationRevisions.title,
      summary: snippetLocalizationRevisions.summary,
      body: snippetLocalizationRevisions.bodyMarkdown,
      keywords: snippetLocalizationRevisions.keywords,
    })
    .from(snippetLocalizations)
    .innerJoin(
      snippetLocalizationPublications,
      eq(
        snippetLocalizationPublications.localizationId,
        snippetLocalizations.id,
      ),
    )
    .innerJoin(
      snippetLocalizationRevisions,
      eq(
        snippetLocalizationRevisions.id,
        snippetLocalizationPublications.localizationRevisionId,
      ),
    )
    .where(
      and(
        eq(snippetLocalizations.snippetId, input.snippetId),
        eq(snippetLocalizationRevisions.status, "published"),
        eq(snippetLocalizationRevisions.translationBasisHash, input.basis),
      ),
    );

  const localizations = new Map<string, LocalizationDocumentSource>();
  for (const localization of publishedLocalizations) {
    localizations.set(localization.locale, localization);
  }
  localizations.set(input.override.locale, input.override);

  const documents: SearchDocumentInsert[] = [];
  for (const localization of localizations.values()) {
    const scripts = await db
      .select({
        source: sql<string>`coalesce(${snippetLocalizationRevisionScripts.source}, ${snippetRevisionScripts.source})`,
      })
      .from(snippetRevisionScripts)
      .leftJoin(
        snippetLocalizationRevisionScripts,
        and(
          eq(
            snippetLocalizationRevisionScripts.localizationRevisionId,
            localization.localizationRevisionId,
          ),
          eq(
            snippetLocalizationRevisionScripts.scriptKey,
            snippetRevisionScripts.scriptKey,
          ),
        ),
      )
      .where(eq(snippetRevisionScripts.revisionId, input.revisionId))
      .orderBy(asc(snippetRevisionScripts.position));

    documents.push({
      snippetId: input.snippetId,
      locale: localization.locale,
      revisionId: input.revisionId,
      localizationRevisionId: localization.localizationRevisionId,
      title: localization.title,
      summary: localization.summary,
      body: localization.body,
      keywords: [
        ...localization.keywords,
        ...createCjkSearchTerms([
          localization.title,
          localization.summary,
          localization.body,
          ...localization.keywords,
          ...scripts.map((script) => script.source),
        ]),
      ].join(" "),
      scripts: scripts.map((script) => script.source).join("\n"),
      updatedAt: input.updatedAt,
    });
  }

  const [first, ...rest] = documents;
  if (!first) {
    throw new PublicationError(
      "NOT_FOUND",
      "Publication requires at least one localization search document",
    );
  }
  return [first, ...rest];
}

async function computeStoredTranslationBasisHash(
  db: AppDatabase,
  revisionId: string,
  representation: "scratchblocks" | "scratch-blocks-ast",
  representationVersion: number,
): Promise<string> {
  const [scripts, units] = await Promise.all([
    db
      .select({
        key: snippetRevisionScripts.scriptKey,
        source: snippetRevisionScripts.source,
      })
      .from(snippetRevisionScripts)
      .where(eq(snippetRevisionScripts.revisionId, revisionId)),
    db
      .select({
        key: snippetRevisionTranslationUnits.unitKey,
        kind: snippetRevisionTranslationUnits.kind,
        sourceText: snippetRevisionTranslationUnits.sourceText,
      })
      .from(snippetRevisionTranslationUnits)
      .where(eq(snippetRevisionTranslationUnits.revisionId, revisionId)),
  ]);

  return computeTranslationBasisHash({
    representation,
    representationVersion,
    scripts,
    units,
  });
}
