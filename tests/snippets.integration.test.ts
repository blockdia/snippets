import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, inject, it } from "vitest";

import { createDatabase, type AppDatabase } from "../app/db/client";
import {
  searchDocuments,
  snippetLocalizationRevisionScripts,
  snippetLocalizationRevisions,
  snippetLocalizations,
  snippetPublications,
  snippetRevisionScripts,
  snippetRevisionTags,
  snippetRevisionTranslationUnits,
  snippetRevisions,
  snippets,
  tagLocalizations,
  tags,
} from "../app/db/schema";
import { computeTranslationBasisHash } from "../app/domain/translation-basis";
import {
  PublicationError,
  listSearchTags,
  listPublishedSnippets,
  publishLocalizationRevision,
  publishSnippetRevision,
  resolvePublishedSnippet,
  searchPublishedSnippets,
} from "../app/services/snippets.server";

const migrations = inject("d1Migrations");

beforeEach(async () => {
  await applyD1Migrations(env.DB, migrations);
});

interface SeededSnippet {
  snippetId: string;
  revisionId: string;
  englishLocalizationId: string;
  englishRevisionId: string;
  zhLocalizationId: string;
  basis: string;
  slug: string;
}

async function seedSnippet(
  db: AppDatabase,
  suffix: string,
): Promise<SeededSnippet> {
  const snippetId = `snippet-${suffix}`;
  const revisionId = `revision-${suffix}-1`;
  const englishLocalizationId = `localization-${suffix}-en`;
  const englishRevisionId = `localization-revision-${suffix}-en-1`;
  const zhLocalizationId = `localization-${suffix}-zh-cn`;
  const basis = await computeTranslationBasisHash({
    representation: "scratchblocks",
    representationVersion: 1,
    scripts: [{ key: "main", source: "when green flag clicked\nsay [hello]" }],
    units: [
      {
        key: "script:main:title",
        kind: "script-title",
        sourceText: "Main",
      },
    ],
  });
  const slug = `example-${suffix}`;

  await db.insert(snippets).values({ id: snippetId, slug });
  await db.insert(snippetRevisions).values({
    id: revisionId,
    snippetId,
    revisionNumber: 1,
    contentHash: `snippet-content-v1:${"b".repeat(64)}`,
    translationBasisHash: basis,
  });
  await db.insert(snippetRevisionScripts).values({
    id: `script-${suffix}-main-1`,
    revisionId,
    scriptKey: "main",
    position: 0,
    source: "when green flag clicked\nsay [hello]",
  });
  await db.insert(snippetRevisionTranslationUnits).values({
    id: `unit-${suffix}-main-title-1`,
    revisionId,
    unitKey: "script:main:title",
    kind: "script-title",
    position: 0,
    sourceText: "Main",
  });
  await db.insert(snippetLocalizations).values([
    {
      id: englishLocalizationId,
      snippetId,
      locale: "en",
    },
    {
      id: zhLocalizationId,
      snippetId,
      locale: "zh-CN",
    },
  ]);
  await db.insert(snippetLocalizationRevisions).values({
    id: englishRevisionId,
    localizationId: englishLocalizationId,
    revisionNumber: 1,
    translationBasisHash: basis,
    sourceRevisionId: revisionId,
    title: "English example",
    summary: "English summary",
    bodyMarkdown: "English searchable body",
    keywords: ["example", "hello"],
  });

  return {
    snippetId,
    revisionId,
    englishLocalizationId,
    englishRevisionId,
    zhLocalizationId,
    basis,
    slug,
  };
}

async function seedChineseLocalization(
  db: AppDatabase,
  seed: SeededSnippet,
  suffix: string,
  basis = seed.basis,
): Promise<string> {
  const localizationRevisionId = `localization-revision-${suffix}-zh-cn-1`;
  await db.insert(snippetLocalizationRevisions).values({
    id: localizationRevisionId,
    localizationId: seed.zhLocalizationId,
    revisionNumber: 1,
    translationBasisHash: basis,
    sourceRevisionId: seed.revisionId,
    title: "中文示例",
    summary: "中文摘要",
    bodyMarkdown: "中文可搜索正文",
    keywords: ["示例", "你好"],
  });
  await db.insert(snippetLocalizationRevisionScripts).values({
    id: `localized-script-${suffix}-zh-cn-1`,
    localizationRevisionId,
    scriptKey: "main",
    source: "当绿旗被点击\n说 [你好]",
  });
  return localizationRevisionId;
}

