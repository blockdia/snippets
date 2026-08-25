import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  text(name)
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

const metadata = <T extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
) => text(name, { mode: "json" }).$type<T | null>();

export interface SnippetRevisionMetadata extends Record<string, unknown> {
  previewScriptKey?: string;
}

export const locales = sqliteTable(
  "locales",
  {
    code: text("code").primaryKey(),
    urlSegment: text("url_segment").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("locales_url_segment_unique").on(table.urlSegment),
    check("locales_code_not_empty", sql`${table.code} <> ''`),
    check("locales_code_no_underscore", sql`${table.code} NOT GLOB '*_*'`),
    check(
      "locales_url_segment_canonical",
      sql`${table.urlSegment} <> '' AND ${table.urlSegment} = lower(${table.urlSegment}) AND ${table.urlSegment} NOT GLOB '*_*'`,
    ),
  ],
);

export const snippets = sqliteTable(
  "snippets",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("snippets_slug_unique").on(table.slug),
    check(
      "snippets_slug_canonical",
      sql`${table.slug} <> '' AND ${table.slug} = lower(${table.slug}) AND ${table.slug} NOT GLOB '*[^a-z0-9-]*' AND ${table.slug} NOT GLOB '-*' AND ${table.slug} NOT GLOB '*-' AND ${table.slug} NOT GLOB '*--*'`,
    ),
    check(
      "snippets_status_valid",
      sql`${table.status} IN ('active', 'archived')`,
    ),
    check(
      "snippets_archive_consistent",
      sql`(${table.status} = 'archived' AND ${table.archivedAt} IS NOT NULL) OR (${table.status} = 'active' AND ${table.archivedAt} IS NULL)`,
    ),
  ],
);

export const snippetRevisions = sqliteTable(
  "snippet_revisions",
  {
    id: text("id").primaryKey(),
    snippetId: text("snippet_id")
      .notNull()
      .references(() => snippets.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    status: text("status", {
      enum: ["draft", "published", "withdrawn"],
    })
      .notNull()
      .default("draft"),
    contentSchemaVersion: integer("content_schema_version")
      .notNull()
      .default(1),
    representation: text("representation", {
      enum: ["scratchblocks", "scratch-blocks-ast"],
    })
      .notNull()
      .default("scratchblocks"),
    representationVersion: integer("representation_version")
      .notNull()
      .default(1),
    contentHash: text("content_hash").notNull(),
    translationBasisHash: text("translation_basis_hash").notNull(),
    changeSummary: text("change_summary"),
    codeLicense: text("code_license").notNull().default("CC0-1.0"),
    sourceKind: text("source_kind", {
      enum: ["editorial", "legacy-import", "user-submission", "api"],
    })
      .notNull()
      .default("editorial"),
    sourceRef: text("source_ref"),
    metadata: metadata<SnippetRevisionMetadata>("metadata"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at"),
    publishedAt: text("published_at"),
  },
  (table) => [
    uniqueIndex("snippet_revisions_number_unique").on(
      table.snippetId,
      table.revisionNumber,
    ),
    uniqueIndex("snippet_revisions_owner_unique").on(table.snippetId, table.id),
    index("snippet_revisions_status_idx").on(table.snippetId, table.status),
    check(
      "snippet_revisions_number_positive",
      sql`${table.revisionNumber} > 0`,
    ),
    check(
      "snippet_revisions_schema_version_positive",
      sql`${table.contentSchemaVersion} > 0 AND ${table.representationVersion} > 0`,
    ),
    check(
      "snippet_revisions_status_valid",
      sql`${table.status} IN ('draft', 'published', 'withdrawn')`,
    ),
    check(
      "snippet_revisions_representation_valid",
      sql`${table.representation} IN ('scratchblocks', 'scratch-blocks-ast')`,
    ),
    check(
      "snippet_revisions_source_kind_valid",
      sql`${table.sourceKind} IN ('editorial', 'legacy-import', 'user-submission', 'api')`,
    ),
    check(
      "snippet_revisions_hashes_not_empty",
      sql`${table.contentHash} <> '' AND ${table.translationBasisHash} GLOB 'translation-basis-v*:*'`,
    ),
    check(
      "snippet_revisions_publication_consistent",
      sql`(${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL) OR (${table.status} <> 'published')`,
    ),
  ],
);

export const snippetRevisionScripts = sqliteTable(
  "snippet_revision_scripts",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => snippetRevisions.id, { onDelete: "cascade" }),
    scriptKey: text("script_key").notNull(),
    position: integer("position").notNull(),
    source: text("source").notNull(),
    metadata: metadata("metadata"),
  },
  (table) => [
    uniqueIndex("snippet_revision_scripts_key_unique").on(
      table.revisionId,
      table.scriptKey,
    ),
    uniqueIndex("snippet_revision_scripts_position_unique").on(
      table.revisionId,
      table.position,
    ),
    index("snippet_revision_scripts_revision_idx").on(
      table.revisionId,
      table.position,
    ),
    check(
      "snippet_revision_scripts_key_not_empty",
      sql`${table.scriptKey} <> ''`,
    ),
    check(
      "snippet_revision_scripts_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
    check(
      "snippet_revision_scripts_source_not_empty",
      sql`${table.source} <> ''`,
    ),
  ],
);

export const snippetRevisionTranslationUnits = sqliteTable(
  "snippet_revision_translation_units",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => snippetRevisions.id, { onDelete: "cascade" }),
    unitKey: text("unit_key").notNull(),
    kind: text("kind", {
      enum: ["script-title", "symbol", "procedure", "comment", "reference"],
    }).notNull(),
    position: integer("position").notNull(),
    sourceText: text("source_text").notNull(),
    metadata: metadata("metadata"),
  },
  (table) => [
    uniqueIndex("snippet_revision_units_key_unique").on(
      table.revisionId,
      table.unitKey,
    ),
    uniqueIndex("snippet_revision_units_position_unique").on(
      table.revisionId,
      table.position,
    ),
    index("snippet_revision_units_revision_idx").on(
      table.revisionId,
      table.position,
    ),
    check("snippet_revision_units_key_not_empty", sql`${table.unitKey} <> ''`),
    check(
      "snippet_revision_units_kind_valid",
      sql`${table.kind} IN ('script-title', 'symbol', 'procedure', 'comment', 'reference')`,
    ),
    check(
      "snippet_revision_units_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
  ],
);

