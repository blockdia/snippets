import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeEach, describe, expect, inject, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  AdminAuthenticationError,
  authenticateAdminRequest,
  localDevelopmentActor,
  requireSameOriginMutation,
} from "../app/auth/admin.server";
import { createDatabase } from "../app/db/client";
import { searchDocuments } from "../app/db/schema";
import {
  getAdminDashboard,
  getAdminSnippet,
  listAdminTags,
  publishAdminLocalizationDraft,
  publishAdminSnippetDraft,
  saveAdminSnippetDraft,
  saveAdminTag,
  setAdminSnippetArchived,
  storeAdminDemoArtifact,
  deleteUnpublishedAdminSnippet,
  type AdminSnippetDraftInput,
} from "../app/services/admin.server";
import { resolvePublishedSnippet } from "../app/services/snippets.server";

const migrations = inject("d1Migrations");

beforeEach(async () => {
  await applyD1Migrations(env.DB, migrations);
});

function draftInput(
  suffix: string,
  overrides: Partial<AdminSnippetDraftInput> = {},
): AdminSnippetDraftInput {
  return {
    slug: `admin-${suffix}`,
    changeSummary: "Create from admin",
    codeLicense: "CC0-1.0",
    previewScriptKey: "main",
    scripts: [
      {
        key: "main",
        title: "Main",
        source: "when green flag clicked\nsay [hello]",
      },
    ],
    units: [],
    references: [],
    contributors: [],
    tagIds: [],
    localizations: [
      {
        locale: "en",
        title: "Admin example",
        summary: "Created from the content studio",
        seoTitle: "",
        seoDescription: "",
        bodyMarkdown: "English body",
        keywords: ["admin"],
        proseLicense: "CC-BY-SA-4.0",
        basisAccepted: true,
        scriptOverrides: [],
        units: [],
      },
      {
        locale: "zh-CN",
        title: "管理端示例",
        summary: "由内容工作台创建",
        seoTitle: "",
        seoDescription: "",
        bodyMarkdown: "中文正文",
        keywords: ["管理"],
        proseLicense: "CC-BY-SA-4.0",
        basisAccepted: true,
        scriptOverrides: [{ key: "main", source: "当绿旗被点击\n说 [你好]" }],
        units: [],
      },
      {
        locale: "zh-TW",
        title: "",
        summary: "",
        seoTitle: "",
        seoDescription: "",
        bodyMarkdown: "",
        keywords: [],
        proseLicense: "CC-BY-SA-4.0",
        basisAccepted: false,
        scriptOverrides: [],
        units: [],
      },
    ],
    ...overrides,
  };
}

