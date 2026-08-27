import { and, eq, sql } from "drizzle-orm";

import type { AdminActor } from "../auth/admin";
import type { AppDatabase } from "../db/client";
import {
  artifacts,
  searchDocuments,
  snippetLocalizationPublications,
  snippetLocalizationRevisions,
  snippetLocalizations,
  snippetPublications,
  snippetRevisions,
  snippets,
} from "../db/schema";
import {
  computeContentHash,
  computeTranslationBasisHash,
  type TranslationUnitKind,
} from "../domain/translation-basis";
import {
  CONTENT_FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from "../i18n/locales";
import {
  publishLocalizationRevision,
  publishSnippetRevision,
} from "./snippets.server";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;
const MAX_DEMO_BYTES = 25 * 1024 * 1024;

type SnippetStatus = "active" | "archived";
type RevisionStatus = "draft" | "published" | "withdrawn";

export class AdminContentError extends Error {
  constructor(
    public readonly code:
      "CONFLICT" | "INVALID_INPUT" | "INVALID_STATE" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AdminContentError";
  }
}

export interface AdminScriptInput {
  key: string;
  title: string;
  source: string;
}

export interface AdminUnitInput {
  key: string;
  kind: TranslationUnitKind;
  sourceText: string;
}

export interface AdminReferenceInput {
  key: string;
  kind: "article" | "project" | "video" | "extension" | "repository" | "other";
  url: string;
  title: string;
}

export interface AdminContributorInput {
  id?: string;
  kind: "user" | "github" | "scratch" | "name" | "organization";
  displayName: string;
  externalId?: string;
  profileUrl?: string;
  role: "author" | "maintainer" | "source";
}

export interface AdminLocalizationInput {
  locale: Locale;
  title: string;
  summary: string;
  seoTitle: string;
  seoDescription: string;
  bodyMarkdown: string;
  keywords: string[];
  proseLicense: string;
  basisAccepted: boolean;
  scriptOverrides: { key: string; source: string }[];
  units: { key: string; translatedText: string }[];
}

export interface AdminSnippetDraftInput {
  snippetId?: string;
  revisionId?: string;
  slug: string;
  changeSummary: string;
  codeLicense: string;
  previewScriptKey: string;
  scripts: AdminScriptInput[];
  units: AdminUnitInput[];
  references: AdminReferenceInput[];
  contributors: AdminContributorInput[];
  tagIds: string[];
  localizations: AdminLocalizationInput[];
}

export interface AdminSnippetListItem {
  id: string;
  slug: string;
  status: SnippetStatus;
  title: string;
  updatedAt: string;
  publishedRevisionNumber: number | null;
  draftRevisionId: string | null;
  draftRevisionNumber: number | null;
  compatibleLocales: number;
}

export interface AdminDashboard {
  counts: {
    active: number;
    archived: number;
    drafts: number;
    published: number;
    needsTranslation: number;
  };
  recent: AdminSnippetListItem[];
}

export interface AdminTagRecord {
  id: string;
  slug: string;
  usageCount: number;
  localizations: Record<Locale, { name: string; description: string }>;
}

export interface AdminSnippetEditor {
  snippet: {
    id: string;
    slug: string;
    status: SnippetStatus;
    updatedAt: string;
    hasPublication: boolean;
  };
  revision: {
    id: string;
    number: number;
    status: RevisionStatus;
    representation: "scratchblocks" | "scratch-blocks-ast";
    representationVersion: number;
    translationBasisHash: string;
    changeSummary: string;
    codeLicense: string;
    previewScriptKey: string;
    createdBy: string | null;
    createdAt: string;
    publishedAt: string | null;
  };
  scripts: AdminScriptInput[];
  units: AdminUnitInput[];
  references: AdminReferenceInput[];
  contributors: AdminContributorInput[];
  tagIds: string[];
  localizations: (AdminLocalizationInput & {
    revisionId: string | null;
    revisionNumber: number | null;
    status: RevisionStatus | "missing";
    translationBasisHash: string | null;
    compatible: boolean;
  })[];
  demo: {
    byteSize: number;
    sha256: string;
    license: string;
    attribution: string;
  } | null;
  history: {
    id: string;
    number: number;
    status: RevisionStatus;
    changeSummary: string;
    createdBy: string | null;
    createdAt: string;
    publishedAt: string | null;
  }[];
}

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AdminContentError("INVALID_INPUT", `${field} 不能为空`);
  }
  return normalized;
}

function canonicalKey(value: string, field: string): string {
  const key = nonEmpty(value, field);
  if (!KEY_PATTERN.test(key)) {
    throw new AdminContentError(
      "INVALID_INPUT",
      `${field} 只能包含小写字母、数字及 . _ : -`,
    );
  }
  return key;
}

function unique<T>(values: T[], field: string): T[] {
  const set = new Set(values);
  if (set.size !== values.length) {
    throw new AdminContentError("INVALID_INPUT", `${field} 不能重复`);
  }
  return values;
}

function safePublicUrl(value: string, field: string): string {
  try {
    const url = new URL(nonEmpty(value, field));
    if (url.protocol !== "http:" && url.protocol !== "https:") throw null;
    return url.toString();
  } catch {
    throw new AdminContentError("INVALID_INPUT", `${field} 必须是 HTTP(S) URL`);
  }
}

