import { createCjkSearchTerms } from "../search/fts";
import type { LegacyImportPlan } from "./types";

function text(value: string | null | undefined): string {
  return value == null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError("SQL number must be finite");
  return String(value);
}

function json(value: unknown): string {
  return text(JSON.stringify(value));
}

function insertUnlessExists(
  table: string,
  columns: string[],
  values: string[],
  idColumn: string,
  id: string,
) {
  return `INSERT INTO ${table} (${columns.join(", ")})
SELECT ${values.join(", ")}
WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE ${idColumn} = ${text(id)});`;
}

export function generateLegacyImportStatements(
  plan: LegacyImportPlan,
  importedAt: string,
): string[] {
  if (plan.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new Error("Cannot generate import SQL while the plan has errors");
  }
  const statements: string[] = ["PRAGMA foreign_keys = ON;"];

  for (const contributor of plan.contributors) {
    statements.push(
      insertUnlessExists(
        "contributors",
        [
          "id",
          "kind",
          "external_id",
          "display_name",
          "profile_url",
          "created_at",
        ],
        [
          text(contributor.id),
          text(contributor.kind),
          text(contributor.externalId),
          text(contributor.displayName),
          text(contributor.profileUrl),
          text(importedAt),
        ],
        "id",
        contributor.id,
      ),
    );
  }

  for (const tag of plan.tags) {
    statements.push(
      insertUnlessExists(
        "tags",
        ["id", "slug", "created_at"],
        [text(tag.id), text(tag.slug), text(importedAt)],
        "id",
        tag.id,
      ),
    );
    for (const localization of tag.localizations) {
      statements.push(`INSERT INTO tag_localizations (tag_id, locale, name)
VALUES (${text(tag.id)}, ${text(localization.locale)}, ${text(localization.name)})
ON CONFLICT(tag_id, locale) DO UPDATE SET name = excluded.name;`);
    }
  }

  const tagIds = new Map(plan.tags.map((tag) => [tag.slug, tag.id]));
  for (const snippet of plan.snippets) {
    statements.push(
      insertUnlessExists(
        "snippets",
        ["id", "slug", "status", "created_at", "updated_at"],
        [
          text(snippet.snippetId),
          text(snippet.slug),
          text("active"),
          text(importedAt),
          text(importedAt),
        ],
        "id",
        snippet.snippetId,
      ),
    );
    statements.push(`INSERT INTO snippet_revisions (
  id, snippet_id, revision_number, status, content_schema_version,
  representation, representation_version, content_hash, translation_basis_hash,
  change_summary, code_license, source_kind, source_ref, metadata, created_at
)
SELECT
  ${text(snippet.revisionId)}, ${text(snippet.snippetId)},
  coalesce((SELECT max(revision_number) + 1 FROM snippet_revisions WHERE snippet_id = ${text(snippet.snippetId)}), 1),
  'draft', 1, 'scratchblocks', 1, ${text(snippet.contentHash)},
  ${text(snippet.translationBasisHash)}, 'Imported legacy content snapshot',
  'CC0-1.0', 'legacy-import', ${text(`legacy:${snippet.sourceRef}`)},
  ${json({
    artifactSource: snippet.artifact?.sourcePath ?? null,
    imports: snippet.imports,
    legacyId: snippet.legacyId,
    snapshotFingerprint: plan.fingerprint,
  })}, ${text(importedAt)}
WHERE NOT EXISTS (SELECT 1 FROM snippet_revisions WHERE id = ${text(snippet.revisionId)});`);

    for (const script of snippet.scripts) {
      statements.push(
        insertUnlessExists(
          "snippet_revision_scripts",
          ["id", "revision_id", "script_key", "position", "source", "metadata"],
          [
            text(script.id),
            text(snippet.revisionId),
            text(script.key),
            number(script.position),
            text(script.source),
            json({
              importedFrom: script.importedFrom,
              sourceModuleId: script.sourceModuleId,
              sourceScriptId: script.sourceScriptId,
            }),
          ],
          "id",
          script.id,
        ),
      );
    }
    for (const unit of snippet.units) {
      statements.push(
        insertUnlessExists(
          "snippet_revision_translation_units",
          [
            "id",
            "revision_id",
            "unit_key",
            "kind",
            "position",
            "source_text",
            "metadata",
          ],
          [
            text(unit.id),
            text(snippet.revisionId),
            text(unit.key),
            text(unit.kind),
            number(unit.position),
            text(unit.sourceText),
            json({
              sourceField: unit.sourceField,
              sourceModuleId: unit.sourceModuleId,
            }),
          ],
          "id",
          unit.id,
        ),
      );
    }
    for (const symbol of snippet.symbols) {
      statements.push(
        insertUnlessExists(
          "snippet_revision_symbols",
          [
            "id",
            "revision_id",
            "symbol_key",
            "kind",
            "scope",
            "name_unit_key",
            "position",
            "metadata",
          ],
          [
            text(symbol.id),
            text(snippet.revisionId),
            text(symbol.key),
            text(symbol.kind),
            text(symbol.scope),
            text(symbol.nameUnitKey),
            number(symbol.position),
            json({ legacyName: symbol.legacyName }),
          ],
          "id",
          symbol.id,
        ),
      );
    }
    for (const reference of snippet.references) {
      statements.push(
        insertUnlessExists(
          "snippet_revision_references",
          [
            "id",
            "revision_id",
            "reference_key",
            "kind",
            "url",
            "title_unit_key",
            "position",
          ],
          [
            text(reference.id),
            text(snippet.revisionId),
            text(reference.key),
            text(reference.kind),
            text(reference.url),
            text(reference.titleUnitKey),
            number(reference.position),
          ],
          "id",
          reference.id,
        ),
      );
    }
    for (const [position, slug] of snippet.tagSlugs.entries()) {
      const tagId = tagIds.get(slug);
      if (!tagId) continue;
      statements.push(`INSERT INTO snippet_revision_tags (revision_id, tag_id, position)
SELECT ${text(snippet.revisionId)}, ${text(tagId)}, ${number(position)}
WHERE NOT EXISTS (
  SELECT 1 FROM snippet_revision_tags
  WHERE revision_id = ${text(snippet.revisionId)} AND tag_id = ${text(tagId)}
);`);
    }
    for (const [position, contributorId] of snippet.contributorIds.entries()) {
      statements.push(`INSERT INTO snippet_revision_contributors (revision_id, contributor_id, role, position)
SELECT ${text(snippet.revisionId)}, ${text(contributorId)}, 'author', ${number(position)}
WHERE NOT EXISTS (
  SELECT 1 FROM snippet_revision_contributors
  WHERE revision_id = ${text(snippet.revisionId)}
    AND contributor_id = ${text(contributorId)} AND role = 'author'
);`);
    }
    if (snippet.artifact) {
      statements.push(
        insertUnlessExists(
          "artifacts",
          [
            "id",
            "revision_id",
            "artifact_key",
            "kind",
            "storage",
            "storage_key",
            "content_type",
            "byte_size",
            "sha256",
            "license",
            "attribution",
            "created_at",
          ],
          [
            text(snippet.artifact.id),
            text(snippet.revisionId),
            text(snippet.artifact.key),
            text("sb3"),
            text("static"),
            text(snippet.artifact.storageKey),
            text(snippet.artifact.contentType),
            number(snippet.artifact.byteSize),
            text(snippet.artifact.sha256),
            text("CC-BY-4.0"),
            text("Legacy module contributors"),
            text(importedAt),
          ],
          "id",
          snippet.artifact.id,
        ),
      );
    }

    for (const localization of snippet.localizations) {
      statements.push(
        insertUnlessExists(
          "snippet_localizations",
          ["id", "snippet_id", "locale", "created_at"],
          [
            text(localization.localizationId),
            text(snippet.snippetId),
            text(localization.locale),
            text(importedAt),
          ],
          "id",
          localization.localizationId,
        ),
      );
      statements.push(`INSERT INTO snippet_localization_revisions (
  id, localization_id, revision_number, status, translation_basis_hash,
  source_revision_id, title, summary, seo_description, body_markdown, keywords,
  prose_license, source_kind, source_ref, metadata, created_at
)
SELECT
  ${text(localization.revisionId)}, ${text(localization.localizationId)},
  coalesce((SELECT max(revision_number) + 1 FROM snippet_localization_revisions WHERE localization_id = ${text(localization.localizationId)}), 1),
  'draft', ${text(snippet.translationBasisHash)}, ${text(snippet.revisionId)},
  ${text(localization.title)}, ${text(localization.summary)},
  ${text(localization.seoDescription)}, ${text(localization.bodyMarkdown)},
  ${json(localization.keywords)}, 'CC-BY-SA-4.0', 'legacy-import',
  ${text(localization.sourceRefs.join(";"))},
  ${json({
    contentHash: localization.contentHash,
    inheritedFields: localization.inheritedFields,
    snapshotFingerprint: plan.fingerprint,
    sourceRefs: localization.sourceRefs,
  })}, ${text(importedAt)}
WHERE NOT EXISTS (
  SELECT 1 FROM snippet_localization_revisions WHERE id = ${text(localization.revisionId)}
);`);

      for (const script of localization.scripts) {
        statements.push(
          insertUnlessExists(
            "snippet_localization_revision_scripts",
            ["id", "localization_revision_id", "script_key", "source"],
            [
              text(script.id),
              text(localization.revisionId),
              text(script.scriptKey),
              text(script.source),
            ],
            "id",
            script.id,
          ),
        );
      }
      for (const unit of localization.units) {
        statements.push(
          insertUnlessExists(
            "snippet_localization_revision_units",
            ["id", "localization_revision_id", "unit_key", "translated_text"],
            [
              text(unit.id),
              text(localization.revisionId),
              text(unit.unitKey),
              text(unit.translatedText),
            ],
            "id",
            unit.id,
          ),
        );
      }
      for (const [
        position,
        contributorId,
      ] of snippet.contributorIds.entries()) {
        statements.push(`INSERT INTO snippet_localization_revision_contributors (
  localization_revision_id, contributor_id, role, position
)
SELECT ${text(localization.revisionId)}, ${text(contributorId)}, 'source', ${number(position)}
WHERE NOT EXISTS (
  SELECT 1 FROM snippet_localization_revision_contributors
  WHERE localization_revision_id = ${text(localization.revisionId)}
    AND contributor_id = ${text(contributorId)} AND role = 'source'
);`);
      }
      statements.push(`UPDATE snippet_localization_revisions
SET status = 'published', published_at = coalesce(published_at, ${text(importedAt)})
WHERE id = ${text(localization.revisionId)} AND status = 'draft';`);
    }

    statements.push(`UPDATE snippet_revisions
SET status = 'published', published_at = coalesce(published_at, ${text(importedAt)})
WHERE id = ${text(snippet.revisionId)} AND status = 'draft';`);
    statements.push(`INSERT INTO snippet_publications (snippet_id, revision_id, published_at)
VALUES (${text(snippet.snippetId)}, ${text(snippet.revisionId)}, ${text(importedAt)})
ON CONFLICT(snippet_id) DO UPDATE SET
  revision_id = excluded.revision_id,
  published_at = excluded.published_at
WHERE snippet_publications.revision_id <> excluded.revision_id;`);

    for (const localization of snippet.localizations) {
      statements.push(`INSERT INTO snippet_localization_publications (
  localization_id, localization_revision_id, published_at
)
VALUES (
  ${text(localization.localizationId)}, ${text(localization.revisionId)}, ${text(importedAt)}
)
ON CONFLICT(localization_id) DO UPDATE SET
  localization_revision_id = excluded.localization_revision_id,
  published_at = excluded.published_at
WHERE snippet_localization_publications.localization_revision_id <> excluded.localization_revision_id;`);

      const localizedScripts = new Map(
        localization.scripts.map((script) => [script.scriptKey, script.source]),
      );
      const resolvedScripts = snippet.scripts.map(
        (script) => localizedScripts.get(script.key) ?? script.source,
      );
      const cjkTerms = createCjkSearchTerms([
        localization.title,
        localization.summary,
        localization.bodyMarkdown,
        ...localization.keywords,
        ...resolvedScripts,
      ]);
      statements.push(`INSERT INTO search_documents (
  snippet_id, locale, revision_id, localization_revision_id,
  title, summary, body, keywords, scripts, updated_at
)
VALUES (
  ${text(snippet.snippetId)}, ${text(localization.locale)},
  ${text(snippet.revisionId)}, ${text(localization.revisionId)},
  ${text(localization.title)}, ${text(localization.summary)},
  ${text(localization.bodyMarkdown)},
  ${text([...localization.keywords, ...cjkTerms].join(" "))},
  ${text(resolvedScripts.join("\n"))}, ${text(importedAt)}
)
ON CONFLICT(snippet_id, locale) DO UPDATE SET
  revision_id = excluded.revision_id,
  localization_revision_id = excluded.localization_revision_id,
  title = excluded.title,
  summary = excluded.summary,
  body = excluded.body,
  keywords = excluded.keywords,
  scripts = excluded.scripts,
  updated_at = excluded.updated_at
WHERE search_documents.revision_id <> excluded.revision_id
   OR search_documents.localization_revision_id <> excluded.localization_revision_id;`);
    }
  }

  return statements;
}

