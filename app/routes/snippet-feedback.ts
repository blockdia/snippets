import { data } from "react-router";

import type { Route } from "./+types/snippet-feedback";
import { requireSameOriginMutation } from "../auth/admin.server";
import { canonicalizeLocale, toLocaleSegment } from "../i18n/locales";
import { platformContext } from "../platform/context";
import {
  coarseUserAgent,
  createSnippetFeedback,
  updateSnippetFeedback,
} from "../services/feedback.server";
import { resolvePublishedSnippet } from "../services/snippets.server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_REASONS = new Set(["clear", "solved", "reusable", "other"]);
const NEGATIVE_REASONS = new Set([
  "confusing",
  "code-issue",
  "translation-issue",
  "missing-context",
  "other",
]);
const DEVICE_CATEGORIES = new Set(["phone", "tablet", "desktop"]);
const VIEWPORT_BUCKETS = new Set(["xs", "sm", "md", "lg"]);
const INPUT_MODES = new Set(["touch", "pointer", "hybrid"]);
const COLOR_SCHEMES = new Set(["light", "dark"]);
const REFERRER_KINDS = new Set(["direct", "internal", "external"]);

export type FeedbackActionData =
  | {
      ok: true;
      feedbackId: string;
      next: "reason" | "done";
      rating?: "helpful" | "not-helpful";
    }
  | { ok: false; error: string };

function field(formData: FormData, name: string, maxLength: number): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalEnum(
  formData: FormData,
  name: string,
  values: ReadonlySet<string>,
): string | null {
  const value = field(formData, name, 40);
  return values.has(value) ? value : null;
}

function invalid(error: string, status = 400) {
  return data<FeedbackActionData>(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function success(value: Extract<FeedbackActionData, { ok: true }>) {
  return data<FeedbackActionData>(value, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function action({ context, request }: Route.ActionArgs) {
  requireSameOriginMutation(request);
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 32_768) {
    return invalid("Feedback payload is too large", 413);
  }

  const formData = await request.formData();
  const stage = field(formData, "stage", 32);
  const clientId = field(formData, "clientId", 64);
  if (!UUID_PATTERN.test(clientId)) return invalid("Invalid client identifier");

  const { db, requestMetadata } = context.get(platformContext);
  if (stage === "create") {
    const clientSubmissionId = field(formData, "clientSubmissionId", 64);
    const requestedLocale = canonicalizeLocale(field(formData, "locale", 20));
    const slug = field(formData, "slug", 160);
    const rating = field(formData, "rating", 16);
    if (
      !UUID_PATTERN.test(clientSubmissionId) ||
      !requestedLocale ||
      !slug ||
      (rating !== "helpful" && rating !== "not-helpful")
    ) {
      return invalid("Feedback context is incomplete");
    }

    const snippet = await resolvePublishedSnippet(db, slug, requestedLocale);
    if (!snippet) return invalid("Snippet is no longer available", 404);
    const userAgent = coarseUserAgent(request.headers.get("User-Agent"));
    const language = field(formData, "clientLanguage", 24);
    const saved = await createSnippetFeedback(db, {
      clientId,
      clientSubmissionId,
      snippetId: snippet.id,
      revisionId: snippet.revision.id,
      localizationRevisionId: snippet.localization.revisionId,
      requestedLocale,
      contentLocale: snippet.localization.locale,
      helpful: rating === "helpful",
      pagePath: `/${toLocaleSegment(requestedLocale)}/snippets/${snippet.slug}`,
      entryReferrerKind: optionalEnum(
        formData,
        "entryReferrerKind",
        REFERRER_KINDS,
      ),
      deviceCategory: optionalEnum(
        formData,
        "deviceCategory",
        DEVICE_CATEGORIES,
      ),
      viewportBucket: optionalEnum(
        formData,
        "viewportBucket",
        VIEWPORT_BUCKETS,
      ),
      inputMode: optionalEnum(formData, "inputMode", INPUT_MODES),
      colorScheme: optionalEnum(formData, "colorScheme", COLOR_SCHEMES),
      reducedMotion:
        field(formData, "reducedMotion", 8) === "true"
          ? true
          : field(formData, "reducedMotion", 8) === "false"
            ? false
            : null,
      clientLanguage: /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(language)
        ? language
        : null,
      ...userAgent,
      cfCountry: requestMetadata.country,
      cfColo: requestMetadata.colo,
    });
    return success({
      ok: true,
      feedbackId: saved.feedbackId,
      next: "reason",
      rating: saved.helpful ? "helpful" : "not-helpful",
    });
  }

  const feedbackId = field(formData, "feedbackId", 64);
  if (!UUID_PATTERN.test(feedbackId)) return invalid("Invalid feedback record");

  if (stage === "rating") {
    const rating = field(formData, "rating", 16);
    if (rating !== "helpful" && rating !== "not-helpful") {
      return invalid("Invalid feedback rating");
    }
    const saved = await updateSnippetFeedback(db, feedbackId, clientId, {
      kind: "rating",
      helpful: rating === "helpful",
    });
    if (!saved) return invalid("Feedback record was not found", 404);
    return success({
      ok: true,
      feedbackId,
      next: "reason",
      rating,
    });
  }

  if (stage === "reason") {
    const reason = field(formData, "reason", 40);
    const positive = POSITIVE_REASONS.has(reason);
    const negative = NEGATIVE_REASONS.has(reason);
    if (!positive && !negative) return invalid("Invalid feedback reason");
    const saved = await updateSnippetFeedback(db, feedbackId, clientId, {
      kind: "reason",
      reason,
      detail: field(formData, "detail", 2_000) || null,
      expectedHelpful: reason === "other" ? undefined : positive && !negative,
    });
    if (!saved) return invalid("Feedback reason does not match the rating");
    return success({
      ok: true,
      feedbackId,
      next: "done",
    });
  }

  if (stage === "negative-contribution") {
    const reason = field(formData, "reason", 40);
    if (!NEGATIVE_REASONS.has(reason)) {
      return invalid("Invalid negative feedback reason");
    }
    const saved = await updateSnippetFeedback(db, feedbackId, clientId, {
      kind: "negative-contribution",
      reason,
      suggestion: field(formData, "suggestion", 5_000) || null,
      attribution: field(formData, "attribution", 240) || null,
      anonymousDisplay: formData.get("anonymousDisplay") === "true",
    });
    if (!saved) return invalid("Feedback reason does not match the rating");
    return success({ ok: true, feedbackId, next: "done" });
  }

  if (stage === "decline-assistance") {
    const saved = await updateSnippetFeedback(db, feedbackId, clientId, {
      kind: "decline-assistance",
    });
    if (!saved) return invalid("Feedback record was not found", 404);
    return success({ ok: true, feedbackId, next: "done" });
  }

  if (stage === "contribution") {
    const suggestion = field(formData, "suggestion", 5_000);
    if (!suggestion) return invalid("Please describe the translation change");
    const saved = await updateSnippetFeedback(db, feedbackId, clientId, {
      kind: "contribution",
      suggestion,
      attribution: field(formData, "attribution", 240) || null,
      anonymousDisplay: formData.get("anonymousDisplay") === "true",
    });
    if (!saved) return invalid("Feedback record was not found", 404);
    return success({ ok: true, feedbackId, next: "done" });
  }

  return invalid("Unknown feedback stage");
}
