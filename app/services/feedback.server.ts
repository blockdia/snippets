import { and, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "../db/client";
import { snippetFeedback } from "../db/schema";

export interface FeedbackEnvironment {
  deviceCategory: string | null;
  viewportBucket: string | null;
  inputMode: string | null;
  colorScheme: string | null;
  reducedMotion: boolean | null;
  clientLanguage: string | null;
  browserFamily: string | null;
  osFamily: string | null;
  cfCountry: string | null;
  cfColo: string | null;
}

export interface CreateSnippetFeedbackInput extends FeedbackEnvironment {
  clientId: string;
  clientSubmissionId: string;
  snippetId: string;
  revisionId: string;
  localizationRevisionId: string;
  requestedLocale: string;
  contentLocale: string;
  helpful: boolean;
  pagePath: string;
  entryReferrerKind: string | null;
}

export type SnippetFeedbackUpdate =
  | { kind: "rating"; helpful: boolean }
  | {
      kind: "reason";
      reason: string;
      detail: string | null;
      expectedHelpful?: boolean;
    }
  | {
      kind: "negative-contribution";
      reason: string;
      suggestion: string | null;
      attribution: string | null;
      anonymousDisplay: boolean;
    }
  | { kind: "decline-assistance" }
  | {
      kind: "contribution";
      suggestion: string;
      attribution: string | null;
      anonymousDisplay: boolean;
    };

export function coarseUserAgent(userAgent: string | null): {
  browserFamily: string | null;
  osFamily: string | null;
} {
  if (!userAgent) return { browserFamily: null, osFamily: null };

  const browserFamily = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(userAgent)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Other";
  const osFamily = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent)
      ? "iOS"
      : /CrOS/.test(userAgent)
        ? "ChromeOS"
        : /Windows NT/.test(userAgent)
          ? "Windows"
          : /Mac OS X/.test(userAgent)
            ? "macOS"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "Other";

  return { browserFamily, osFamily };
}

export async function createSnippetFeedback(
  db: AppDatabase,
  input: CreateSnippetFeedbackInput,
): Promise<{ feedbackId: string; helpful: boolean }> {
  const feedbackId = crypto.randomUUID();
  await db
    .insert(snippetFeedback)
    .values({ id: feedbackId, ...input })
    .onConflictDoNothing({ target: snippetFeedback.clientSubmissionId });

  const [saved] = await db
    .select({
      id: snippetFeedback.id,
      clientId: snippetFeedback.clientId,
      helpful: snippetFeedback.helpful,
    })
    .from(snippetFeedback)
    .where(eq(snippetFeedback.clientSubmissionId, input.clientSubmissionId))
    .limit(1);

  if (!saved || saved.clientId !== input.clientId) {
    throw new Error("Feedback submission could not be saved");
  }
  return { feedbackId: saved.id, helpful: saved.helpful };
}

export async function updateSnippetFeedback(
  db: AppDatabase,
  feedbackId: string,
  clientId: string,
  update: SnippetFeedbackUpdate,
): Promise<boolean> {
  const values =
    update.kind === "rating"
      ? {
          helpful: update.helpful,
          reason: null,
          reasonDetail: null,
          assistanceIntent: "not-asked" as const,
          suggestion: null,
          attribution: null,
          anonymousDisplay: true,
          reviewStatus: "pending" as const,
          reviewNote: null,
          reviewedBy: null,
          reviewedAt: null,
        }
      : update.kind === "reason"
        ? { reason: update.reason, reasonDetail: update.detail }
        : update.kind === "negative-contribution"
          ? {
              reason: update.reason,
              reasonDetail: null,
              assistanceIntent: "accepted" as const,
              suggestion: update.suggestion,
              attribution: update.attribution,
              anonymousDisplay: update.anonymousDisplay,
            }
          : update.kind === "decline-assistance"
            ? { assistanceIntent: "declined" as const }
            : {
                assistanceIntent: "accepted" as const,
                suggestion: update.suggestion,
                attribution: update.attribution,
                anonymousDisplay: update.anonymousDisplay,
              };
  const updated = await db
    .update(snippetFeedback)
    .set({
      ...values,
      updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    })
    .where(
      and(
        eq(snippetFeedback.id, feedbackId),
        eq(snippetFeedback.clientId, clientId),
        update.kind === "reason" && update.expectedHelpful !== undefined
          ? eq(snippetFeedback.helpful, update.expectedHelpful)
          : update.kind === "negative-contribution"
            ? eq(snippetFeedback.helpful, false)
            : undefined,
      ),
    )
    .returning({ id: snippetFeedback.id });

  return updated.length === 1;
}