function validateDraftInput(input: AdminSnippetDraftInput) {
  const slug = input.slug.trim();
  if (!SLUG_PATTERN.test(slug)) {
    throw new AdminContentError(
      "INVALID_INPUT",
      "Slug 必须由小写字母、数字和单个连字符组成",
    );
  }
  if (!input.scripts.length) {
    throw new AdminContentError("INVALID_INPUT", "至少需要一个 Scratch 脚本");
  }

  const scripts = input.scripts.map((script, index) => ({
    key: canonicalKey(script.key, `脚本 ${index + 1} 的 key`),
    title: nonEmpty(script.title, `脚本 ${index + 1} 的标题`),
    source: nonEmpty(script.source, `脚本 ${index + 1} 的代码`).replace(
      /\r\n?/g,
      "\n",
    ),
  }));
  unique(
    scripts.map((script) => script.key),
    "脚本 key",
  );

  const scriptTitleUnits: AdminUnitInput[] = scripts.map((script) => ({
    key: `script:${script.key}:title`,
    kind: "script-title",
    sourceText: script.title,
  }));
  const references = input.references.map((reference, index) => ({
    key: canonicalKey(reference.key, `参考链接 ${index + 1} 的 key`),
    kind: reference.kind,
    url: safePublicUrl(reference.url, `参考链接 ${index + 1}`),
    title: nonEmpty(reference.title, `参考链接 ${index + 1} 的标题`),
  }));
  unique(
    references.map((reference) => reference.key),
    "参考链接 key",
  );
  const referenceUnits: AdminUnitInput[] = references.map((reference) => ({
    key: `reference:${reference.key}:title`,
    kind: "reference",
    sourceText: reference.title,
  }));
  const advancedUnits = input.units
    .filter((unit) => unit.kind !== "script-title" && unit.kind !== "reference")
    .map((unit, index) => ({
      key: canonicalKey(unit.key, `翻译单元 ${index + 1} 的 key`),
      kind: unit.kind,
      sourceText: nonEmpty(unit.sourceText, `翻译单元 ${index + 1} 的原文`),
    }));
  const units = [...scriptTitleUnits, ...advancedUnits, ...referenceUnits];
  unique(
    units.map((unit) => unit.key),
    "翻译单元 key",
  );

  const previewScriptKey = input.previewScriptKey.trim();
  if (
    previewScriptKey &&
    !scripts.some((script) => script.key === previewScriptKey)
  ) {
    throw new AdminContentError(
      "INVALID_INPUT",
      "卡片预览脚本必须引用当前版本中的脚本",
    );
  }

  const localizations = input.localizations.map((localization) => ({
    ...localization,
    title: localization.title.trim(),
    summary: localization.summary.trim(),
    seoTitle: localization.seoTitle.trim(),
    seoDescription: localization.seoDescription.trim(),
    bodyMarkdown: localization.bodyMarkdown.replace(/\r\n?/g, "\n"),
    keywords: unique(
      localization.keywords.map((keyword) => keyword.trim()).filter(Boolean),
      `${localization.locale} 关键词`,
    ),
    proseLicense: nonEmpty(
      localization.proseLicense,
      `${localization.locale} 内容许可证`,
    ),
    scriptOverrides: localization.scriptOverrides
      .filter((override) => override.source.trim())
      .map((override) => ({
        key: canonicalKey(override.key, `${localization.locale} 脚本 key`),
        source: override.source.trim().replace(/\r\n?/g, "\n"),
      })),
    units: localization.units
      .filter((unit) => unit.translatedText.trim())
      .map((unit) => ({
        key: canonicalKey(unit.key, `${localization.locale} 翻译单元 key`),
        translatedText: unit.translatedText.trim(),
      })),
  }));
  unique(
    localizations.map((localization) => localization.locale),
    "语言",
  );
  const english = localizations.find(
    (localization) => localization.locale === CONTENT_FALLBACK_LOCALE,
  );
  if (!english?.title || !english.summary) {
    throw new AdminContentError(
      "INVALID_INPUT",
      "英文标题和摘要是保存及发布的必填基准",
    );
  }
  for (const localized of localizations) {
    if (
      localized.locale !== CONTENT_FALLBACK_LOCALE &&
      Boolean(localized.title) !== Boolean(localized.summary)
    ) {
      throw new AdminContentError(
        "INVALID_INPUT",
        `${localized.locale} 标题和摘要需要同时填写`,
      );
    }
  }

  const contributors = input.contributors.map((contributor, index) => ({
    ...contributor,
    displayName: nonEmpty(
      contributor.displayName,
      `贡献者 ${index + 1} 的名称`,
    ),
    externalId: contributor.externalId?.trim() || undefined,
    profileUrl: contributor.profileUrl
      ? safePublicUrl(contributor.profileUrl, `贡献者 ${index + 1} 的主页`)
      : undefined,
  }));

  return {
    ...input,
    slug,
    changeSummary: input.changeSummary.trim(),
    codeLicense: nonEmpty(input.codeLicense, "代码许可证"),
    previewScriptKey,
    scripts,
    units,
    references,
    contributors,
    tagIds: unique(input.tagIds.filter(Boolean), "标签"),
    localizations,
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export async function listAdminSnippets(
  db: AppDatabase,
  options: {
    query?: string;
    status?: "all" | "active" | "archived" | "draft";
  } = {},
): Promise<AdminSnippetListItem[]> {
  const query = options.query?.trim() ?? "";
  const status = options.status ?? "all";
  const result = await db.$client
    .prepare(
      `SELECT
        s.id,
        s.slug,
        s.status,
        s.updated_at AS updatedAt,
        coalesce(en.title, s.slug) AS title,
        published.revision_number AS publishedRevisionNumber,
        draft.id AS draftRevisionId,
        draft.revision_number AS draftRevisionNumber,
        coalesce(compatible.compatible_locales, 0) AS compatibleLocales
      FROM snippets s
      LEFT JOIN snippet_publications sp ON sp.snippet_id = s.id
      LEFT JOIN snippet_revisions published ON published.id = sp.revision_id
      LEFT JOIN snippet_localizations en_identity
        ON en_identity.snippet_id = s.id AND en_identity.locale = 'en'
      LEFT JOIN snippet_localization_publications en_publication
        ON en_publication.localization_id = en_identity.id
      LEFT JOIN snippet_localization_revisions en
        ON en.id = en_publication.localization_revision_id
      LEFT JOIN snippet_revisions draft ON draft.id = (
        SELECT candidate.id
        FROM snippet_revisions candidate
        WHERE candidate.snippet_id = s.id AND candidate.status = 'draft'
        ORDER BY candidate.revision_number DESC
        LIMIT 1
      )
      LEFT JOIN (
        SELECT sl.snippet_id, count(*) AS compatible_locales
        FROM snippet_localizations sl
        JOIN snippet_localization_publications slp ON slp.localization_id = sl.id
        JOIN snippet_localization_revisions slr ON slr.id = slp.localization_revision_id
        JOIN snippet_publications sp2 ON sp2.snippet_id = sl.snippet_id
        JOIN snippet_revisions sr2 ON sr2.id = sp2.revision_id
        WHERE slr.translation_basis_hash = sr2.translation_basis_hash
        GROUP BY sl.snippet_id
      ) compatible ON compatible.snippet_id = s.id
      WHERE (?1 = '' OR s.slug LIKE '%' || ?1 || '%' OR en.title LIKE '%' || ?1 || '%')
        AND (
          ?2 = 'all'
          OR (?2 IN ('active', 'archived') AND s.status = ?2)
          OR (?2 = 'draft' AND draft.id IS NOT NULL)
        )
      ORDER BY s.updated_at DESC, s.slug ASC
      LIMIT 200`,
    )
    .bind(query, status)
    .all<{
      id: string;
      slug: string;
      status: SnippetStatus;
      updatedAt: string;
      title: string;
      publishedRevisionNumber: number | null;
      draftRevisionId: string | null;
      draftRevisionNumber: number | null;
      compatibleLocales: number;
    }>();
  return result.results.map((row) => ({
    ...row,
    publishedRevisionNumber:
      row.publishedRevisionNumber === null
        ? null
        : numberValue(row.publishedRevisionNumber),
    draftRevisionNumber:
      row.draftRevisionNumber === null
        ? null
        : numberValue(row.draftRevisionNumber),
    compatibleLocales: numberValue(row.compatibleLocales),
  }));
}

export async function getAdminDashboard(
  db: AppDatabase,
): Promise<AdminDashboard> {
  const [counts, recent] = await Promise.all([
    db.$client
      .prepare(
        `SELECT
          sum(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) AS active,
          sum(CASE WHEN s.status = 'archived' THEN 1 ELSE 0 END) AS archived,
          sum(CASE WHEN sp.snippet_id IS NOT NULL THEN 1 ELSE 0 END) AS published,
          sum(CASE WHEN EXISTS (
            SELECT 1 FROM snippet_revisions draft
            WHERE draft.snippet_id = s.id AND draft.status = 'draft'
          ) THEN 1 ELSE 0 END) AS drafts,
          sum(CASE WHEN sp.snippet_id IS NOT NULL AND (
            SELECT count(*)
            FROM snippet_localizations sl
            JOIN snippet_localization_publications slp ON slp.localization_id = sl.id
            JOIN snippet_localization_revisions slr ON slr.id = slp.localization_revision_id
            JOIN snippet_revisions current_revision ON current_revision.id = sp.revision_id
            WHERE sl.snippet_id = s.id
              AND slr.translation_basis_hash = current_revision.translation_basis_hash
          ) < 3 THEN 1 ELSE 0 END) AS needsTranslation
        FROM snippets s
        LEFT JOIN snippet_publications sp ON sp.snippet_id = s.id`,
      )
      .first<Record<string, number | null>>(),
    listAdminSnippets(db),
  ]);
  return {
    counts: {
      active: numberValue(counts?.["active"]),
      archived: numberValue(counts?.["archived"]),
      drafts: numberValue(counts?.["drafts"]),
      published: numberValue(counts?.["published"]),
      needsTranslation: numberValue(counts?.["needsTranslation"]),
    },
    recent: recent.slice(0, 8),
  };
}

export async function getAdminSnippet(
  db: AppDatabase,
  snippetId: string,
): Promise<AdminSnippetEditor | null> {
  const base = await db.$client
    .prepare(
      `SELECT
         s.id,
         s.slug,
         s.status AS snippetStatus,
         s.updated_at AS updatedAt,
         CASE WHEN sp.snippet_id IS NULL THEN 0 ELSE 1 END AS hasPublication,
         sr.id AS revisionId,
         sr.revision_number AS revisionNumber,
         sr.status AS revisionStatus,
         sr.representation,
         sr.representation_version AS representationVersion,
         sr.translation_basis_hash AS translationBasisHash,
         coalesce(sr.change_summary, '') AS changeSummary,
         sr.code_license AS codeLicense,
         coalesce(json_extract(sr.metadata, '$.previewScriptKey'), '') AS previewScriptKey,
         sr.created_by AS createdBy,
         sr.created_at AS createdAt,
         sr.published_at AS publishedAt
       FROM snippets s
       LEFT JOIN snippet_publications sp ON sp.snippet_id = s.id
       JOIN snippet_revisions sr ON sr.id = coalesce(
         (
           SELECT draft.id FROM snippet_revisions draft
           WHERE draft.snippet_id = s.id AND draft.status = 'draft'
           ORDER BY draft.revision_number DESC LIMIT 1
         ),
         sp.revision_id,
         (
           SELECT latest.id FROM snippet_revisions latest
           WHERE latest.snippet_id = s.id
           ORDER BY latest.revision_number DESC LIMIT 1
         )
       )
       WHERE s.id = ?1`,
    )
    .bind(snippetId)
    .first<{
      id: string;
      slug: string;
      snippetStatus: SnippetStatus;
      updatedAt: string;
      hasPublication: number;
      revisionId: string;
      revisionNumber: number;
      revisionStatus: RevisionStatus;
      representation: "scratchblocks" | "scratch-blocks-ast";
      representationVersion: number;
      translationBasisHash: string;
      changeSummary: string;
      codeLicense: string;
      previewScriptKey: string;
      createdBy: string | null;
      createdAt: string;
      publishedAt: string | null;
    }>();
  if (!base) return null;

  const [
    scriptRows,
    unitRows,
    referenceRows,
    contributorRows,
    tagRows,
    demo,
    history,
  ] = await Promise.all([
    db.$client
      .prepare(
        `SELECT script_key AS key, source, position
           FROM snippet_revision_scripts
           WHERE revision_id = ?1 ORDER BY position ASC`,
      )
      .bind(base.revisionId)
      .all<{ key: string; source: string; position: number }>(),
    db.$client
      .prepare(
        `SELECT unit_key AS key, kind, source_text AS sourceText, position
           FROM snippet_revision_translation_units
           WHERE revision_id = ?1 ORDER BY position ASC`,
      )
      .bind(base.revisionId)
      .all<AdminUnitInput & { position: number }>(),
    db.$client
      .prepare(
        `SELECT reference_key AS key, kind, url, title_unit_key AS titleUnitKey, position
           FROM snippet_revision_references
           WHERE revision_id = ?1 ORDER BY position ASC`,
      )
      .bind(base.revisionId)
      .all<{
        key: string;
        kind: AdminReferenceInput["kind"];
        url: string;
        titleUnitKey: string;
        position: number;
      }>(),
    db.$client
      .prepare(
        `SELECT c.id, c.kind, c.external_id AS externalId,
                  c.display_name AS displayName, c.profile_url AS profileUrl,
                  src.role, src.position
           FROM snippet_revision_contributors src
           JOIN contributors c ON c.id = src.contributor_id
           WHERE src.revision_id = ?1 ORDER BY src.position ASC`,
      )
      .bind(base.revisionId)
      .all<AdminContributorInput & { position: number }>(),
    db.$client
      .prepare(
        `SELECT tag_id AS tagId FROM snippet_revision_tags
           WHERE revision_id = ?1 ORDER BY position ASC`,
      )
      .bind(base.revisionId)
      .all<{ tagId: string }>(),
    db.$client
      .prepare(
        `SELECT byte_size AS byteSize, sha256, license,
                  coalesce(attribution, '') AS attribution
           FROM artifacts
           WHERE revision_id = ?1 AND artifact_key = 'demo' LIMIT 1`,
      )
      .bind(base.revisionId)
      .first<{
        byteSize: number;
        sha256: string;
        license: string;
        attribution: string;
      }>(),
    db.$client
      .prepare(
        `SELECT id, revision_number AS number, status,
                  coalesce(change_summary, '') AS changeSummary,
                  created_by AS createdBy, created_at AS createdAt,
                  published_at AS publishedAt
           FROM snippet_revisions
           WHERE snippet_id = ?1 ORDER BY revision_number DESC`,
      )
      .bind(snippetId)
      .all<AdminSnippetEditor["history"][number]>(),
  ]);

  const units = unitRows.results.map(({ key, kind, sourceText }) => ({
    key,
    kind,
    sourceText,
  }));
  const titleByUnit = new Map(units.map((unit) => [unit.key, unit.sourceText]));
  const scripts = scriptRows.results.map((script) => ({
    key: script.key,
    source: script.source,
    title: titleByUnit.get(`script:${script.key}:title`) ?? script.key,
  }));
  const references = referenceRows.results.map((reference) => ({
    key: reference.key,
    kind: reference.kind,
    url: reference.url,
    title: titleByUnit.get(reference.titleUnitKey) ?? reference.key,
  }));

  const localizationCandidates = await db.$client
    .prepare(
      `SELECT sl.locale, slr.id, slr.revision_number AS revisionNumber,
              slr.status, slr.translation_basis_hash AS translationBasisHash,
              slr.source_revision_id AS sourceRevisionId,
              slr.title, slr.summary, coalesce(slr.seo_title, '') AS seoTitle,
              coalesce(slr.seo_description, '') AS seoDescription,
              slr.body_markdown AS bodyMarkdown, slr.keywords,
              slr.prose_license AS proseLicense,
              CASE WHEN slp.localization_revision_id = slr.id THEN 1 ELSE 0 END AS isCurrent
       FROM snippet_localizations sl
       JOIN snippet_localization_revisions slr ON slr.localization_id = sl.id
       LEFT JOIN snippet_localization_publications slp ON slp.localization_id = sl.id
       WHERE sl.snippet_id = ?1
       ORDER BY slr.revision_number DESC`,
    )
    .bind(snippetId)
    .all<{
      locale: Locale;
      id: string;
      revisionNumber: number;
      status: RevisionStatus;
      translationBasisHash: string;
      sourceRevisionId: string | null;
      title: string;
      summary: string;
      seoTitle: string;
      seoDescription: string;
      bodyMarkdown: string;
      keywords: string;
      proseLicense: string;
      isCurrent: number;
    }>();
  const localizations: AdminSnippetEditor["localizations"] = [];
  for (const locale of SUPPORTED_LOCALES) {
    const candidates = localizationCandidates.results.filter(
      (candidate) => candidate.locale === locale,
    );
    const selected =
      candidates.find(
        (candidate) =>
          candidate.status === "draft" &&
          candidate.sourceRevisionId === base.revisionId,
      ) ??
      candidates.find((candidate) => Boolean(candidate.isCurrent)) ??
      candidates[0];
    if (!selected) {
      localizations.push({
        locale,
        title: "",
        summary: "",
        seoTitle: "",
        seoDescription: "",
        bodyMarkdown: "",
        keywords: [],
        proseLicense: "CC-BY-SA-4.0",
        basisAccepted: locale === CONTENT_FALLBACK_LOCALE,
        scriptOverrides: [],
        units: [],
        revisionId: null,
        revisionNumber: null,
        status: "missing",
        translationBasisHash: null,
        compatible: false,
      });
      continue;
    }
    const [localizedScripts, localizedUnits] = await Promise.all([
      db.$client
        .prepare(
          `SELECT script_key AS key, source
           FROM snippet_localization_revision_scripts
           WHERE localization_revision_id = ?1`,
        )
        .bind(selected.id)
        .all<{ key: string; source: string }>(),
      db.$client
        .prepare(
          `SELECT unit_key AS key, translated_text AS translatedText
           FROM snippet_localization_revision_units
           WHERE localization_revision_id = ?1`,
        )
        .bind(selected.id)
        .all<{ key: string; translatedText: string }>(),
    ]);
    const compatible =
      selected.translationBasisHash === base.translationBasisHash;
    let keywords: string[] = [];
    try {
      const parsed = JSON.parse(selected.keywords) as unknown;
      if (Array.isArray(parsed)) {
        keywords = parsed.filter(
          (value): value is string => typeof value === "string",
        );
      }
    } catch {
      keywords = [];
    }
    localizations.push({
      locale,
      title: selected.title,
      summary: selected.summary,
      seoTitle: selected.seoTitle,
      seoDescription: selected.seoDescription,
      bodyMarkdown: selected.bodyMarkdown,
      keywords,
      proseLicense: selected.proseLicense,
      basisAccepted: locale === CONTENT_FALLBACK_LOCALE || compatible,
      scriptOverrides: localizedScripts.results,
      units: localizedUnits.results,
      revisionId: selected.id,
      revisionNumber: numberValue(selected.revisionNumber),
      status: selected.status,
      translationBasisHash: selected.translationBasisHash,
      compatible,
    });
  }

  return {
    snippet: {
      id: base.id,
      slug: base.slug,
      status: base.snippetStatus,
      updatedAt: base.updatedAt,
      hasPublication: Boolean(base.hasPublication),
    },
    revision: {
      id: base.revisionId,
      number: numberValue(base.revisionNumber),
      status: base.revisionStatus,
      representation: base.representation,
      representationVersion: numberValue(base.representationVersion),
      translationBasisHash: base.translationBasisHash,
      changeSummary: base.changeSummary,
      codeLicense: base.codeLicense,
      previewScriptKey: base.previewScriptKey,
      createdBy: base.createdBy,
      createdAt: base.createdAt,
      publishedAt: base.publishedAt,
    },
    scripts,
    units: units.filter(
      (unit) => unit.kind !== "script-title" && unit.kind !== "reference",
    ),
    references,
    contributors: contributorRows.results.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      displayName: entry.displayName,
      externalId: entry.externalId,
      profileUrl: entry.profileUrl,
      role: entry.role,
    })),
    tagIds: tagRows.results.map((row) => row.tagId),
    localizations,
    demo: demo
      ? {
          byteSize: numberValue(demo.byteSize),
          sha256: demo.sha256,
          license: demo.license,
          attribution: demo.attribution,
        }
      : null,
    history: history.results.map((entry) => ({
      ...entry,
      number: numberValue(entry.number),
    })),
  };
}

