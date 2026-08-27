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
  coarseUserAgent,
  createSnippetFeedback,
  updateSnippetFeedback,
} from "../app/services/feedback.server";

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