export const snippetRevisionSymbols = sqliteTable(
  "snippet_revision_symbols",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => snippetRevisions.id, { onDelete: "cascade" }),
    symbolKey: text("symbol_key").notNull(),
    kind: text("kind", {
      enum: ["variable", "list", "broadcast", "custom-argument"],
    }).notNull(),
    scope: text("scope", {
      enum: ["global", "sprite", "local", "choose"],
    }).notNull(),
    nameUnitKey: text("name_unit_key").notNull(),
    position: integer("position").notNull(),
    metadata: metadata("metadata"),
  },
  (table) => [
    uniqueIndex("snippet_revision_symbols_key_unique").on(
      table.revisionId,
      table.symbolKey,
    ),
    index("snippet_revision_symbols_revision_idx").on(
      table.revisionId,
      table.position,
    ),
    check(
      "snippet_revision_symbols_key_not_empty",
      sql`${table.symbolKey} <> ''`,
    ),
    check(
      "snippet_revision_symbols_kind_valid",
      sql`${table.kind} IN ('variable', 'list', 'broadcast', 'custom-argument')`,
    ),
    check(
      "snippet_revision_symbols_scope_valid",
      sql`${table.scope} IN ('global', 'sprite', 'local', 'choose')`,
    ),
    check(
      "snippet_revision_symbols_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
  ],
);