export async function listAdminTags(
  db: AppDatabase,
): Promise<AdminTagRecord[]> {
  const [tagRows, localizationRows] = await Promise.all([
    db.$client
      .prepare(
        `SELECT t.id, t.slug, count(DISTINCT srt.revision_id) AS usageCount
         FROM tags t
         LEFT JOIN snippet_revision_tags srt ON srt.tag_id = t.id
         GROUP BY t.id, t.slug
         ORDER BY t.slug ASC`,
      )
      .all<{ id: string; slug: string; usageCount: number }>(),
    db.$client
      .prepare(
        `SELECT tag_id AS tagId, locale, name, coalesce(description, '') AS description
         FROM tag_localizations`,
      )
      .all<{
        tagId: string;
        locale: Locale;
        name: string;
        description: string;
      }>(),
  ]);
  const byTag = new Map(
    tagRows.results.map((tag) => [
      tag.id,
      {
        id: tag.id,
        slug: tag.slug,
        usageCount: numberValue(tag.usageCount),
        localizations: Object.fromEntries(
          SUPPORTED_LOCALES.map((locale) => [
            locale,
            { name: "", description: "" },
          ]),
        ) as AdminTagRecord["localizations"],
      },
    ]),
  );
  for (const localization of localizationRows.results) {
    const tag = byTag.get(localization.tagId);
    if (tag && SUPPORTED_LOCALES.includes(localization.locale)) {
      tag.localizations[localization.locale] = {
        name: localization.name,
        description: localization.description,
      };
    }
  }
  return [...byTag.values()];
}

