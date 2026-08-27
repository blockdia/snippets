import { InfoIcon, ThumbsDownIcon, ThumbsUpIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import type { FeedbackActionData } from "../routes/snippet-feedback";
import type { Locale } from "../i18n/locales";
import type { Messages } from "../i18n/messages";

const CLIENT_ID_STORAGE_KEY = "scratch-snippets-feedback-client-id-v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FeedbackStage = "question" | "reason" | "done";
type FeedbackRating = "helpful" | "not-helpful";

type FeedbackOperation =
  | { kind: "create"; generation: number; rating: FeedbackRating }
  | { kind: "rating"; generation: number; rating: FeedbackRating }
  | {
      kind: "reason";
      generation: number;
      reason: string;
      detail: string;
      completeOnSuccess: boolean;
    }
  | {
      kind: "negative-contribution";
      generation: number;
      reason: string;
      suggestion: string;
      attribution: string;
      anonymousDisplay: boolean;
    };

interface SnippetFeedbackProps {
  labels: Messages["detail"]["feedback"];
  locale: Locale;
  slug: string;
}

function getOrCreateClientId(): string {
  try {
    const saved = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (saved && UUID_PATTERN.test(saved)) return saved;
  } catch {
    // Storage can be unavailable in private or hardened browsing modes.
  }

  const clientId = crypto.randomUUID();
  try {
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);
  } catch {
    // The in-memory identifier still lets this feedback flow complete.
  }
  return clientId;
}