describe("snippet publication model", () => {
  it("searches only the preferred eligible document and supports tag filters", async () => {
    const db = createDatabase(env.DB);
    const localized = await seedSnippet(db, crypto.randomUUID());
    const fallback = await seedSnippet(db, crypto.randomUUID());
    const chineseRevisionId = await seedChineseLocalization(
      db,
      localized,
      crypto.randomUUID(),
    );

    await db.insert(tags).values({ id: "tag-search-motion", slug: "motion" });
    await db.insert(tagLocalizations).values([
      { tagId: "tag-search-motion", locale: "en", name: "Motion" },
      { tagId: "tag-search-motion", locale: "zh-CN", name: "运动" },
    ]);
    await db.insert(snippetRevisionTags).values({
      revisionId: localized.revisionId,
      tagId: "tag-search-motion",
    });

    await publishSnippetRevision(db, {
      snippetId: localized.snippetId,
      revisionId: localized.revisionId,
      englishLocalizationRevisionId: localized.englishRevisionId,
    });
    await publishLocalizationRevision(db, {
      localizationRevisionId: chineseRevisionId,
    });
    await publishSnippetRevision(db, {
      snippetId: fallback.snippetId,
      revisionId: fallback.revisionId,
      englishLocalizationRevisionId: fallback.englishRevisionId,
    });

    const cjk = await searchPublishedSnippets(db, "zh-CN", {
      query: "中文可搜",
    });
    expect(cjk.items).toEqual([
      expect.objectContaining({
        id: localized.snippetId,
        locale: "zh-CN",
        fallbackUsed: false,
      }),
    ]);

    const preferredLocaleExcludesEnglish = await searchPublishedSnippets(
      db,
      "zh-CN",
      { query: "English searchable" },
    );
    expect(preferredLocaleExcludesEnglish.items).toEqual([
      expect.objectContaining({
        id: fallback.snippetId,
        locale: "en",
        fallbackUsed: true,
      }),
    ]);

    const all = await searchPublishedSnippets(db, "zh-CN", { query: "" });
    expect(all.total).toBe(2);
    expect(new Set(all.items.map((item) => item.id)).size).toBe(2);

    const filtered = await searchPublishedSnippets(db, "zh-CN", {
      query: "",
      tagSlug: "motion",
    });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.id).toBe(localized.snippetId);

    await expect(listSearchTags(db, "zh-CN")).resolves.toContainEqual({
      slug: "motion",
      name: "运动",
      snippetCount: 1,
    });
  });

  it("publishes with English fallback, then prefers a compatible target locale", async () => {
    const db = createDatabase(env.DB);
    const seed = await seedSnippet(db, crypto.randomUUID());

    await publishSnippetRevision(db, {
      snippetId: seed.snippetId,
      revisionId: seed.revisionId,
      englishLocalizationRevisionId: seed.englishRevisionId,
      publishedAt: "2026-08-25T00:00:00.000Z",
    });

    const fallback = await resolvePublishedSnippet(db, seed.slug, "zh-CN");
    expect(fallback?.localization.locale).toBe("en");
    expect(fallback?.localization.fallbackUsed).toBe(true);
    expect(fallback?.scripts[0]?.source).toContain("green flag");

    const fallbackCards = await listPublishedSnippets(db, "zh-CN");
    expect(fallbackCards.filter((card) => card.id === seed.snippetId)).toEqual([
      expect.objectContaining({
        locale: "en",
        fallbackUsed: true,
        previewSource: "when green flag clicked\nsay [hello]",
      }),
    ]);

    const chineseRevisionId = await seedChineseLocalization(
      db,
      seed,
      crypto.randomUUID(),
    );
    await publishLocalizationRevision(db, {
      localizationRevisionId: chineseRevisionId,
      publishedAt: "2026-08-25T00:01:00.000Z",
    });

    const localized = await resolvePublishedSnippet(db, seed.slug, "zh-CN");
    expect(localized?.localization.locale).toBe("zh-CN");
    expect(localized?.localization.fallbackUsed).toBe(false);
    expect(localized?.scripts[0]).toMatchObject({
      localized: true,
      source: "当绿旗被点击\n说 [你好]",
    });

    const localizedCards = await listPublishedSnippets(db, "zh-CN");
    expect(localizedCards.filter((card) => card.id === seed.snippetId)).toEqual(
      [
        expect.objectContaining({
          locale: "zh-CN",
          fallbackUsed: false,
          previewSource: "当绿旗被点击\n说 [你好]",
        }),
      ],
    );

    const documents = await db
      .select()
      .from(searchDocuments)
      .where(eq(searchDocuments.snippetId, seed.snippetId));
    expect(documents).toHaveLength(2);

    const fts = await env.DB.prepare(
      `SELECT snippet_search_fts.rowid
       FROM snippet_search_fts
       INNER JOIN search_documents AS documents ON documents.id = snippet_search_fts.rowid
       WHERE snippet_search_fts MATCH ? AND documents.snippet_id = ?`,
    )
      .bind("searchable", seed.snippetId)
      .all();
    expect(fts.results).toHaveLength(1);
  });

  it("uses an explicitly selected preview script instead of its position", async () => {
    const db = createDatabase(env.DB);
    const seed = await seedSnippet(db, crypto.randomUUID());
    const usageSource = "when this sprite clicked\nsay [preview me]";
    const basis = await computeTranslationBasisHash({
      representation: "scratchblocks",
      representationVersion: 1,
      scripts: [
        { key: "main", source: "when green flag clicked\nsay [hello]" },
        { key: "usage", source: usageSource },
      ],
      units: [
        {
          key: "script:main:title",
          kind: "script-title",
          sourceText: "Main",
        },
      ],
    });

    await db.insert(snippetRevisionScripts).values({
      id: `script-${seed.snippetId}-usage`,
      revisionId: seed.revisionId,
      scriptKey: "usage",
      position: 1,
      source: usageSource,
    });
    await db
      .update(snippetRevisions)
      .set({
        metadata: { previewScriptKey: "usage" },
        translationBasisHash: basis,
      })
      .where(eq(snippetRevisions.id, seed.revisionId));
    await db
      .update(snippetLocalizationRevisions)
      .set({ translationBasisHash: basis })
      .where(eq(snippetLocalizationRevisions.id, seed.englishRevisionId));

    await publishSnippetRevision(db, {
      snippetId: seed.snippetId,
      revisionId: seed.revisionId,
      englishLocalizationRevisionId: seed.englishRevisionId,
    });

    const listed = await listPublishedSnippets(db, "en");
    expect(listed.find(({ id }) => id === seed.snippetId)?.previewSource).toBe(
      usageSource,
    );
    const searched = await searchPublishedSnippets(db, "en", { query: "" });
    expect(
      searched.items.find(({ id }) => id === seed.snippetId)?.previewSource,
    ).toBe(usageSource);
  });

  it("rejects a revision whose selected preview script is missing", async () => {
    const db = createDatabase(env.DB);
    const seed = await seedSnippet(db, crypto.randomUUID());
    await db
      .update(snippetRevisions)
      .set({ metadata: { previewScriptKey: "missing" } })
      .where(eq(snippetRevisions.id, seed.revisionId));

    await expect(
      publishSnippetRevision(db, {
        snippetId: seed.snippetId,
        revisionId: seed.revisionId,
        englishLocalizationRevisionId: seed.englishRevisionId,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_PREVIEW",
    } satisfies Partial<PublicationError>);

    const publications = await db
      .select()
      .from(snippetPublications)
      .where(eq(snippetPublications.snippetId, seed.snippetId));
    expect(publications).toHaveLength(0);
  });

  it("keeps translations valid across revisions with the same basis", async () => {
    const db = createDatabase(env.DB);
    const suffix = crypto.randomUUID();
    const seed = await seedSnippet(db, suffix);
    const chineseRevisionId = await seedChineseLocalization(db, seed, suffix);

    await publishSnippetRevision(db, {
      snippetId: seed.snippetId,
      revisionId: seed.revisionId,
      englishLocalizationRevisionId: seed.englishRevisionId,
    });
    await publishLocalizationRevision(db, {
      localizationRevisionId: chineseRevisionId,
    });

    const secondRevisionId = `revision-${suffix}-2`;
    await db.insert(snippetRevisions).values({
      id: secondRevisionId,
      snippetId: seed.snippetId,
      revisionNumber: 2,
      contentHash: `snippet-content-v1:${"c".repeat(64)}`,
      translationBasisHash: seed.basis,
      changeSummary: "Only non-translatable metadata changed",
    });
    await db.insert(snippetRevisionScripts).values({
      id: `script-${suffix}-main-2`,
      revisionId: secondRevisionId,
      scriptKey: "main",
      position: 0,
      source: "when green flag clicked\nsay [hello]",
    });
    await db.insert(snippetRevisionTranslationUnits).values({
      id: `unit-${suffix}-main-title-2`,
      revisionId: secondRevisionId,
      unitKey: "script:main:title",
      kind: "script-title",
      position: 0,
      sourceText: "Main",
    });

    await publishSnippetRevision(db, {
      snippetId: seed.snippetId,
      revisionId: secondRevisionId,
      englishLocalizationRevisionId: seed.englishRevisionId,
    });

    const resolved = await resolvePublishedSnippet(db, seed.slug, "zh-CN");
    expect(resolved?.revision.id).toBe(secondRevisionId);
    expect(resolved?.localization.locale).toBe("zh-CN");
    expect(resolved?.localization.revisionId).toBe(chineseRevisionId);

    const changedBasis = await computeTranslationBasisHash({
      representation: "scratchblocks",
      representationVersion: 1,
      scripts: [
        { key: "main", source: "when green flag clicked\nsay [goodbye]" },
      ],
      units: [
        {
          key: "script:main:title",
          kind: "script-title",
          sourceText: "Main",
        },
      ],
    });
    const thirdRevisionId = `revision-${suffix}-3`;
    const secondEnglishRevisionId = `localization-revision-${suffix}-en-2`;
    await db.insert(snippetRevisions).values({
      id: thirdRevisionId,
      snippetId: seed.snippetId,
      revisionNumber: 3,
      contentHash: `snippet-content-v1:${"e".repeat(64)}`,
      translationBasisHash: changedBasis,
      changeSummary: "Translation-sensitive code changed",
    });
    await db.insert(snippetRevisionScripts).values({
      id: `script-${suffix}-main-3`,
      revisionId: thirdRevisionId,
      scriptKey: "main",
      position: 0,
      source: "when green flag clicked\nsay [goodbye]",
    });
    await db.insert(snippetRevisionTranslationUnits).values({
      id: `unit-${suffix}-main-title-3`,
      revisionId: thirdRevisionId,
      unitKey: "script:main:title",
      kind: "script-title",
      position: 0,
      sourceText: "Main",
    });
    await db.insert(snippetLocalizationRevisions).values({
      id: secondEnglishRevisionId,
      localizationId: seed.englishLocalizationId,
      revisionNumber: 2,
      translationBasisHash: changedBasis,
      sourceRevisionId: thirdRevisionId,
      title: "Changed English example",
      summary: "Changed English summary",
      bodyMarkdown: "Updated searchable body",
      keywords: ["updated"],
    });

    await publishSnippetRevision(db, {
      snippetId: seed.snippetId,
      revisionId: thirdRevisionId,
      englishLocalizationRevisionId: secondEnglishRevisionId,
    });

    const afterBasisChange = await resolvePublishedSnippet(
      db,
      seed.slug,
      "zh-CN",
    );
    expect(afterBasisChange?.revision.id).toBe(thirdRevisionId);
    expect(afterBasisChange?.localization.locale).toBe("en");
    expect(afterBasisChange?.localization.fallbackUsed).toBe(true);

    const compatibleDocuments = await db
      .select()
      .from(searchDocuments)
      .where(eq(searchDocuments.snippetId, seed.snippetId));
    expect(compatibleDocuments).toHaveLength(1);
    expect(compatibleDocuments[0]?.locale).toBe("en");
  });

  it("rejects an incompatible translation and protects published content", async () => {
    const db = createDatabase(env.DB);
    const suffix = crypto.randomUUID();
    const seed = await seedSnippet(db, suffix);

    await publishSnippetRevision(db, {
      snippetId: seed.snippetId,
      revisionId: seed.revisionId,
      englishLocalizationRevisionId: seed.englishRevisionId,
    });

    const incompatibleRevisionId = await seedChineseLocalization(
      db,
      seed,
      suffix,
      `translation-basis-v1:${"f".repeat(64)}`,
    );

    await expect(
      publishLocalizationRevision(db, {
        localizationRevisionId: incompatibleRevisionId,
      }),
    ).rejects.toMatchObject({
      code: "BASIS_MISMATCH",
    } satisfies Partial<PublicationError>);

    await expect(
      db
        .update(snippetRevisionScripts)
        .set({ source: "say [mutated]" })
        .where(eq(snippetRevisionScripts.revisionId, seed.revisionId)),
    ).rejects.toThrow();

    const [script] = await db
      .select({ source: snippetRevisionScripts.source })
      .from(snippetRevisionScripts)
      .where(eq(snippetRevisionScripts.revisionId, seed.revisionId));
    expect(script?.source).toBe("when green flag clicked\nsay [hello]");
  });

  it("recomputes and verifies the translation basis before publication", async () => {
    const db = createDatabase(env.DB);
    const seed = await seedSnippet(db, crypto.randomUUID());

    await db
      .update(snippetRevisions)
      .set({ translationBasisHash: `translation-basis-v1:${"0".repeat(64)}` })
      .where(eq(snippetRevisions.id, seed.revisionId));

    await expect(
      publishSnippetRevision(db, {
        snippetId: seed.snippetId,
        revisionId: seed.revisionId,
        englishLocalizationRevisionId: seed.englishRevisionId,
      }),
    ).rejects.toMatchObject({
      code: "BASIS_INTEGRITY_MISMATCH",
    } satisfies Partial<PublicationError>);

    const publications = await db
      .select()
      .from(snippetPublications)
      .where(eq(snippetPublications.snippetId, seed.snippetId));
    expect(publications).toHaveLength(0);
  });
});
