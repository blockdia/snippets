import { and, count, desc, eq, or, sql, type SQLWrapper } from "drizzle-orm";

import type { AdminActor } from "../auth/admin";
import type { AppDatabase } from "../db/client";
import {
  snippetFeedback,
  snippetLocalizationRevisions,
  snippetRevisions,
  snippets,
} from "../db/schema";

export type AdminFeedbackReviewStatus = "pending" | "accepted" | "rejected";
export type AdminFeedbackRating = "all" | "helpful" | "not-helpful";

export interface AdminFeedbackListFilters {
  query: string;
  status: "all" | AdminFeedbackReviewStatus;
  rating: AdminFeedbackRating;
  page: number;
}

export interface AdminFeedbackListItem {
  id: string;
  snippetId: string;
  snippetTitle: string;
  slug: string;
  requestedLocale: string;
  contentLocale: string;
  helpful: boolean;
  reason: string | null;
  excerpt: string | null;
  reviewStatus: AdminFeedbackReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminFeedbackListResult {
  items: AdminFeedbackListItem[];
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    total: number;
  };
}

export interface AdminFeedbackDetail {
  id: string;
  snippet: {
    id: string;
    slug: string;
    title: string;
  };
  revision: {
    id: string;
    number: number;
  };
  localizationRevision: {
    id: string;
    number: number;
  };
  requestedLocale: string;
  contentLocale: string;
  helpful: boolean;
  reason: string | null;
  reasonDetail: string | null;
  assistanceIntent: "not-asked" | "accepted" | "declined";
  suggestion: string | null;
  attribution: string | null;
  anonymousDisplay: boolean;
  reviewStatus: AdminFeedbackReviewStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  pagePath: string;
  environment: {
    entryReferrerKind: string | null;
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
  };
  createdAt: string;
  updatedAt: string;
}

export interface AdminFeedbackReviewInput {
  status: AdminFeedbackReviewStatus;
  note: string;
  expectedUpdatedAt: string;
}

export class AdminFeedbackError extends Error {
  constructor(
    public readonly code: "CONFLICT" | "INVALID_INPUT" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AdminFeedbackError";
  }
}

export const ADMIN_FEEDBACK_PAGE_SIZE = 25;

function searchCondition(query: string) {
  if (!query) return undefined;
  const contains = (column: SQLWrapper) =>
    sql`instr(lower(coalesce(${column}, '')), lower(${query})) > 0`;
  return or(
    contains(snippets.slug),
    contains(snippetLocalizationRevisions.title),
    contains(snippetFeedback.reasonDetail),
    contains(snippetFeedback.suggestion),
    contains(snippetFeedback.attribution),
  );
}

function feedbackConditions(filters: AdminFeedbackListFilters) {
  return and(
    filters.status === "all"
      ? undefined
      : eq(snippetFeedback.reviewStatus, filters.status),
    filters.rating === "all"
      ? undefined
      : eq(snippetFeedback.helpful, filters.rating === "helpful"),
    searchCondition(filters.query),
  );
}

export async function listAdminFeedback(
  db: AppDatabase,
  filters: AdminFeedbackListFilters,
): Promise<AdminFeedbackListResult> {
  const conditions = feedbackConditions(filters);
  const [countRow] = await db
    .select({ total: count() })
    .from(snippetFeedback)
    .innerJoin(snippets, eq(snippets.id, snippetFeedback.snippetId))
    .innerJoin(
      snippetLocalizationRevisions,
      eq(
        snippetLocalizationRevisions.id,
        snippetFeedback.localizationRevisionId,
      ),
    )
    .where(conditions);

  const total = Number(countRow?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_FEEDBACK_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pageCount);
  const rows = await db
    .select({
      id: snippetFeedback.id,
      snippetId: snippetFeedback.snippetId,
      snippetTitle: snippetLocalizationRevisions.title,
      slug: snippets.slug,
      requestedLocale: snippetFeedback.requestedLocale,
      contentLocale: snippetFeedback.contentLocale,
      helpful: snippetFeedback.helpful,
      reason: snippetFeedback.reason,
      reasonDetail: snippetFeedback.reasonDetail,
      suggestion: snippetFeedback.suggestion,
      reviewStatus: snippetFeedback.reviewStatus,
      createdAt: snippetFeedback.createdAt,
      updatedAt: snippetFeedback.updatedAt,
    })
    .from(snippetFeedback)
    .innerJoin(snippets, eq(snippets.id, snippetFeedback.snippetId))
    .innerJoin(
      snippetLocalizationRevisions,
      eq(
        snippetLocalizationRevisions.id,
        snippetFeedback.localizationRevisionId,
      ),
    )
    .where(conditions)
    .orderBy(desc(snippetFeedback.createdAt), desc(snippetFeedback.id))
    .limit(ADMIN_FEEDBACK_PAGE_SIZE)
    .offset((page - 1) * ADMIN_FEEDBACK_PAGE_SIZE);

  return {
    items: rows.map(({ reasonDetail, suggestion, ...row }) => ({
      ...row,
      excerpt: suggestion || reasonDetail || null,
    })),
    pagination: {
      page,
      pageSize: ADMIN_FEEDBACK_PAGE_SIZE,
      pageCount,
      total,
    },
  };
}