export const snippetRevisionReferences = sqliteTable(
  "snippet_revision_references",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => snippetRevisions.id, { onDelete: "cascade" }),
    referenceKey: text("reference_key").notNull(),
    kind: text("kind", {
      enum: ["article", "project", "video", "extension", "repository", "other"],
    })
      .notNull()
      .default("other"),
    url: text("url").notNull(),
    titleUnitKey: text("title_unit_key").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("snippet_revision_references_key_unique").on(
      table.revisionId,
      table.referenceKey,
    ),
    index("snippet_revision_references_revision_idx").on(
      table.revisionId,
      table.position,
    ),
    check(
      "snippet_revision_references_kind_valid",
      sql`${table.kind} IN ('article', 'project', 'video', 'extension', 'repository', 'other')`,
    ),
    check("snippet_revision_references_url_not_empty", sql`${table.url} <> ''`),
    check(
      "snippet_revision_references_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
  ],
);

export const snippetLocalizations = sqliteTable(
  "snippet_localizations",
  {
    id: text("id").primaryKey(),
    snippetId: text("snippet_id")
      .notNull()
      .references(() => snippets.id, { onDelete: "cascade" }),
    locale: text("locale")
      .notNull()
      .references(() => locales.code, { onDelete: "restrict" }),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("snippet_localizations_locale_unique").on(
      table.snippetId,
      table.locale,
    ),
    uniqueIndex("snippet_localizations_owner_unique").on(
      table.snippetId,
      table.id,
    ),
    index("snippet_localizations_locale_idx").on(table.locale, table.snippetId),
  ],
);