describe("admin authentication boundary", () => {
  it("allows only explicit loopback development bypass", async () => {
    await expect(
      authenticateAdminRequest(
        new Request("http://localhost/admin"),
        {
          ACCESS_AUD: "replace-me",
          ACCESS_TEAM_DOMAIN: "https://replace-me.cloudflareaccess.com",
        },
        { allowLocalDevelopment: true },
      ),
    ).resolves.toMatchObject({ id: "development:owner", role: "owner" });

    await expect(
      authenticateAdminRequest(
        new Request("https://snippets.example/admin"),
        {
          ACCESS_AUD: "replace-me",
          ACCESS_TEAM_DOMAIN: "https://replace-me.cloudflareaccess.com",
        },
        { allowLocalDevelopment: true },
      ),
    ).rejects.toBeInstanceOf(AdminAuthenticationError);
  });

  it("rejects cross-origin mutations", () => {
    expect(() =>
      requireSameOriginMutation(
        new Request("https://snippets.example/admin", {
          method: "POST",
          headers: { Origin: "https://snippets.example" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      requireSameOriginMutation(
        new Request("https://snippets.example/admin", {
          method: "POST",
          headers: { Origin: "https://attacker.example" },
        }),
      ),
    ).toThrow(Response);
  });
});

describe("admin content workflow", () => {
  it("creates, updates, publishes and locks the public slug", async () => {
    const db = createDatabase(env.DB);
    const actor = localDevelopmentActor();
    const first = await saveAdminSnippetDraft(
      db,
      actor,
      draftInput(crypto.randomUUID()),
    );
    const editor = await getAdminSnippet(db, first.snippetId);
    expect(editor).toMatchObject({
      revision: { id: first.revisionId, number: 1, status: "draft" },
      localizations: [
        expect.objectContaining({ locale: "en", compatible: true }),
        expect.objectContaining({ locale: "zh-CN", compatible: true }),
        expect.objectContaining({ locale: "zh-TW", status: "missing" }),
      ],
    });

    const updated = await saveAdminSnippetDraft(db, actor, {
      ...draftInput("unused"),
      snippetId: first.snippetId,
      revisionId: first.revisionId,
      slug: editor?.snippet.slug ?? "missing",
      changeSummary: "Update the draft",
    });
    expect(updated.revisionId).toBe(first.revisionId);

    await publishAdminSnippetDraft(db, first.snippetId, first.revisionId);
    await publishAdminLocalizationDraft(
      db,
      first.snippetId,
      first.revisionId,
      "zh-CN",
    );
    await expect(
      resolvePublishedSnippet(db, editor?.snippet.slug ?? "missing", "zh-CN"),
    ).resolves.toMatchObject({
      localization: { locale: "zh-CN", fallbackUsed: false },
    });

    await expect(
      saveAdminSnippetDraft(db, actor, {
        ...draftInput("changed-slug"),
        snippetId: first.snippetId,
        revisionId: first.revisionId,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });

  it("keeps stale translations incompatible after code changes", async () => {
    const db = createDatabase(env.DB);
    const actor = localDevelopmentActor();
    const source = draftInput(crypto.randomUUID());
    const first = await saveAdminSnippetDraft(db, actor, source);
    await publishAdminSnippetDraft(db, first.snippetId, first.revisionId);
    await publishAdminLocalizationDraft(
      db,
      first.snippetId,
      first.revisionId,
      "zh-CN",
    );

    const changed = await saveAdminSnippetDraft(db, actor, {
      ...source,
      snippetId: first.snippetId,
      revisionId: first.revisionId,
      scripts: [
        {
          ...source.scripts[0]!,
          source: "when green flag clicked\nsay [changed]",
        },
      ],
      localizations: source.localizations.map((entry) =>
        entry.locale === "zh-CN" ? { ...entry, basisAccepted: false } : entry,
      ),
    });
    expect(changed.revisionId).not.toBe(first.revisionId);
    const editor = await getAdminSnippet(db, first.snippetId);
    expect(
      editor?.localizations.find((entry) => entry.locale === "zh-CN"),
    ).toMatchObject({ compatible: false, status: "published" });
  });

  it("archives, restores and rebuilds public search documents", async () => {
    const db = createDatabase(env.DB);
    const input = draftInput(crypto.randomUUID());
    const saved = await saveAdminSnippetDraft(
      db,
      localDevelopmentActor(),
      input,
    );
    await publishAdminSnippetDraft(db, saved.snippetId, saved.revisionId);
    await setAdminSnippetArchived(db, saved.snippetId, true);
    await expect(
      resolvePublishedSnippet(db, input.slug, "en"),
    ).resolves.toBeNull();
    expect(
      await db
        .select()
        .from(searchDocuments)
        .where(eq(searchDocuments.snippetId, saved.snippetId)),
    ).toHaveLength(0);

    await setAdminSnippetArchived(db, saved.snippetId, false);
    await expect(
      resolvePublishedSnippet(db, input.slug, "en"),
    ).resolves.toMatchObject({
      slug: input.slug,
    });
    expect(
      await db
        .select()
        .from(searchDocuments)
        .where(eq(searchDocuments.snippetId, saved.snippetId)),
    ).toHaveLength(1);
  });

  it("manages localized tags and dashboard counts", async () => {
    const db = createDatabase(env.DB);
    const before = await getAdminDashboard(db);
    const tagId = await saveAdminTag(db, {
      slug: `tag-${crypto.randomUUID()}`,
      localizations: {
        en: { name: "Drawing", description: "Draw things" },
        "zh-CN": { name: "绘图", description: "绘制图形" },
        "zh-TW": { name: "繪圖", description: "繪製圖形" },
      },
    });
    await expect(listAdminTags(db)).resolves.toContainEqual(
      expect.objectContaining({ id: tagId, usageCount: 0 }),
    );
    const input = draftInput(crypto.randomUUID(), { tagIds: [tagId] });
    await saveAdminSnippetDraft(db, localDevelopmentActor(), input);
    await expect(getAdminDashboard(db)).resolves.toMatchObject({
      counts: {
        active: before.counts.active + 1,
        drafts: before.counts.drafts + 1,
        published: before.counts.published,
      },
    });
  });

  it("stores only bounded ZIP-based SB3 demos", async () => {
    const db = createDatabase(env.DB);
    const saved = await saveAdminSnippetDraft(
      db,
      localDevelopmentActor(),
      draftInput(crypto.randomUUID()),
    );
    const file = new File(
      [new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3])],
      "demo.sb3",
      {
        type: "application/x.scratch.sb3",
      },
    );
    await storeAdminDemoArtifact(db, env.ARTIFACTS, saved.revisionId, file, {
      license: "CC-BY-4.0",
      attribution: "Example",
    });
    await expect(getAdminSnippet(db, saved.snippetId)).resolves.toMatchObject({
      demo: { byteSize: 7, license: "CC-BY-4.0" },
    });

    await expect(
      storeAdminDemoArtifact(
        db,
        env.ARTIFACTS,
        saved.revisionId,
        new File(["not a zip"], "bad.sb3"),
        { license: "CC-BY-4.0", attribution: "" },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("deletes an unpublished snippet and its dependent revisions", async () => {
    const db = createDatabase(env.DB);
    const saved = await saveAdminSnippetDraft(
      db,
      localDevelopmentActor(),
      draftInput(crypto.randomUUID()),
    );

    await deleteUnpublishedAdminSnippet(db, env.ARTIFACTS, saved.snippetId);

    await expect(getAdminSnippet(db, saved.snippetId)).resolves.toBeNull();
  });
});
