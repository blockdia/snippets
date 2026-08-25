import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { AppDatabase } from "../db/client";
import {
  searchDocuments,
  snippetLocalizationPublications,
  snippetLocalizationRevisionScripts,
  snippetLocalizationRevisionUnits,
  snippetLocalizationRevisions,
  snippetLocalizations,
  snippetPublications,
  snippetRevisionReferences,
  snippetRevisionScripts,
  snippetRevisionSymbols,
  snippetRevisionTags,
  snippetRevisionTranslationUnits,
  snippetRevisions,
  snippets,
  tags,
} from "../db/schema";
import { computeTranslationBasisHash } from "../domain/translation-basis";
import { CONTENT_FALLBACK_LOCALE, type Locale } from "../i18n/locales";

type SearchDocumentInsert = typeof searchDocuments.$inferInsert;

interface LocalizationDocumentSource {
  locale: string;
  localizationRevisionId: string;
  title: string;
  summary: string;
  body: string;
  keywords: string[];
}

export type PublicationErrorCode =
  | "NOT_FOUND"
  | "OWNERSHIP_MISMATCH"
  | "INVALID_STATE"
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
  scripts: {
    key: string;
    position: number;
    source: string;
    localized: boolean;
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
      localizationId: snippetLocalizations.id,
      locale: snippetLocalizations.locale,
      localizationRevisionId: snippetLocalizationRevisions.id,
      title: snippetLocalizationRevisions.title,
      summary: snippetLocalizationRevisions.summary,
      seoTitle: snippetLocalizationRevisions.seoTitle,
      seoDescription: snippetLocalizationRevisions.seoDescription,
      bodyMarkdown: snippetLocalizationRevisions.bodyMarkdown,
      keywords: snippetLocalizationRevisions.keywords,
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

  const [scriptRows, unitRows, symbols, references, tagRows] =
    await Promise.all([
      db
        .select({
          key: snippetRevisionScripts.scriptKey,
          position: snippetRevisionScripts.position,
          source: sql<string>`coalesce(${snippetLocalizationRevisionScripts.source}, ${snippetRevisionScripts.source})`,
          localized: sql<boolean>`${snippetLocalizationRevisionScripts.id} IS NOT NULL`,
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
        .where(
          eq(snippetRevisionTranslationUnits.revisionId, content.revisionId),
        )
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
    ]);

  const resolvedLocale = content.locale as Locale;
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
    scripts: scriptRows.map((script) => ({
      ...script,
      localized: Boolean(script.localized),
    })),
    translationUnits: unitRows.map((unit) => ({
      ...unit,
      localized: Boolean(unit.localized),
    })),
    symbols,
    references,
    tagSlugs: tagRows.map((tag) => tag.slug),
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
      keywords: localization.keywords.join(" "),
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
