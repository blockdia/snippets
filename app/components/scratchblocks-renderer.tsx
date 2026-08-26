import { useEffect, useRef, useState } from "react";

import type { Document, DocumentView } from "scratchblocks-plus";

import type { Locale } from "../i18n/locales";
import { copyText } from "./clipboard";
import {
  ensureScratchblocksLanguage,
  loadScratchblocksApi,
} from "./scratchblocks-api";
import { useScratchblocksConfig } from "./scratchblocks-config";

export interface ScratchblocksLabels {
  copy: string;
  copied: string;
  copyFailed: string;
  exportSvg: string;
  exportPng: string;
  renderFailed: string;
  codePreview: string;
}

function download(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function ScratchblocksRenderer({
  labels,
  scriptKey,
  source,
  sourceLocale,
}: {
  labels: ScratchblocksLabels;
  scriptKey: string;
  source: string;
  sourceLocale: Locale;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<Document | undefined>(undefined);
  const viewRef = useRef<DocumentView | undefined>(undefined);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { catHats, scale, style, translation } = useScratchblocksConfig();
  const [rendered, setRendered] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    let cancelled = false;
    setRendered(false);
    setRenderFailed(false);

    void (async () => {
      try {
        const api = await loadScratchblocksApi();
        const sourceCode = await ensureScratchblocksLanguage(api, sourceLocale);
        const targetCode =
          translation === "original"
            ? sourceCode
            : await ensureScratchblocksLanguage(api, translation);
        const doc = api.parse(source, { languages: [sourceCode, "en"] });
        const targetLanguage = api.allLanguages[targetCode];
        if (targetLanguage && targetCode !== sourceCode) {
          doc.translate(targetLanguage);
        }
        const view = api.newView(doc, {
          catHats,
          style,
          scale: (style.startsWith("scratch3") ? 0.675 : 1) * scale,
        });
        const svg = view.render();
        svg.classList.add(`scratchblocks-style-${style}`);
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", labels.codePreview);

        if (cancelled || !canvasRef.current) return;
        canvasRef.current.replaceChildren(svg);
        documentRef.current = doc;
        viewRef.current = view;
        setRendered(true);
      } catch (error) {
        if (!cancelled) {
          console.warn("[scratchblocks] render failed", error);
          setRenderFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    catHats,
    labels.codePreview,
    scale,
    source,
    sourceLocale,
    style,
    translation,
  ]);

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  async function handleCopy() {
    const copied = await copyText(documentRef.current?.stringify() || source);
    setCopyState(copied ? "copied" : "failed");
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setCopyState("idle"), 1600);
  }

  const copyLabel =
    copyState === "copied"
      ? labels.copied
      : copyState === "failed"
        ? labels.copyFailed
        : labels.copy;

  return (
    <div className="scratchblocks-renderer">
      <div className="scratchblocks-toolbar">
        <div className="scratchblocks-actions">
          <button
            className={copyState}
            disabled={!rendered && !source}
            onClick={handleCopy}
            type="button"
          >
            {copyLabel}
          </button>
          <button
            disabled={!rendered}
            onClick={() => {
              const url = viewRef.current?.exportSVG();
              if (url) download(url, `${scriptKey}.svg`);
            }}
            type="button"
          >
            {labels.exportSvg}
          </button>
          <button
            disabled={!rendered}
            onClick={() =>
              viewRef.current?.exportPNG(
                (url) => download(url, `${scriptKey}.png`),
                3,
              )
            }
            type="button"
          >
            {labels.exportPng}
          </button>
        </div>
      </div>

      <div
        aria-busy={!rendered && !renderFailed}
        className="scratchblocks-canvas"
        ref={canvasRef}
      >
        <pre className="scratchblocks-source-fallback">
          <code>{source}</code>
        </pre>
      </div>
      {renderFailed ? (
        <p className="scratchblocks-error" role="status">
          {labels.renderFailed}
        </p>
      ) : null}
    </div>
  );
}