export async function saveAdminTag(
  db: AppDatabase,
  input: {
    id?: string;
    slug: string;
    localizations: AdminTagRecord["localizations"];
  },
): Promise<string> {
  const slug = input.slug.trim();
  if (!SLUG_PATTERN.test(slug)) {
    throw new AdminContentError("INVALID_INPUT", "标签 slug 格式无效");
  }
  const id = input.id ?? `tag-${crypto.randomUUID()}`;
  const statements: D1PreparedStatement[] = input.id
    ? [
        db.$client
          .prepare("UPDATE tags SET slug = ?1 WHERE id = ?2")
          .bind(slug, id),
      ]
    : [
        db.$client
          .prepare("INSERT INTO tags (id, slug) VALUES (?1, ?2)")
          .bind(id, slug),
      ];
  for (const locale of SUPPORTED_LOCALES) {
    const localized = input.localizations[locale];
    const name = localized.name.trim();
    if (!name) {
      throw new AdminContentError(
        "INVALID_INPUT",
        `${locale} 标签名称不能为空`,
      );
    }
    statements.push(
      db.$client
        .prepare(
          `INSERT INTO tag_localizations (tag_id, locale, name, description)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(tag_id, locale) DO UPDATE SET
             name = excluded.name,
             description = excluded.description`,
        )
        .bind(id, locale, name, localized.description.trim() || null),
    );
  }
  try {
    await db.$client.batch(statements);
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      throw new AdminContentError("CONFLICT", "标签 slug 已存在");
    }
    throw error;
  }
  return id;
}