function collectEnvironment() {
  const width = window.innerWidth;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  let inputMode = "pointer";
  if (coarsePointer && finePointer) inputMode = "hybrid";
  else if (coarsePointer) inputMode = "touch";

  let entryReferrerKind = "direct";
  if (document.referrer) {
    try {
      entryReferrerKind =
        new URL(document.referrer).origin === window.location.origin
          ? "internal"
          : "external";
    } catch {
      entryReferrerKind = "external";
    }
  }

  return {
    deviceCategory:
      width <= 600 ? "phone" : width <= 1024 ? "tablet" : "desktop",
    viewportBucket:
      width <= 480 ? "xs" : width <= 768 ? "sm" : width <= 1200 ? "md" : "lg",
    inputMode,
    colorScheme:
      document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    reducedMotion: String(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    clientLanguage: navigator.language,
    entryReferrerKind,
  };
}

export function SnippetFeedback({
  labels,
  locale,
  slug,
}: SnippetFeedbackProps) {
  const fetcher = useFetcher<FeedbackActionData>();
  const [stage, setStage] = useState<FeedbackStage>("question");
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [reasonDetail, setReasonDetail] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [attribution, setAttribution] = useState("");
  const [anonymousDisplay, setAnonymousDisplay] = useState(true);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [queueRevision, setQueueRevision] = useState(0);
  const clientIdRef = useRef<string | null>(null);
  const submissionIdRef = useRef<string | null>(null);
  const feedbackIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const operationQueueRef = useRef<FeedbackOperation[]>([]);
  const activeOperationRef = useRef<FeedbackOperation | null>(null);
  const handledDataRef = useRef<FeedbackActionData | undefined>(undefined);
  const fetcherState = fetcher.state;
  const submit = fetcher.submit;

  useEffect(() => {
    if (!fetcher.data || fetcher.data === handledDataRef.current) return;
    handledDataRef.current = fetcher.data;
    const completed = activeOperationRef.current;
    activeOperationRef.current = null;

    if (fetcher.data.ok) {
      feedbackIdRef.current = fetcher.data.feedbackId;
      if (completed?.generation === generationRef.current) {
        setSaveError(false);
        if (
          completed.kind === "negative-contribution" ||
          (completed.kind === "reason" && completed.completeOnSuccess)
        ) {
          setStage("done");
        }
      }
    } else if (completed?.generation === generationRef.current) {
      setSaveError(true);
    }
    setQueueRevision((revision) => revision + 1);
  }, [fetcher.data]);

  useEffect(() => {
    if (fetcherState !== "idle" || activeOperationRef.current) return;
    const operation = operationQueueRef.current.shift();
    if (!operation) return;

    const feedbackId = feedbackIdRef.current;
    if (operation.kind !== "create" && !feedbackId) {
      operationQueueRef.current.unshift(operation);
      return;
    }

    clientIdRef.current ??= getOrCreateClientId();
    submissionIdRef.current ??= crypto.randomUUID();
    activeOperationRef.current = operation;

    const payload = new FormData();
    payload.set("clientId", clientIdRef.current);
    if (operation.kind === "create") {
      payload.set("stage", "create");
      payload.set("locale", locale);
      payload.set("slug", slug);
      payload.set("rating", operation.rating);
      payload.set("clientSubmissionId", submissionIdRef.current);
      for (const [key, value] of Object.entries(collectEnvironment())) {
        payload.set(key, value);
      }
    } else {
      payload.set("feedbackId", feedbackId!);
      payload.set("stage", operation.kind);
      if (operation.kind === "rating") {
        payload.set("rating", operation.rating);
      } else if (operation.kind === "reason") {
        payload.set("reason", operation.reason);
        payload.set("detail", operation.detail);
      } else {
        payload.set("reason", operation.reason);
        payload.set("suggestion", operation.suggestion);
        payload.set("attribution", operation.attribution);
        payload.set("anonymousDisplay", String(operation.anonymousDisplay));
      }
    }
    submit(payload, { action: "/api/snippet-feedback", method: "post" });
  }, [fetcherState, locale, queueRevision, slug, submit]);

  function wakeQueue() {
    setQueueRevision((revision) => revision + 1);
  }

  function ensureCreate(generation: number) {
    if (
      feedbackIdRef.current ||
      activeOperationRef.current?.kind === "create" ||
      operationQueueRef.current.some((operation) => operation.kind === "create")
    ) {
      return;
    }
    if (!rating) return;
    operationQueueRef.current.unshift({
      kind: "create",
      generation,
      rating,
    });
  }

  function enqueueFinalOperation(
    operation: Extract<
      FeedbackOperation,
      { kind: "reason" | "negative-contribution" }
    >,
  ) {
    setSaveError(false);
    ensureCreate(operation.generation);
    operationQueueRef.current = operationQueueRef.current.filter(
      (queued) =>
        queued.kind === "create" ||
        queued.kind === "rating" ||
        queued.generation !== operation.generation,
    );
    operationQueueRef.current.push(operation);
    wakeQueue();
  }

  function submitRating(nextRating: FeedbackRating) {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setRating(nextRating);
    setStage("reason");
    setSaveError(false);
    setSelectedReason(null);
    setReasonDetail("");
    setSuggestion("");
    setAttribution("");
    setAnonymousDisplay(true);
    operationQueueRef.current = operationQueueRef.current.filter(
      (operation) => operation.kind === "create",
    );

    if (feedbackIdRef.current) {
      operationQueueRef.current.push({
        kind: "rating",
        generation,
        rating: nextRating,
      });
    } else {
      const queuedCreate = operationQueueRef.current.findIndex(
        (operation) => operation.kind === "create",
      );
      if (queuedCreate >= 0) {
        operationQueueRef.current[queuedCreate] = {
          kind: "create",
          generation,
          rating: nextRating,
        };
      } else if (activeOperationRef.current?.kind === "create") {
        operationQueueRef.current.push({
          kind: "rating",
          generation,
          rating: nextRating,
        });
      } else {
        operationQueueRef.current.push({
          kind: "create",
          generation,
          rating: nextRating,
        });
      }
    }
    wakeQueue();
  }

  function submitReason(reason: string, detail = "", completeOnSuccess = true) {
    if (!rating) return;
    enqueueFinalOperation({
      kind: "reason",
      generation: generationRef.current,
      reason,
      detail,
      completeOnSuccess,
    });
  }

  function chooseReason(reason: string) {
    const hasOptionalDetails = rating === "not-helpful" || reason === "other";
    setSelectedReason(hasOptionalDetails ? reason : null);
    submitReason(reason, "", !hasOptionalDetails);
  }

  function submitReasonDetail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedReason) return;
    submitReason(selectedReason, reasonDetail, true);
  }

  function submitNegativeContribution(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedReason || rating !== "not-helpful") return;
    enqueueFinalOperation({
      kind: "negative-contribution",
      generation: generationRef.current,
      reason: selectedReason,
      suggestion,
      attribution,
      anonymousDisplay,
    });
  }

  const reasons =
    rating === "helpful" ? labels.positiveReasons : labels.negativeReasons;

  return (
    <section
      aria-labelledby="snippet-feedback-heading"
      className="detail-section snippet-feedback"
    >
      <div className="snippet-feedback-card">
        <div className="feedback-toolbar">
          <h2 id="snippet-feedback-heading">{labels.question}</h2>
          <div className="feedback-rating-actions">
            <button
              aria-label={labels.helpful}
              aria-pressed={rating === "helpful"}
              className="feedback-icon-button rating-helpful"
              onClick={() => submitRating("helpful")}
              title={labels.helpful}
              type="button"
            >
              <ThumbsUpIcon aria-hidden="true" size={17} weight="regular" />
            </button>
            <button
              aria-label={labels.notHelpful}
              aria-pressed={rating === "not-helpful"}
              className="feedback-icon-button rating-not-helpful"
              onClick={() => submitRating("not-helpful")}
              title={labels.notHelpful}
              type="button"
            >
              <ThumbsDownIcon aria-hidden="true" size={17} weight="regular" />
            </button>
          </div>
          <span
            className={`feedback-privacy${privacyOpen ? " is-open" : ""}`}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setPrivacyOpen(false);
              }
            }}
          >
            <button
              aria-describedby="snippet-feedback-privacy"
              aria-expanded={privacyOpen}
              aria-label={labels.privacyDetails}
              className="feedback-icon-button feedback-privacy-button"
              onClick={() => setPrivacyOpen((open) => !open)}
              title={labels.privacyDetails}
              type="button"
            >
              <InfoIcon aria-hidden="true" size={14} weight="regular" />
            </button>
            <span
              className="feedback-privacy-tooltip"
              id="snippet-feedback-privacy"
              role="tooltip"
            >
              {labels.privacyNote}
            </span>
          </span>
        </div>

        {stage === "reason" ? (
          <div className="feedback-followup">
            <p className="feedback-thanks">{labels.thankYou}</p>
            <h3>{labels.chooseReason}</h3>
            <div className="feedback-reason-actions">
              {Object.entries(reasons).map(([value, label]) => (
                <button
                  aria-pressed={selectedReason === value}
                  key={value}
                  onClick={() => chooseReason(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            {selectedReason && rating === "not-helpful" ? (
              <form
                className="feedback-contribution-form"
                onSubmit={submitNegativeContribution}
              >
                <h3>{labels.negativeContributionTitle}</h3>
                <label>
                  <span>{labels.negativeContributionLabel}</span>
                  <textarea
                    maxLength={5000}
                    onChange={(event) => setSuggestion(event.target.value)}
                    placeholder={labels.negativeContributionPlaceholder}
                    rows={4}
                    value={suggestion}
                  />
                </label>
                <label>
                  <span>{labels.attributionLabel}</span>
                  <input
                    maxLength={240}
                    onChange={(event) => setAttribution(event.target.value)}
                    placeholder={labels.attributionPlaceholder}
                    type="text"
                    value={attribution}
                  />
                </label>
                <label className="feedback-anonymous-option">
                  <input
                    checked={anonymousDisplay}
                    onChange={(event) =>
                      setAnonymousDisplay(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>{labels.anonymousLabel}</span>
                </label>
                <button className="feedback-primary-action" type="submit">
                  {labels.submit}
                </button>
              </form>
            ) : selectedReason ? (
              <form
                className="feedback-reason-detail"
                onSubmit={submitReasonDetail}
              >
                <label>
                  <span>{labels.reasonDetailLabel}</span>
                  <textarea
                    maxLength={2000}
                    onChange={(event) => setReasonDetail(event.target.value)}
                    placeholder={labels.reasonDetailPlaceholder}
                    rows={3}
                    value={reasonDetail}
                  />
                </label>
                <button className="feedback-primary-action" type="submit">
                  {labels.submitReason}
                </button>
              </form>
            ) : null}
          </div>
        ) : stage === "done" ? (
          <p className="feedback-final" role="status">
            {labels.finalThanks}
          </p>
        ) : null}

        {saveError ? (
          <p className="feedback-error" role="alert">
            {labels.error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