export const snippetLocalizationRevisions = sqliteTable(
  "snippet_localization_revisions",
  {
    id: text("id").primaryKey(),
    localizationId: text("localization_id")
      .notNull()
      .references(() => snippetLocalizations.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    status: text("status", {
      enum: ["draft", "published", "withdrawn"],
    })
      .notNull()
      .default("draft"),
    translationBasisHash: text("translation_basis_hash").notNull(),
    sourceRevisionId: text("source_revision_id").references(
      () => snippetRevisions.id,
      { onDelete: "restrict" },
    ),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    bodyMarkdown: text("body_markdown").notNull().default(""),
    keywords: text("keywords", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    proseLicense: text("prose_license").notNull().default("CC-BY-SA-4.0"),
    sourceKind: text("source_kind", {
      enum: ["editorial", "legacy-import", "user-submission", "api"],
    })
      .notNull()
      .default("editorial"),
    sourceRef: text("source_ref"),
    metadata: metadata("metadata"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at"),
    publishedAt: text("published_at"),
  },
  (table) => [
    uniqueIndex("snippet_localization_revisions_number_unique").on(
      table.localizationId,
      table.revisionNumber,
    ),
    uniqueIndex("snippet_localization_revisions_owner_unique").on(
      table.localizationId,
      table.id,
    ),
    index("snippet_localization_revisions_basis_idx").on(
      table.localizationId,
      table.translationBasisHash,
      table.status,
    ),
    check(
      "snippet_localization_revisions_number_positive",
      sql`${table.revisionNumber} > 0`,
    ),
    check(
      "snippet_localization_revisions_status_valid",
      sql`${table.status} IN ('draft', 'published', 'withdrawn')`,
    ),
    check(
      "snippet_localization_revisions_basis_valid",
      sql`${table.translationBasisHash} GLOB 'translation-basis-v*:*'`,
    ),
    check(
      "snippet_localization_revisions_source_kind_valid",
      sql`${table.sourceKind} IN ('editorial', 'legacy-import', 'user-submission', 'api')`,
    ),
    check(
      "snippet_localization_revisions_content_not_empty",
      sql`${table.title} <> '' AND ${table.summary} <> ''`,
    ),
    check(
      "snippet_localization_revisions_publication_consistent",
      sql`(${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL) OR (${table.status} <> 'published')`,
    ),
  ],
);

export const snippetLocalizationRevisionScripts = sqliteTable(
  "snippet_localization_revision_scripts",
  {
    id: text("id").primaryKey(),
    localizationRevisionId: text("localization_revision_id")
      .notNull()
      .references(() => snippetLocalizationRevisions.id, {
        onDelete: "cascade",
      }),
    scriptKey: text("script_key").notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    uniqueIndex("snippet_localization_scripts_key_unique").on(
      table.localizationRevisionId,
      table.scriptKey,
    ),
    index("snippet_localization_scripts_revision_idx").on(
      table.localizationRevisionId,
    ),
    check(
      "snippet_localization_scripts_key_not_empty",
      sql`${table.scriptKey} <> ''`,
    ),
    check(
      "snippet_localization_scripts_source_not_empty",
      sql`${table.source} <> ''`,
    ),
  ],
);

export const snippetLocalizationRevisionUnits = sqliteTable(
  "snippet_localization_revision_units",
  {
    id: text("id").primaryKey(),
    localizationRevisionId: text("localization_revision_id")
      .notNull()
      .references(() => snippetLocalizationRevisions.id, {
        onDelete: "cascade",
      }),
    unitKey: text("unit_key").notNull(),
    translatedText: text("translated_text").notNull(),
  },
  (table) => [
    uniqueIndex("snippet_localization_units_key_unique").on(
      table.localizationRevisionId,
      table.unitKey,
    ),
    index("snippet_localization_units_revision_idx").on(
      table.localizationRevisionId,
    ),
    check(
      "snippet_localization_units_key_not_empty",
      sql`${table.unitKey} <> ''`,
    ),
  ],
);

export const snippetPublications = sqliteTable(
  "snippet_publications",
  {
    snippetId: text("snippet_id")
      .primaryKey()
      .references(() => snippets.id, { onDelete: "cascade" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => snippetRevisions.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at"),
  },
  (table) => [
    uniqueIndex("snippet_publications_revision_unique").on(table.revisionId),
    foreignKey({
      columns: [table.snippetId, table.revisionId],
      foreignColumns: [snippetRevisions.snippetId, snippetRevisions.id],
      name: "snippet_publications_owned_revision_fk",
    }).onDelete("restrict"),
  ],
);

export const snippetLocalizationPublications = sqliteTable(
  "snippet_localization_publications",
  {
    localizationId: text("localization_id")
      .primaryKey()
      .references(() => snippetLocalizations.id, { onDelete: "cascade" }),
    localizationRevisionId: text("localization_revision_id")
      .notNull()
      .references(() => snippetLocalizationRevisions.id, {
        onDelete: "restrict",
      }),
    publishedAt: timestamp("published_at"),
  },
  (table) => [
    uniqueIndex("snippet_localization_publications_revision_unique").on(
      table.localizationRevisionId,
    ),
    foreignKey({
      columns: [table.localizationId, table.localizationRevisionId],
      foreignColumns: [
        snippetLocalizationRevisions.localizationId,
        snippetLocalizationRevisions.id,
      ],
      name: "snippet_localization_publications_owned_revision_fk",
    }).onDelete("restrict"),
  ],
);

export const contributors = sqliteTable(
  "contributors",
  {
    id: text("id").primaryKey(),
    kind: text("kind", {
      enum: ["user", "github", "scratch", "name", "organization"],
    }).notNull(),
    externalId: text("external_id"),
    displayName: text("display_name").notNull(),
    profileUrl: text("profile_url"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("contributors_external_unique").on(
      table.kind,
      table.externalId,
    ),
    check(
      "contributors_kind_valid",
      sql`${table.kind} IN ('user', 'github', 'scratch', 'name', 'organization')`,
    ),
    check(
      "contributors_display_name_not_empty",
      sql`${table.displayName} <> ''`,
    ),
  ],
);

export const snippetRevisionContributors = sqliteTable(
  "snippet_revision_contributors",
  {
    revisionId: text("revision_id")
      .notNull()
      .references(() => snippetRevisions.id, { onDelete: "cascade" }),
    contributorId: text("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "restrict" }),
    role: text("role", { enum: ["author", "maintainer", "source"] })
      .notNull()
      .default("author"),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.revisionId, table.contributorId, table.role],
    }),
    index("snippet_revision_contributors_revision_idx").on(
      table.revisionId,
      table.position,
    ),
    check(
      "snippet_revision_contributors_role_valid",
      sql`${table.role} IN ('author', 'maintainer', 'source')`,
    ),
    check(
      "snippet_revision_contributors_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
  ],
);

export const snippetLocalizationRevisionContributors = sqliteTable(
  "snippet_localization_revision_contributors",
  {
    localizationRevisionId: text("localization_revision_id")
      .notNull()
      .references(() => snippetLocalizationRevisions.id, {
        onDelete: "cascade",
      }),
    contributorId: text("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "restrict" }),
    role: text("role", { enum: ["translator", "reviewer", "source"] })
      .notNull()
      .default("translator"),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.localizationRevisionId, table.contributorId, table.role],
    }),
    index("snippet_localization_contributors_revision_idx").on(
      table.localizationRevisionId,
      table.position,
    ),
    check(
      "snippet_localization_contributors_role_valid",
      sql`${table.role} IN ('translator', 'reviewer', 'source')`,
    ),
    check(
      "snippet_localization_contributors_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("tags_slug_unique").on(table.slug),
    check(
      "tags_slug_canonical",
      sql`${table.slug} <> '' AND ${table.slug} = lower(${table.slug}) AND ${table.slug} NOT GLOB '*[^a-z0-9-]*'`,
    ),
  ],
);

export const tagLocalizations = sqliteTable(
  "tag_localizations",
  {
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    locale: text("locale")
      .notNull()
      .references(() => locales.code, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
  },
  (table) => [
    primaryKey({ columns: [table.tagId, table.locale] }),
    index("tag_localizations_locale_idx").on(table.locale, table.name),
    check("tag_localizations_name_not_empty", sql`${table.name} <> ''`),
  ],
);

export const snippetRevisionTags = sqliteTable(
  "snippet_revision_tags",
  {
    revisionId: text("revision_id")
      .notNull()
      .references(() => snippetRevisions.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.tagId] }),
    index("snippet_revision_tags_revision_idx").on(
      table.revisionId,
      table.position,
    ),
    index("snippet_revision_tags_tag_idx").on(table.tagId, table.revisionId),
    check(
      "snippet_revision_tags_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
  ],
);

export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => snippetRevisions.id, { onDelete: "cascade" }),
    artifactKey: text("artifact_key").notNull(),
    kind: text("kind", { enum: ["sb3", "image", "attachment"] }).notNull(),
    storage: text("storage", { enum: ["static", "r2"] }).notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    license: text("license").notNull().default("CC-BY-4.0"),
    attribution: text("attribution"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("artifacts_key_unique").on(table.revisionId, table.artifactKey),
    index("artifacts_revision_idx").on(table.revisionId),
    check(
      "artifacts_kind_valid",
      sql`${table.kind} IN ('sb3', 'image', 'attachment')`,
    ),
    check("artifacts_storage_valid", sql`${table.storage} IN ('static', 'r2')`),
    check("artifacts_size_nonnegative", sql`${table.byteSize} >= 0`),
    check(
      "artifacts_integrity_not_empty",
      sql`${table.storageKey} <> '' AND ${table.sha256} <> ''`,
    ),
  ],
);

export const searchDocuments = sqliteTable(
  "search_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snippetId: text("snippet_id")
      .notNull()
      .references(() => snippets.id, { onDelete: "cascade" }),
    locale: text("locale")
      .notNull()
      .references(() => locales.code, { onDelete: "restrict" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => snippetRevisions.id, { onDelete: "cascade" }),
    localizationRevisionId: text("localization_revision_id")
      .notNull()
      .references(() => snippetLocalizationRevisions.id, {
        onDelete: "cascade",
      }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    body: text("body").notNull().default(""),
    keywords: text("keywords").notNull().default(""),
    scripts: text("scripts").notNull().default(""),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("search_documents_snippet_locale_unique").on(
      table.snippetId,
      table.locale,
    ),
    uniqueIndex("search_documents_localization_revision_unique").on(
      table.localizationRevisionId,
    ),
    index("search_documents_locale_idx").on(table.locale, table.snippetId),
  ],
);

export type Snippet = typeof snippets.$inferSelect;
export type SnippetRevision = typeof snippetRevisions.$inferSelect;
export type SnippetLocalization = typeof snippetLocalizations.$inferSelect;
export type SnippetLocalizationRevision =
  typeof snippetLocalizationRevisions.$inferSelect;
