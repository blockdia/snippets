import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, inject, it } from "vitest";

import { createDatabase } from "../app/db/client";
import {
  snippetFeedback,
  snippetLocalizationRevisions,
  snippetLocalizations,
  snippetRevisions,
  snippets,
} from "../app/db/schema";
import {
  getAdminFeedback,
  listAdminFeedback,
  reviewAdminFeedback,
} from "../app/services/admin-feedback.server";
import {
  coarseUserAgent,
  createSnippetFeedback,
  updateSnippetFeedback,
} from "../app/services/feedback.server";
import { localDevelopmentActor } from "../app/auth/admin.server";

const migrations = inject("d1Migrations");

beforeEach(async () => {
  await applyD1Migrations(env.DB, migrations);
});

async function seedFeedbackTarget(suffix: string) {
  const db = createDatabase(env.DB);
  const snippetId = `feedback-snippet-${suffix}`;
  const revisionId = `feedback-revision-${suffix}`;
  const localizationId = `feedback-localization-${suffix}`;
  const localizationRevisionId = `feedback-localization-revision-${suffix}`;
  await db.insert(snippets).values({
    id: snippetId,
    slug: `feedback-${suffix}`,
  });
  await db.insert(snippetRevisions).values({
    id: revisionId,
    snippetId,
    revisionNumber: 1,
    contentHash: `snippet-content-v1:${"a".repeat(64)}`,
    translationBasisHash: `translation-basis-v1:${"b".repeat(64)}`,
  });
  await db.insert(snippetLocalizations).values({
    id: localizationId,
    snippetId,
    locale: "en",
  });
  await db.insert(snippetLocalizationRevisions).values({
    id: localizationRevisionId,
    localizationId,
    revisionNumber: 1,
    translationBasisHash: `translation-basis-v1:${"b".repeat(64)}`,
    sourceRevisionId: revisionId,
    title: "Feedback target",
    summary: "Feedback target summary",
  });
  return { db, snippetId, revisionId, localizationRevisionId };
}

describe("snippet feedback", () => {
  it("creates an idempotent pending record and progressively enriches it", async () => {
    const target = await seedFeedbackTarget(crypto.randomUUID());
    const clientId = crypto.randomUUID();
    const clientSubmissionId = crypto.randomUUID();
    const input = {
      clientId,
      clientSubmissionId,
      snippetId: target.snippetId,
      revisionId: target.revisionId,
      localizationRevisionId: target.localizationRevisionId,
      requestedLocale: "zh-CN",
      contentLocale: "en",
      helpful: false,
      pagePath: "/zh-cn/snippets/feedback-test",
      entryReferrerKind: "internal",
      deviceCategory: "phone",
      viewportBucket: "xs",
      inputMode: "touch",
      colorScheme: "dark",
      reducedMotion: false,
      clientLanguage: "zh-CN",
      browserFamily: "Safari",
      osFamily: "iOS",
      cfCountry: "CN",
      cfColo: "SZX",
    };

    const saved = await createSnippetFeedback(target.db, input);
    const feedbackId = saved.feedbackId;
    await expect(createSnippetFeedback(target.db, input)).resolves.toEqual(
      saved,
    );
    await expect(
      updateSnippetFeedback(target.db, feedbackId, clientId, {
        kind: "reason",
        reason: "clear",
        detail: null,
        expectedHelpful: true,
      }),
    ).resolves.toBe(false);
    await expect(
      updateSnippetFeedback(target.db, feedbackId, clientId, {
        kind: "negative-contribution",
        reason: "translation-issue",
        suggestion: "Use a clearer translation for the heading.",
        attribution: "reader@example.com",
        anonymousDisplay: true,
      }),
    ).resolves.toBe(true);

    const rows = await target.db
      .select()
      .from(snippetFeedback)
      .where(eq(snippetFeedback.id, feedbackId));
    expect(rows).toEqual([
      expect.objectContaining({
        helpful: false,
        reviewStatus: "pending",
        reason: "translation-issue",
        reasonDetail: null,
        assistanceIntent: "accepted",
        suggestion: "Use a clearer translation for the heading.",
        anonymousDisplay: true,
        cfCountry: "CN",
        cfColo: "SZX",
      }),
    ]);

    await expect(
      updateSnippetFeedback(target.db, feedbackId, clientId, {
        kind: "rating",
        helpful: true,
      }),
    ).resolves.toBe(true);
    const [revised] = await target.db
      .select()
      .from(snippetFeedback)
      .where(eq(snippetFeedback.id, feedbackId));
    expect(revised).toEqual(
      expect.objectContaining({
        helpful: true,
        reason: null,
        reasonDetail: null,
        assistanceIntent: "not-asked",
        suggestion: null,
        attribution: null,
        anonymousDisplay: true,
        reviewStatus: "pending",
      }),
    );
    await expect(
      updateSnippetFeedback(target.db, feedbackId, clientId, {
        kind: "reason",
        reason: "clear",
        detail: null,
        expectedHelpful: true,
      }),
    ).resolves.toBe(true);
    await expect(
      updateSnippetFeedback(target.db, feedbackId, crypto.randomUUID(), {
        kind: "decline-assistance",
      }),
    ).resolves.toBe(false);
  });

  it("reduces user agents to browser and OS families", () => {
    expect(
      coarseUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ browserFamily: "Safari", osFamily: "iOS" });
    expect(
      coarseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36 Edg/128.0",
      ),
    ).toEqual({ browserFamily: "Edge", osFamily: "Windows" });
  });
});

