import { useEffect, useId, useRef, useState } from "react";

import type { Document, DocumentView } from "scratchblocks-plus";

import { SUPPORTED_LOCALES, type Locale } from "../i18n/locales";
import {
  ensureScratchblocksLanguage,
  loadScratchblocksApi,
} from "./scratchblocks-api";

type ScratchblocksStyle =
  "scratch3" | "scratch3-high-contrast" | "scratch3-outline" | "scratch2";

export interface ScratchblocksLabels {
  appearance: string;
  translate: string;
  originalLanguage: string;
  copy: string;
  copied: string;
  copyFailed: string;
  exportSvg: string;
  exportPng: string;
  renderFailed: string;
  codePreview: string;
  highContrast: string;
  outline: string;
}

const languageLabels: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
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
  const appearanceId = useId();
  const translationId = useId();
  const canvasRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<Document | undefined>(undefined);
  const viewRef = useRef<DocumentView | undefined>(undefined);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [style, setStyle] = useState<ScratchblocksStyle>("scratch3");
  const [translation, setTranslation] = useState<Locale | "original">(
    "original",
  );
  const [rendered, setRendered] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    const stored = localStorage.getItem("scratchblocks-style");
    if (
      stored === "scratch3" ||
      stored === "scratch3-high-contrast" ||
      stored === "scratch3-outline" ||
      stored === "scratch2"
    ) {
      setStyle(stored);
    }
  }, []);

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
          style,
          scale: style.startsWith("scratch3") ? 0.675 : 1,
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
  }, [labels.codePreview, source, sourceLocale, style, translation]);

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  function changeStyle(nextStyle: ScratchblocksStyle) {
    setStyle(nextStyle);
    localStorage.setItem("scratchblocks-style", nextStyle);
  }

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
        <label htmlFor={appearanceId}>
          <span>{labels.appearance}</span>
          <select
            id={appearanceId}
            onChange={(event) =>
              changeStyle(event.currentTarget.value as ScratchblocksStyle)
            }
            value={style}
          >
            <option value="scratch3">Scratch 3</option>
            <option value="scratch3-high-contrast">
              Scratch 3 · {labels.highContrast}
            </option>
            <option value="scratch3-outline">
              Scratch 3 · {labels.outline}
            </option>
            <option value="scratch2">Scratch 2</option>
          </select>
        </label>

        <label htmlFor={translationId}>
          <span>{labels.translate}</span>
          <select
            id={translationId}
            onChange={(event) =>
              setTranslation(event.currentTarget.value as Locale | "original")
            }
            value={translation}
          >
            <option value="original">{labels.originalLanguage}</option>
            {SUPPORTED_LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {languageLabels[locale]}
              </option>
            ))}
          </select>
        </label>

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