export async function deleteAdminTag(
  db: AppDatabase,
  tagId: string,
): Promise<void> {
  const usage = await db.$client
    .prepare(
      "SELECT count(*) AS count FROM snippet_revision_tags WHERE tag_id = ?1",
    )
    .bind(tagId)
    .first<{ count: number }>();
  if (numberValue(usage?.count) > 0) {
    throw new AdminContentError(
      "INVALID_STATE",
      "仍被内容版本引用的标签不能删除",
    );
  }
  const result = await db.$client
    .prepare("DELETE FROM tags WHERE id = ?1")
    .bind(tagId)
    .run();
  if (!result.meta.changes) {
    throw new AdminContentError("NOT_FOUND", "标签不存在");
  }
}

async function nextRevisionNumber(
  db: AppDatabase,
  table: "snippet_revisions" | "snippet_localization_revisions",
  ownerColumn: "snippet_id" | "localization_id",
  ownerId: string,
): Promise<number> {
  const row = await db.$client
    .prepare(
      `SELECT coalesce(max(revision_number), 0) + 1 AS next FROM ${table} WHERE ${ownerColumn} = ?1`,
    )
    .bind(ownerId)
    .first<{ next: number }>();
  return numberValue(row?.next) || 1;
}

export async function saveAdminSnippetDraft(
  db: AppDatabase,
  actor: AdminActor,
  rawInput: AdminSnippetDraftInput,
): Promise<{ snippetId: string; revisionId: string }> {
  const input = validateDraftInput(rawInput);
  const now = new Date().toISOString();
  const existingSnippet = input.snippetId
    ? await db.$client
        .prepare("SELECT id, slug FROM snippets WHERE id = ?1")
        .bind(input.snippetId)
        .first<{ id: string; slug: string }>()
    : null;
  if (input.snippetId && !existingSnippet) {
    throw new AdminContentError("NOT_FOUND", "Snippet 不存在");
  }

  const sourceRevision = input.revisionId
    ? await db.$client
        .prepare(
          `SELECT id, snippet_id AS snippetId, revision_number AS revisionNumber,
                  status, representation, representation_version AS representationVersion
           FROM snippet_revisions WHERE id = ?1`,
        )
        .bind(input.revisionId)
        .first<{
          id: string;
          snippetId: string;
          revisionNumber: number;
          status: RevisionStatus;
          representation: "scratchblocks" | "scratch-blocks-ast";
          representationVersion: number;
        }>()
    : null;
  if (input.revisionId && !sourceRevision) {
    throw new AdminContentError("NOT_FOUND", "内容版本不存在");
  }
  if (sourceRevision && sourceRevision.snippetId !== input.snippetId) {
    throw new AdminContentError("INVALID_INPUT", "内容版本不属于当前 Snippet");
  }
  if (sourceRevision?.representation === "scratch-blocks-ast") {
    throw new AdminContentError(
      "INVALID_STATE",
      "当前管理端只能只读查看 scratch-blocks-ast 版本",
    );
  }

  const snippetId = existingSnippet?.id ?? `snippet-${crypto.randomUUID()}`;
  const updateExistingDraft = sourceRevision?.status === "draft";
  const revisionId = updateExistingDraft
    ? sourceRevision.id
    : `revision-${crypto.randomUUID()}`;
  const revisionNumber = updateExistingDraft
    ? numberValue(sourceRevision.revisionNumber)
    : await nextRevisionNumber(
        db,
        "snippet_revisions",
        "snippet_id",
        snippetId,
      );
  const basis = await computeTranslationBasisHash({
    representation: "scratchblocks",
    representationVersion: 1,
    scripts: input.scripts,
    units: input.units,
  });
  const contentHash = await computeContentHash({
    codeLicense: input.codeLicense,
    contributors: input.contributors.map((entry) => ({
      displayName: entry.displayName,
      kind: entry.kind,
      role: entry.role,
    })),
    previewScriptKey: input.previewScriptKey,
    references: input.references.map((entry) => ({
      key: entry.key,
      kind: entry.kind,
      title: entry.title,
      url: entry.url,
    })),
    scripts: input.scripts.map((entry) => ({
      key: entry.key,
      source: entry.source,
      title: entry.title,
    })),
    tagIds: [...input.tagIds].sort(),
    units: input.units.map((entry) => ({
      key: entry.key,
      kind: entry.kind,
      sourceText: entry.sourceText,
    })),
  });
  const statements: D1PreparedStatement[] = [];
  if (existingSnippet) {
    statements.push(
      db.$client
        .prepare("UPDATE snippets SET slug = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(input.slug, now, snippetId),
    );
  } else {
    statements.push(
      db.$client
        .prepare(
          `INSERT INTO snippets (id, slug, status, created_at, updated_at)
           VALUES (?1, ?2, 'active', ?3, ?3)`,
        )
        .bind(snippetId, input.slug, now),
    );
  }

  if (updateExistingDraft) {
    statements.push(
      db.$client
        .prepare(
          `UPDATE snippet_revisions SET
             content_hash = ?1,
             translation_basis_hash = ?2,
             change_summary = ?3,
             code_license = ?4,
             source_kind = 'editorial',
             metadata = ?5
           WHERE id = ?6 AND status = 'draft'`,
        )
        .bind(
          contentHash,
          basis,
          input.changeSummary || null,
          input.codeLicense,
          JSON.stringify(
            input.previewScriptKey
              ? { previewScriptKey: input.previewScriptKey }
              : {},
          ),
          revisionId,
        ),
    );
  } else {
    statements.push(
      db.$client
        .prepare(
          `INSERT INTO snippet_revisions (
             id, snippet_id, revision_number, status, content_schema_version,
             representation, representation_version, content_hash,
             translation_basis_hash, change_summary, code_license, source_kind,
             metadata, created_by, created_at
           ) VALUES (?1, ?2, ?3, 'draft', 1, 'scratchblocks', 1, ?4, ?5, ?6, ?7,
                     'editorial', ?8, ?9, ?10)`,
        )
        .bind(
          revisionId,
          snippetId,
          revisionNumber,
          contentHash,
          basis,
          input.changeSummary || null,
          input.codeLicense,
          JSON.stringify(
            input.previewScriptKey
              ? { previewScriptKey: input.previewScriptKey }
              : {},
          ),
          actor.id,
          now,
        ),
    );
    if (sourceRevision) {
      statements.push(
        db.$client
          .prepare(
            `INSERT INTO snippet_revision_symbols
               (id, revision_id, symbol_key, kind, scope, name_unit_key, position, metadata)
             SELECT 'symbol-' || lower(hex(randomblob(16))), ?1, symbol_key, kind,
                    scope, name_unit_key, position, metadata
             FROM snippet_revision_symbols WHERE revision_id = ?2`,
          )
          .bind(revisionId, sourceRevision.id),
        db.$client
          .prepare(
            `INSERT INTO artifacts
               (id, revision_id, artifact_key, kind, storage, storage_key,
                content_type, byte_size, sha256, license, attribution, created_at)
             SELECT 'artifact-' || lower(hex(randomblob(16))), ?1, artifact_key, kind,
                    storage, storage_key, content_type, byte_size, sha256, license,
                    attribution, ?2
             FROM artifacts WHERE revision_id = ?3`,
          )
          .bind(revisionId, now, sourceRevision.id),
      );
    }
  }

  for (const table of [
    "snippet_revision_scripts",
    "snippet_revision_translation_units",
    "snippet_revision_references",
    "snippet_revision_tags",
    "snippet_revision_contributors",
  ]) {
    statements.push(
      db.$client
        .prepare(`DELETE FROM ${table} WHERE revision_id = ?1`)
        .bind(revisionId),
    );
  }
  input.scripts.forEach((script, position) => {
    statements.push(
      db.$client
        .prepare(
          `INSERT INTO snippet_revision_scripts
             (id, revision_id, script_key, position, source)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(
          `script-${crypto.randomUUID()}`,
          revisionId,
          script.key,
          position,
          script.source,
        ),
    );
  });
  input.units.forEach((unit, position) => {
    statements.push(
      db.$client
        .prepare(
          `INSERT INTO snippet_revision_translation_units
             (id, revision_id, unit_key, kind, position, source_text)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        )
        .bind(
          `unit-${crypto.randomUUID()}`,
          revisionId,
          unit.key,
          unit.kind,
          position,
          unit.sourceText,
        ),
    );
  });
  input.references.forEach((reference, position) => {
    statements.push(
      db.$client
        .prepare(
          `INSERT INTO snippet_revision_references
             (id, revision_id, reference_key, kind, url, title_unit_key, position)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
        .bind(
          `reference-${crypto.randomUUID()}`,
          revisionId,
          reference.key,
          reference.kind,
          reference.url,
          `reference:${reference.key}:title`,
          position,
        ),
    );
  });
  input.tagIds.forEach((tagId, position) => {
    statements.push(
      db.$client
        .prepare(
          `INSERT INTO snippet_revision_tags (revision_id, tag_id, position)
           VALUES (?1, ?2, ?3)`,
        )
        .bind(revisionId, tagId, position),
    );
  });
  input.contributors.forEach((contributor, position) => {
    const contributorId =
      contributor.id ?? `contributor-${crypto.randomUUID()}`;
    if (!contributor.id) {
      statements.push(
        db.$client
          .prepare(
            `INSERT INTO contributors
               (id, kind, external_id, display_name, profile_url, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
          )
          .bind(
            contributorId,
            contributor.kind,
            contributor.externalId ?? null,
            contributor.displayName,
            contributor.profileUrl ?? null,
            now,
          ),
      );
    }
    statements.push(
      db.$client
        .prepare(
          `INSERT INTO snippet_revision_contributors
             (revision_id, contributor_id, role, position)
           VALUES (?1, ?2, ?3, ?4)`,
        )
        .bind(revisionId, contributorId, contributor.role, position),
    );
  });

  for (const localization of input.localizations) {
    const hasContent = Boolean(localization.title || localization.summary);
    const accepted =
      localization.locale === CONTENT_FALLBACK_LOCALE ||
      localization.basisAccepted;
    if (!hasContent || !accepted) continue;

    let identity = await db.$client
      .prepare(
        `SELECT id FROM snippet_localizations
         WHERE snippet_id = ?1 AND locale = ?2`,
      )
      .bind(snippetId, localization.locale)
      .first<{ id: string }>();
    if (!identity) {
      identity = { id: `localization-${crypto.randomUUID()}` };
      statements.push(
        db.$client
          .prepare(
            `INSERT INTO snippet_localizations (id, snippet_id, locale, created_at)
             VALUES (?1, ?2, ?3, ?4)`,
          )
          .bind(identity.id, snippetId, localization.locale, now),
      );
    }
    const existingDraft = await db.$client
      .prepare(
        `SELECT id, revision_number AS revisionNumber
         FROM snippet_localization_revisions
         WHERE localization_id = ?1 AND source_revision_id = ?2 AND status = 'draft'
         ORDER BY revision_number DESC LIMIT 1`,
      )
      .bind(identity.id, revisionId)
      .first<{ id: string; revisionNumber: number }>();
    const localizationRevisionId =
      existingDraft?.id ?? `localization-revision-${crypto.randomUUID()}`;
    const localizationRevisionNumber =
      existingDraft?.revisionNumber ??
      (await nextRevisionNumber(
        db,
        "snippet_localization_revisions",
        "localization_id",
        identity.id,
      ));
    if (existingDraft) {
      statements.push(
        db.$client
          .prepare(
            `UPDATE snippet_localization_revisions SET
               translation_basis_hash = ?1,
               title = ?2,
               summary = ?3,
               seo_title = ?4,
               seo_description = ?5,
               body_markdown = ?6,
               keywords = ?7,
               prose_license = ?8,
               source_kind = 'editorial',
               created_by = ?9
             WHERE id = ?10 AND status = 'draft'`,
          )
          .bind(
            basis,
            localization.title,
            localization.summary,
            localization.seoTitle || null,
            localization.seoDescription || null,
            localization.bodyMarkdown,
            JSON.stringify(localization.keywords),
            localization.proseLicense,
            actor.id,
            localizationRevisionId,
          ),
      );
    } else {
      statements.push(
        db.$client
          .prepare(
            `INSERT INTO snippet_localization_revisions (
               id, localization_id, revision_number, status,
               translation_basis_hash, source_revision_id, title, summary,
               seo_title, seo_description, body_markdown, keywords,
               prose_license, source_kind, created_by, created_at
             ) VALUES (?1, ?2, ?3, 'draft', ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                       ?11, ?12, 'editorial', ?13, ?14)`,
          )
          .bind(
            localizationRevisionId,
            identity.id,
            localizationRevisionNumber,
            basis,
            revisionId,
            localization.title,
            localization.summary,
            localization.seoTitle || null,
            localization.seoDescription || null,
            localization.bodyMarkdown,
            JSON.stringify(localization.keywords),
            localization.proseLicense,
            actor.id,
            now,
          ),
      );
    }
    statements.push(
      db.$client
        .prepare(
          "DELETE FROM snippet_localization_revision_scripts WHERE localization_revision_id = ?1",
        )
        .bind(localizationRevisionId),
      db.$client
        .prepare(
          "DELETE FROM snippet_localization_revision_units WHERE localization_revision_id = ?1",
        )
        .bind(localizationRevisionId),
    );
    localization.scriptOverrides.forEach((override) => {
      if (!input.scripts.some((script) => script.key === override.key)) {
        throw new AdminContentError(
          "INVALID_INPUT",
          `${localization.locale} 翻译脚本引用了不存在的 key`,
        );
      }
      statements.push(
        db.$client
          .prepare(
            `INSERT INTO snippet_localization_revision_scripts
               (id, localization_revision_id, script_key, source)
             VALUES (?1, ?2, ?3, ?4)`,
          )
          .bind(
            `localized-script-${crypto.randomUUID()}`,
            localizationRevisionId,
            override.key,
            override.source,
          ),
      );
    });
    localization.units.forEach((unit) => {
      if (!input.units.some((sourceUnit) => sourceUnit.key === unit.key)) {
        throw new AdminContentError(
          "INVALID_INPUT",
          `${localization.locale} 翻译引用了不存在的翻译单元`,
        );
      }
      statements.push(
        db.$client
          .prepare(
            `INSERT INTO snippet_localization_revision_units
               (id, localization_revision_id, unit_key, translated_text)
             VALUES (?1, ?2, ?3, ?4)`,
          )
          .bind(
            `localized-unit-${crypto.randomUUID()}`,
            localizationRevisionId,
            unit.key,
            unit.translatedText,
          ),
      );
    });
  }

  try {
    await db.$client.batch(statements);
  } catch (error) {
    const message = String(error);
    if (
      message.includes("snippets_slug_unique") ||
      message.includes("UNIQUE constraint failed: snippets.slug")
    ) {
      throw new AdminContentError("CONFLICT", "Slug 已被其他 Snippet 使用");
    }
    if (message.includes("published snippet slugs are immutable")) {
      throw new AdminContentError("INVALID_STATE", "首次发布后不能修改 Slug");
    }
    throw error;
  }
  return { snippetId, revisionId };
}

export async function storeAdminDemoArtifact(
  db: AppDatabase,
  bucket: R2Bucket,
  revisionId: string,
  file: File,
  input: { license: string; attribution: string },
): Promise<void> {
  if (file.size <= 0 || file.size > MAX_DEMO_BYTES) {
    throw new AdminContentError(
      "INVALID_INPUT",
      `demo.sb3 必须小于 ${MAX_DEMO_BYTES / 1024 / 1024} MiB`,
    );
  }
  const revision = await db
    .select({ status: snippetRevisions.status })
    .from(snippetRevisions)
    .where(eq(snippetRevisions.id, revisionId))
    .limit(1);
  if (revision[0]?.status !== "draft") {
    throw new AdminContentError("INVALID_STATE", "只能修改草稿的演示项目");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new AdminContentError(
      "INVALID_INPUT",
      "demo.sb3 不是有效的 ZIP/SB3 文件",
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const storageKey = `sb3/${sha256}.sb3`;
  await bucket.put(storageKey, bytes, {
    httpMetadata: {
      cacheControl: "public, max-age=31536000, immutable",
      contentType: "application/x.scratch.sb3",
    },
    sha256: digest,
  });
  await db
    .insert(artifacts)
    .values({
      id: `artifact-${crypto.randomUUID()}`,
      revisionId,
      artifactKey: "demo",
      kind: "sb3",
      storage: "r2",
      storageKey,
      contentType: "application/x.scratch.sb3",
      byteSize: bytes.byteLength,
      sha256,
      license: nonEmpty(input.license, "演示项目许可证"),
      attribution: input.attribution.trim() || null,
    })
    .onConflictDoUpdate({
      target: [artifacts.revisionId, artifacts.artifactKey],
      set: {
        storageKey,
        byteSize: bytes.byteLength,
        sha256,
        license: nonEmpty(input.license, "演示项目许可证"),
        attribution: input.attribution.trim() || null,
      },
    });
}

export async function removeAdminDemoArtifact(
  db: AppDatabase,
  bucket: R2Bucket,
  revisionId: string,
): Promise<void> {
  const [artifact] = await db
    .select({ id: artifacts.id, storageKey: artifacts.storageKey })
    .from(artifacts)
    .innerJoin(snippetRevisions, eq(snippetRevisions.id, artifacts.revisionId))
    .where(
      and(
        eq(artifacts.revisionId, revisionId),
        eq(artifacts.artifactKey, "demo"),
        eq(snippetRevisions.status, "draft"),
      ),
    )
    .limit(1);
  if (!artifact) return;
  await db.delete(artifacts).where(eq(artifacts.id, artifact.id));
  const [remaining] = await db
    .select({ count: sql<number>`count(*)` })
    .from(artifacts)
    .where(eq(artifacts.storageKey, artifact.storageKey));
  if (!remaining?.count) await bucket.delete(artifact.storageKey);
}

export async function publishAdminSnippetDraft(
  db: AppDatabase,
  snippetId: string,
  revisionId: string,
): Promise<void> {
  const [english] = await db
    .select({ id: snippetLocalizationRevisions.id })
    .from(snippetLocalizationRevisions)
    .innerJoin(
      snippetLocalizations,
      eq(snippetLocalizations.id, snippetLocalizationRevisions.localizationId),
    )
    .where(
      and(
        eq(snippetLocalizationRevisions.sourceRevisionId, revisionId),
        eq(snippetLocalizationRevisions.status, "draft"),
        eq(snippetLocalizations.snippetId, snippetId),
        eq(snippetLocalizations.locale, CONTENT_FALLBACK_LOCALE),
      ),
    )
    .limit(1);
  if (!english) {
    throw new AdminContentError(
      "INVALID_STATE",
      "发布前必须先保存英文内容草稿",
    );
  }
  await publishSnippetRevision(db, {
    snippetId,
    revisionId,
    englishLocalizationRevisionId: english.id,
  });
}

export async function publishAdminLocalizationDraft(
  db: AppDatabase,
  snippetId: string,
  revisionId: string,
  locale: Exclude<Locale, "en">,
): Promise<void> {
  const [candidate] = await db
    .select({ id: snippetLocalizationRevisions.id })
    .from(snippetLocalizationRevisions)
    .innerJoin(
      snippetLocalizations,
      eq(snippetLocalizations.id, snippetLocalizationRevisions.localizationId),
    )
    .where(
      and(
        eq(snippetLocalizationRevisions.sourceRevisionId, revisionId),
        eq(snippetLocalizationRevisions.status, "draft"),
        eq(snippetLocalizations.snippetId, snippetId),
        eq(snippetLocalizations.locale, locale),
      ),
    )
    .limit(1);
  if (!candidate) {
    throw new AdminContentError("NOT_FOUND", `${locale} 翻译草稿不存在`);
  }
  await publishLocalizationRevision(db, {
    localizationRevisionId: candidate.id,
  });
}

export async function setAdminSnippetArchived(
  db: AppDatabase,
  snippetId: string,
  archived: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  if (archived) {
    await db.batch([
      db
        .update(snippets)
        .set({ status: "archived", archivedAt: now, updatedAt: now })
        .where(eq(snippets.id, snippetId)),
      db
        .delete(searchDocuments)
        .where(eq(searchDocuments.snippetId, snippetId)),
    ]);
    return;
  }
  await db
    .update(snippets)
    .set({ status: "active", archivedAt: null, updatedAt: now })
    .where(eq(snippets.id, snippetId));
  const [publication] = await db
    .select({
      revisionId: snippetPublications.revisionId,
      englishLocalizationRevisionId:
        snippetLocalizationPublications.localizationRevisionId,
    })
    .from(snippetPublications)
    .innerJoin(
      snippetLocalizations,
      and(
        eq(snippetLocalizations.snippetId, snippetPublications.snippetId),
        eq(snippetLocalizations.locale, CONTENT_FALLBACK_LOCALE),
      ),
    )
    .innerJoin(
      snippetLocalizationPublications,
      eq(
        snippetLocalizationPublications.localizationId,
        snippetLocalizations.id,
      ),
    )
    .where(eq(snippetPublications.snippetId, snippetId))
    .limit(1);
  if (publication) {
    await publishSnippetRevision(db, {
      snippetId,
      revisionId: publication.revisionId,
      englishLocalizationRevisionId: publication.englishLocalizationRevisionId,
      publishedAt: now,
    });
  }
}

export async function deleteUnpublishedAdminSnippet(
  db: AppDatabase,
  bucket: R2Bucket,
  snippetId: string,
): Promise<void> {
  const [publication] = await db
    .select({ snippetId: snippetPublications.snippetId })
    .from(snippetPublications)
    .where(eq(snippetPublications.snippetId, snippetId))
    .limit(1);
  if (publication) {
    throw new AdminContentError(
      "INVALID_STATE",
      "已发布内容只能归档，不能删除",
    );
  }
  const keys = await db
    .select({ storageKey: artifacts.storageKey })
    .from(artifacts)
    .innerJoin(snippetRevisions, eq(snippetRevisions.id, artifacts.revisionId))
    .where(eq(snippetRevisions.snippetId, snippetId));
  await db.$client.batch([
    db.$client
      .prepare(
        `DELETE FROM snippet_localization_revisions
           WHERE localization_id IN (
             SELECT id FROM snippet_localizations WHERE snippet_id = ?1
           )`,
      )
      .bind(snippetId),
    db.$client.prepare(`DELETE FROM snippets WHERE id = ?1`).bind(snippetId),
  ]);
  for (const key of new Set(keys.map((entry) => entry.storageKey))) {
    const [remaining] = await db
      .select({ count: sql<number>`count(*)` })
      .from(artifacts)
      .where(eq(artifacts.storageKey, key));
    if (!remaining?.count) await bucket.delete(key);
  }
}