describe("admin feedback workflow", () => {
  it("lists, filters and searches feedback without exposing client IDs", async () => {
    const group = crypto.randomUUID();
    const suggestion = `Use clearer translation ${group}.`;
    const negativeTarget = await seedFeedbackTarget(`${group}-negative`);
    const positiveTarget = await seedFeedbackTarget(`${group}-positive`);
    const negativeClientId = crypto.randomUUID();
    const negative = await createSnippetFeedback(negativeTarget.db, {
      clientId: negativeClientId,
      clientSubmissionId: crypto.randomUUID(),
      snippetId: negativeTarget.snippetId,
      revisionId: negativeTarget.revisionId,
      localizationRevisionId: negativeTarget.localizationRevisionId,
      requestedLocale: "zh-CN",
      contentLocale: "en",
      helpful: false,
      pagePath: "/zh-cn/snippets/feedback-test",
      entryReferrerKind: "internal",
      deviceCategory: "phone",
      viewportBucket: "xs",
      inputMode: "touch",
      colorScheme: "dark",
      reducedMotion: false,
      clientLanguage: "zh-CN",
      browserFamily: "Safari",
      osFamily: "iOS",
      cfCountry: "CN",
      cfColo: "SZX",
    });
    await updateSnippetFeedback(
      negativeTarget.db,
      negative.feedbackId,
      negativeClientId,
      {
        kind: "negative-contribution",
        reason: "translation-issue",
        suggestion,
        attribution: "Example reader",
        anonymousDisplay: true,
      },
    );
    await createSnippetFeedback(positiveTarget.db, {
      clientId: crypto.randomUUID(),
      clientSubmissionId: crypto.randomUUID(),
      snippetId: positiveTarget.snippetId,
      revisionId: positiveTarget.revisionId,
      localizationRevisionId: positiveTarget.localizationRevisionId,
      requestedLocale: "en",
      contentLocale: "en",
      helpful: true,
      pagePath: "/en/snippets/feedback-test",
      entryReferrerKind: null,
      deviceCategory: null,
      viewportBucket: null,
      inputMode: null,
      colorScheme: null,
      reducedMotion: null,
      clientLanguage: null,
      browserFamily: null,
      osFamily: null,
      cfCountry: null,
      cfColo: null,
    });

    const pending = await listAdminFeedback(negativeTarget.db, {
      query: group,
      status: "pending",
      rating: "all",
      page: 1,
    });
    expect(pending.pagination.total).toBe(2);
    expect(pending.items).toHaveLength(2);

    const searched = await listAdminFeedback(negativeTarget.db, {
      query: suggestion,
      status: "all",
      rating: "not-helpful",
      page: 1,
    });
    expect(searched.items).toEqual([
      expect.objectContaining({
        id: negative.feedbackId,
        excerpt: suggestion,
        helpful: false,
      }),
    ]);

    const detail = await getAdminFeedback(
      negativeTarget.db,
      negative.feedbackId,
    );
    expect(detail).toMatchObject({
      id: negative.feedbackId,
      revision: { id: negativeTarget.revisionId, number: 1 },
      localizationRevision: {
        id: negativeTarget.localizationRevisionId,
        number: 1,
      },
      environment: { browserFamily: "Safari", cfCountry: "CN" },
    });
    expect(detail).not.toHaveProperty("clientId");
    expect(detail).not.toHaveProperty("clientSubmissionId");
  });

  it("uses stable 25-item pagination and clamps out-of-range pages", async () => {
    const group = crypto.randomUUID();
    const target = await seedFeedbackTarget(group);
    for (let index = 0; index < 26; index += 1) {
      await createSnippetFeedback(target.db, {
        clientId: crypto.randomUUID(),
        clientSubmissionId: crypto.randomUUID(),
        snippetId: target.snippetId,
        revisionId: target.revisionId,
        localizationRevisionId: target.localizationRevisionId,
        requestedLocale: "en",
        contentLocale: "en",
        helpful: index % 2 === 0,
        pagePath: "/en/snippets/feedback-test",
        entryReferrerKind: null,
        deviceCategory: null,
        viewportBucket: null,
        inputMode: null,
        colorScheme: null,
        reducedMotion: null,
        clientLanguage: null,
        browserFamily: null,
        osFamily: null,
        cfCountry: null,
        cfColo: null,
      });
    }
    const filters = {
      query: group,
      status: "pending" as const,
      rating: "all" as const,
      page: 1,
    };
    const first = await listAdminFeedback(target.db, filters);
    const repeated = await listAdminFeedback(target.db, filters);
    const last = await listAdminFeedback(target.db, { ...filters, page: 99 });
    expect(first.items).toHaveLength(25);
    expect(first.items.map(({ id }) => id)).toEqual(
      repeated.items.map(({ id }) => id),
    );
    expect(last.pagination).toMatchObject({ page: 2, pageCount: 2, total: 26 });
    expect(last.items).toHaveLength(1);
    expect(first.items.map(({ id }) => id)).not.toContain(last.items[0]?.id);
  });

  it("reviews records reversibly and rejects stale writes", async () => {
    const target = await seedFeedbackTarget(crypto.randomUUID());
    const saved = await createSnippetFeedback(target.db, {
      clientId: crypto.randomUUID(),
      clientSubmissionId: crypto.randomUUID(),
      snippetId: target.snippetId,
      revisionId: target.revisionId,
      localizationRevisionId: target.localizationRevisionId,
      requestedLocale: "en",
      contentLocale: "en",
      helpful: true,
      pagePath: "/en/snippets/feedback-test",
      entryReferrerKind: null,
      deviceCategory: null,
      viewportBucket: null,
      inputMode: null,
      colorScheme: null,
      reducedMotion: null,
      clientLanguage: null,
      browserFamily: null,
      osFamily: null,
      cfCountry: null,
      cfColo: null,
    });
    const actor = localDevelopmentActor();
    const original = await getAdminFeedback(target.db, saved.feedbackId);
    expect(original).not.toBeNull();
    await reviewAdminFeedback(target.db, actor, saved.feedbackId, {
      status: "accepted",
      note: "  Apply this suggestion.  ",
      expectedUpdatedAt: original!.updatedAt,
    });
    const accepted = await getAdminFeedback(target.db, saved.feedbackId);
    expect(accepted).toMatchObject({
      reviewStatus: "accepted",
      reviewNote: "Apply this suggestion.",
      reviewedBy: actor.id,
    });
    expect(accepted?.reviewedAt).not.toBeNull();

    await expect(
      reviewAdminFeedback(target.db, actor, saved.feedbackId, {
        status: "rejected",
        note: "stale",
        expectedUpdatedAt: original!.updatedAt,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await reviewAdminFeedback(target.db, actor, saved.feedbackId, {
      status: "pending",
      note: "",
      expectedUpdatedAt: accepted!.updatedAt,
    });
    expect(await getAdminFeedback(target.db, saved.feedbackId)).toMatchObject({
      reviewStatus: "pending",
      reviewNote: null,
      reviewedBy: actor.id,
    });
    await expect(
      reviewAdminFeedback(target.db, actor, crypto.randomUUID(), {
        status: "accepted",
        note: "",
        expectedUpdatedAt: original!.updatedAt,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
