import { useEffect, useRef, useState } from "react";

import { copyText } from "./clipboard";

export function CopyButton({
  value,
  labels,
}: {
  value: string;
  labels: { copy: string; copied: string; failed: string };
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  const label =
    state === "copied"
      ? labels.copied
      : state === "failed"
        ? labels.failed
        : labels.copy;

  return (
    <button
      className={`copy-name-button ${state}`}
      onClick={async () => {
        const copied = await copyText(value);
        setState(copied ? "copied" : "failed");
        if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
        feedbackTimer.current = setTimeout(() => setState("idle"), 1600);
      }}
      type="button"
    >
      {label}
    </button>
  );
}
