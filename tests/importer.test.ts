import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeEach, describe, expect, inject, it } from "vitest";

import { buildLegacyImportPlan } from "../app/importer/build-plan";
import {
  applyLegacyImport,
  generateLegacyImportStatements,
} from "../app/importer/sql";
import type { LegacyInputSnapshot } from "../app/importer/types";
import { createDatabase } from "../app/db/client";
import {
  resolvePublishedSnippet,
  searchPublishedSnippets,
} from "../app/services/snippets.server";

const migrations = inject("d1Migrations");

beforeEach(async () => {
  await applyD1Migrations(env.DB, migrations);
});

function fixture(extraTag = false): LegacyInputSnapshot {
  return {
    sourceLabel: "fixture-gallery",
    globalTags: {
      math: { en: "math", "zh-cn": "数学", "zh-tw": "數學" },
      utility: { en: "utility", "zh-cn": "工具", "zh-tw": "工具" },
    },
    moduleDefaults: {
      en: { scriptTitles: { main: "Main" } },
      "zh-cn": { scriptTitles: { main: "主脚本" } },
      "zh-tw": { scriptTitles: { main: "主腳本" } },
    },
    modules: [
      {
        directory: "power",
        meta: {
          id: "power",
          name: "Power",
          description: "Raise a number to a power",
          tags: ["math"],
          contributors: ["gh/example"],
          variables: [{ name: "result", type: "variable", scope: "sprite" }],
        },
        scripts: [
          {
            filename: "01-main.txt",
            content: "define power (base) (exponent)\nset [result v] to (base)",
          },
        ],
        translations: [
          {
            locale: "zh-cn",
            sourcePath: "content/modules/power/i18n/zh-cn.json",
            value: {
              name: "乘方",
              description: "计算乘方",
              variables: { result: "结果" },
              procedures: { "power %s %s": "乘方 %s %s" },
            },
          },
        ],
        notes: [],
      },
      {
        directory: "consumer",
        meta: {
          id: "consumer",
          name: "Consumer",
          description: "Use the reusable power script",
          previewScriptKey: "main",
          tags: extraTag ? ["math", "utility"] : ["math"],
          contributors: ["gh/example"],
          references: [
            {
              title: "Scratch",
              url: "https://scratch.mit.edu/",
              type: "article",
            },
          ],
        },
        scripts: [
          {
            filename: "01-main.txt",
            content: "!import power:1\nwhen green flag clicked\nsay [done]",
          },
        ],
        translations: [
          {
            locale: "zh_cn",
            sourcePath: "content/modules/consumer/i18n/zh_cn.json",
            value: { name: "使用方", description: "复用乘方代码" },
          },
        ],
        notes: [
          {
            locale: "en",
            markdown: "Reusable example notes.",
            sourcePath: "content/modules/consumer/notes/en.md",
          },
        ],
        demo: {
          bytes: new Uint8Array([80, 75, 3, 4]),
          sourcePath: "content/modules/consumer/demo.sb3",
        },
      },
    ],
  };
}

async function scalar(query: string): Promise<number> {
  const row = await env.DB.prepare(query).first<Record<string, number>>();
  return row?.value ?? 0;
}