export function legacyImportSqlFile(
  plan: LegacyImportPlan,
  importedAt: string,
): string {
  return `${generateLegacyImportStatements(plan, importedAt).join("\n\n")}\n`;
}

function inList(values: string[]): string {
  return values.length ? values.map(text).join(", ") : "NULL";
}

export function legacyImportVerificationSql(plan: LegacyImportPlan): string {
  const snippetIds = plan.snippets.map((snippet) => snippet.snippetId);
  const revisionIds = plan.snippets.map((snippet) => snippet.revisionId);
  const localizationIds = plan.snippets.flatMap((snippet) =>
    snippet.localizations.map((localization) => localization.localizationId),
  );
  const localizationRevisionIds = plan.snippets.flatMap((snippet) =>
    snippet.localizations.map((localization) => localization.revisionId),
  );
  return `SELECT
  (SELECT count(*) FROM snippets WHERE id IN (${inList(snippetIds)})) AS snippets,
  (SELECT count(*) FROM snippet_publications WHERE revision_id IN (${inList(revisionIds)})) AS publications,
  (SELECT count(*) FROM snippet_localization_publications WHERE localization_revision_id IN (${inList(localizationRevisionIds)})) AS localization_publications,
  (SELECT count(*) FROM search_documents WHERE snippet_id IN (${inList(snippetIds)})) AS search_documents,
  (SELECT count(*) FROM artifacts WHERE revision_id IN (${inList(revisionIds)})) AS artifacts,
  ${number(snippetIds.length)} AS expected_snippets,
  ${number(revisionIds.length)} AS expected_publications,
  ${number(localizationIds.length)} AS expected_localization_publications,
  ${number(localizationIds.length)} AS expected_search_documents,
  ${number(plan.counts.artifacts)} AS expected_artifacts;`;
}