export async function getAdminFeedback(
  db: AppDatabase,
  feedbackId: string,
): Promise<AdminFeedbackDetail | null> {
  const [row] = await db
    .select({
      id: snippetFeedback.id,
      snippetId: snippetFeedback.snippetId,
      slug: snippets.slug,
      snippetTitle: snippetLocalizationRevisions.title,
      revisionId: snippetFeedback.revisionId,
      revisionNumber: snippetRevisions.revisionNumber,
      localizationRevisionId: snippetFeedback.localizationRevisionId,
      localizationRevisionNumber: snippetLocalizationRevisions.revisionNumber,
      requestedLocale: snippetFeedback.requestedLocale,
      contentLocale: snippetFeedback.contentLocale,
      helpful: snippetFeedback.helpful,
      reason: snippetFeedback.reason,
      reasonDetail: snippetFeedback.reasonDetail,
      assistanceIntent: snippetFeedback.assistanceIntent,
      suggestion: snippetFeedback.suggestion,
      attribution: snippetFeedback.attribution,
      anonymousDisplay: snippetFeedback.anonymousDisplay,
      reviewStatus: snippetFeedback.reviewStatus,
      reviewNote: snippetFeedback.reviewNote,
      reviewedBy: snippetFeedback.reviewedBy,
      reviewedAt: snippetFeedback.reviewedAt,
      pagePath: snippetFeedback.pagePath,
      entryReferrerKind: snippetFeedback.entryReferrerKind,
      deviceCategory: snippetFeedback.deviceCategory,
      viewportBucket: snippetFeedback.viewportBucket,
      inputMode: snippetFeedback.inputMode,
      colorScheme: snippetFeedback.colorScheme,
      reducedMotion: snippetFeedback.reducedMotion,
      clientLanguage: snippetFeedback.clientLanguage,
      browserFamily: snippetFeedback.browserFamily,
      osFamily: snippetFeedback.osFamily,
      cfCountry: snippetFeedback.cfCountry,
      cfColo: snippetFeedback.cfColo,
      createdAt: snippetFeedback.createdAt,
      updatedAt: snippetFeedback.updatedAt,
    })
    .from(snippetFeedback)
    .innerJoin(snippets, eq(snippets.id, snippetFeedback.snippetId))
    .innerJoin(
      snippetRevisions,
      eq(snippetRevisions.id, snippetFeedback.revisionId),
    )
    .innerJoin(
      snippetLocalizationRevisions,
      eq(
        snippetLocalizationRevisions.id,
        snippetFeedback.localizationRevisionId,
      ),
    )
    .where(eq(snippetFeedback.id, feedbackId))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    snippet: {
      id: row.snippetId,
      slug: row.slug,
      title: row.snippetTitle,
    },
    revision: { id: row.revisionId, number: row.revisionNumber },
    localizationRevision: {
      id: row.localizationRevisionId,
      number: row.localizationRevisionNumber,
    },
    requestedLocale: row.requestedLocale,
    contentLocale: row.contentLocale,
    helpful: row.helpful,
    reason: row.reason,
    reasonDetail: row.reasonDetail,
    assistanceIntent: row.assistanceIntent,
    suggestion: row.suggestion,
    attribution: row.attribution,
    anonymousDisplay: row.anonymousDisplay,
    reviewStatus: row.reviewStatus,
    reviewNote: row.reviewNote,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    pagePath: row.pagePath,
    environment: {
      entryReferrerKind: row.entryReferrerKind,
      deviceCategory: row.deviceCategory,
      viewportBucket: row.viewportBucket,
      inputMode: row.inputMode,
      colorScheme: row.colorScheme,
      reducedMotion: row.reducedMotion,
      clientLanguage: row.clientLanguage,
      browserFamily: row.browserFamily,
      osFamily: row.osFamily,
      cfCountry: row.cfCountry,
      cfColo: row.cfColo,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function reviewAdminFeedback(
  db: AppDatabase,
  actor: AdminActor,
  feedbackId: string,
  input: AdminFeedbackReviewInput,
): Promise<void> {
  if (
    !["pending", "accepted", "rejected"].includes(input.status) ||
    !input.expectedUpdatedAt ||
    input.note.length > 2_000
  ) {
    throw new AdminFeedbackError("INVALID_INPUT", "审核内容无效");
  }

  const previousTimestamp = Date.parse(input.expectedUpdatedAt);
  const now = new Date(
    Number.isFinite(previousTimestamp)
      ? Math.max(Date.now(), previousTimestamp + 1)
      : Date.now(),
  ).toISOString();
  const updated = await db
    .update(snippetFeedback)
    .set({
      reviewStatus: input.status,
      reviewNote: input.note.trim() || null,
      reviewedBy: actor.id,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(snippetFeedback.id, feedbackId),
        eq(snippetFeedback.updatedAt, input.expectedUpdatedAt),
      ),
    )
    .returning({ id: snippetFeedback.id });

  if (updated.length === 1) return;
  const [existing] = await db
    .select({ id: snippetFeedback.id })
    .from(snippetFeedback)
    .where(eq(snippetFeedback.id, feedbackId))
    .limit(1);
  if (!existing) {
    throw new AdminFeedbackError("NOT_FOUND", "反馈记录不存在");
  }
  throw new AdminFeedbackError(
    "CONFLICT",
    "反馈已发生变化，请刷新页面后再审核",
  );
}
