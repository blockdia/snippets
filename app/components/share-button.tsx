import { useEffect, useRef, useState } from "react";

import { copyText } from "./clipboard";

export function ShareButton({
  title,
  text,
  url,
  labels,
}: {
  title: string;
  text: string;
  url: string;
  labels: {
    share: string;
    shared: string;
    copied: string;
    failed: string;
  };
}) {
  const [state, setState] = useState<"idle" | "shared" | "copied" | "failed">(
    "idle",
  );
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  function showFeedback(nextState: typeof state) {
    setState(nextState);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setState("idle"), 1800);
  }

  const label =
    state === "shared"
      ? labels.shared
      : state === "copied"
        ? labels.copied
        : state === "failed"
          ? labels.failed
          : labels.share;

  return (
    <button
      aria-label={label}
      className={`detail-share-button ${state}`}
      onClick={async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title, text, url });
            showFeedback("shared");
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
              return;
            }
          }
        }
        showFeedback((await copyText(url)) ? "copied" : "failed");
      }}
      type="button"
    >
      <span aria-hidden="true">↗</span>
      <span className="share-button-label">{label}</span>
    </button>
  );
}