describe("legacy importer", () => {
  it("builds a deterministic, canonical and dependency-expanded plan", async () => {
    const first = await buildLegacyImportPlan(fixture());
    const second = await buildLegacyImportPlan(fixture());

    expect(first.diagnostics).toEqual([]);
    expect(second).toEqual(first);
    expect(first.counts).toMatchObject({
      snippets: 2,
      localizations: 4,
      contributors: 1,
      artifacts: 1,
    });
    const consumer = first.snippets.find(
      (snippet) => snippet.legacyId === "consumer",
    );
    expect(consumer?.scripts).toHaveLength(2);
    expect(consumer?.scripts[0]).toMatchObject({
      sourceModuleId: "power",
      importedFrom: { moduleId: "power", scriptId: "main" },
    });
    expect(consumer?.previewScriptKey).toBe("main");
    expect(consumer?.localizations.map(({ locale }) => locale)).toEqual([
      "en",
      "zh-CN",
    ]);
    expect(consumer?.artifact?.storageKey).toMatch(/^sb3\/[a-f0-9]{64}\.sb3$/);

    const translationEdit = fixture();
    const translated = translationEdit.modules[0]!.translations[0]!.value as {
      description: string;
    };
    translated.description = "新的译文";
    const translatedPlan = await buildLegacyImportPlan(translationEdit);
    const firstPower = first.snippets.find(
      ({ legacyId }) => legacyId === "power",
    )!;
    const translatedPower = translatedPlan.snippets.find(
      ({ legacyId }) => legacyId === "power",
    )!;
    expect(translatedPower.translationBasisHash).toBe(
      firstPower.translationBasisHash,
    );
    expect(translatedPower.localizations[1]?.revisionId).not.toBe(
      firstPower.localizations[1]?.revisionId,
    );
  });

  it("imports atomically and is idempotent for an identical snapshot", async () => {
    const plan = await buildLegacyImportPlan(fixture());
    const first = await applyLegacyImport(
      env.DB,
      plan,
      "2026-08-25T00:00:00.000Z",
    );
    const second = await applyLegacyImport(
      env.DB,
      plan,
      "2026-08-25T01:00:00.000Z",
    );

    expect(first.valid).toBe(true);
    expect(second.valid).toBe(true);
    expect(
      await scalar("SELECT count(*) AS value FROM snippet_revisions"),
    ).toBe(2);
    expect(
      await scalar(
        "SELECT count(*) AS value FROM snippet_localization_revisions",
      ),
    ).toBe(4);
    expect(
      await env.DB.prepare(
        "SELECT storage FROM artifacts WHERE artifact_key = 'demo'",
      ).first<{ storage: string }>(),
    ).toEqual({ storage: "r2" });

    const db = createDatabase(env.DB);
    const resolved = await resolvePublishedSnippet(db, "consumer", "zh-CN");
    expect(resolved?.localization).toMatchObject({
      locale: "zh-CN",
      fallbackUsed: false,
      title: "使用方",
    });
    expect(resolved?.scripts).toHaveLength(2);
    const search = await searchPublishedSnippets(db, "zh-CN", {
      query: "复用乘方",
    });
    expect(search.items.map(({ slug }) => slug)).toContain("consumer");
    expect(
      search.items.find(({ slug }) => slug === "consumer")?.previewSource,
    ).toContain("done");
  });

  it("creates a content revision without invalidating unchanged translations", async () => {
    const initial = await buildLegacyImportPlan(fixture());
    const changed = await buildLegacyImportPlan(fixture(true));
    const initialConsumer = initial.snippets.find(
      ({ legacyId }) => legacyId === "consumer",
    )!;
    const changedConsumer = changed.snippets.find(
      ({ legacyId }) => legacyId === "consumer",
    )!;

    expect(changedConsumer.revisionId).not.toBe(initialConsumer.revisionId);
    expect(changedConsumer.translationBasisHash).toBe(
      initialConsumer.translationBasisHash,
    );
    expect(
      changedConsumer.localizations.map(({ revisionId }) => revisionId),
    ).toEqual(
      initialConsumer.localizations.map(({ revisionId }) => revisionId),
    );

    await applyLegacyImport(env.DB, initial, "2026-08-25T00:00:00.000Z");
    await applyLegacyImport(env.DB, changed, "2026-08-25T01:00:00.000Z");

    expect(
      await scalar(
        `SELECT count(*) AS value FROM snippet_revisions WHERE snippet_id = '${changedConsumer.snippetId}'`,
      ),
    ).toBe(2);
    expect(
      await scalar(
        `SELECT count(*) AS value FROM snippet_localization_revisions WHERE localization_id LIKE 'legacy-localization-consumer-%'`,
      ),
    ).toBe(2);
    const publication = await env.DB.prepare(
      "SELECT revision_id FROM snippet_publications WHERE snippet_id = ?",
    )
      .bind(changedConsumer.snippetId)
      .first<{ revision_id: string }>();
    expect(publication?.revision_id).toBe(changedConsumer.revisionId);
  });

  it("refuses to generate SQL when a legacy import cannot resolve", async () => {
    const invalid = fixture();
    invalid.modules[1]!.scripts[0]!.content = "!import missing:1";
    const plan = await buildLegacyImportPlan(invalid);
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "error", code: "IMPORT_NOT_FOUND" }),
    );
    expect(() =>
      generateLegacyImportStatements(plan, "2026-08-25T00:00:00.000Z"),
    ).toThrow("plan has errors");
  });

  it("rejects a preview key that does not resolve to an imported script", async () => {
    const invalid = fixture();
    invalid.modules[1]!.meta = {
      ...(invalid.modules[1]!.meta as Record<string, unknown>),
      previewScriptKey: "missing",
    };

    const plan = await buildLegacyImportPlan(invalid);

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "INVALID_PREVIEW_SCRIPT",
      }),
    );
    expect(() =>
      generateLegacyImportStatements(plan, "2026-08-25T00:00:00.000Z"),
    ).toThrow("plan has errors");
  });
});