export interface LegacyImportVerification {
  snippets: number;
  publications: number;
  localizationPublications: number;
  searchDocuments: number;
  artifacts: number;
  valid: boolean;
}

export async function verifyLegacyImport(
  database: D1Database,
  plan: LegacyImportPlan,
): Promise<LegacyImportVerification> {
  const row = await database
    .prepare(legacyImportVerificationSql(plan))
    .first<Record<string, number>>();
  const result = {
    snippets: row?.snippets ?? 0,
    publications: row?.publications ?? 0,
    localizationPublications: row?.localization_publications ?? 0,
    searchDocuments: row?.search_documents ?? 0,
    artifacts: row?.artifacts ?? 0,
  };
  return {
    ...result,
    valid:
      result.snippets === plan.counts.snippets &&
      result.publications === plan.counts.snippets &&
      result.localizationPublications === plan.counts.localizations &&
      result.searchDocuments === plan.counts.localizations &&
      result.artifacts === plan.counts.artifacts,
  };
}

export async function applyLegacyImport(
  database: D1Database,
  plan: LegacyImportPlan,
  importedAt = new Date().toISOString(),
): Promise<LegacyImportVerification> {
  const statements = generateLegacyImportStatements(plan, importedAt).map(
    (statement) => database.prepare(statement),
  );
  await database.batch(statements);
  const verification = await verifyLegacyImport(database, plan);
  if (!verification.valid) {
    throw new Error(
      `Legacy import verification failed: ${JSON.stringify(verification)}`,
    );
  }
  return verification;
}
