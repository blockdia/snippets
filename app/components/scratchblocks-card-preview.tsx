import { useEffect, useRef } from "react";

import type { Locale } from "../i18n/locales";
import {
  ensureScratchblocksLanguage,
  loadScratchblocksApi,
} from "./scratchblocks-api";
import { useScratchblocksConfig } from "./scratchblocks-config";

const motionElements = new Set<HTMLElement>();
let motionFrame: number | undefined;

function updateScrollMotion(): void {
  motionFrame = undefined;
  const viewportHeight = window.innerHeight;

  for (const element of motionElements) {
    const preview = element.closest<HTMLElement>(".snippet-card-preview");
    if (!preview) continue;
    const box = preview.getBoundingClientRect();
    const progress = Math.min(
      1,
      Math.max(0, (viewportHeight - box.top) / (viewportHeight + box.height)),
    );
    const offset = (progress - 0.5) * 12;
    element.style.setProperty(
      "--snippet-preview-scroll-y",
      `${offset.toFixed(2)}px`,
    );
  }
}

function scheduleScrollMotion(): void {
  motionFrame ??= requestAnimationFrame(updateScrollMotion);
}

function registerScrollMotion(element: HTMLElement): () => void {
  motionElements.add(element);
  if (motionElements.size === 1) {
    window.addEventListener("scroll", scheduleScrollMotion, { passive: true });
    window.addEventListener("resize", scheduleScrollMotion);
  }
  scheduleScrollMotion();

  return () => {
    motionElements.delete(element);
    element.style.removeProperty("--snippet-preview-scroll-y");
    if (!motionElements.size) {
      window.removeEventListener("scroll", scheduleScrollMotion);
      window.removeEventListener("resize", scheduleScrollMotion);
      if (motionFrame !== undefined) cancelAnimationFrame(motionFrame);
      motionFrame = undefined;
    }
  };
}

export function ScratchblocksCardPreview({
  source,
  sourceLocale,
}: {
  source: string | null;
  sourceLocale: Locale;
}) {
  const motionRef = useRef<HTMLDivElement>(null);
  const { catHats, style, translation } = useScratchblocksConfig();

  useEffect(() => {
    const motion = motionRef.current;
    return motion ? registerScrollMotion(motion) : undefined;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!source) return;

      try {
        const api = await loadScratchblocksApi();
        const sourceCode = await ensureScratchblocksLanguage(api, sourceLocale);
        const targetCode =
          translation === "original"
            ? sourceCode
            : await ensureScratchblocksLanguage(api, translation);
        const document = api.parse(source, {
          languages: [sourceCode, "en"],
        });
        const targetLanguage = api.allLanguages[targetCode];
        if (targetLanguage && targetCode !== sourceCode) {
          document.translate(targetLanguage);
        }
        const view = api.newView(document, {
          catHats,
          scale: style.startsWith("scratch3") ? 0.62 : 0.92,
          style,
        });
        const svg = view.render();
        svg.classList.add(`scratchblocks-style-${style}`);
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");

        if (cancelled || !motionRef.current) return;
        motionRef.current.replaceChildren(svg);
      } catch (error) {
        if (!cancelled) {
          console.warn("[scratchblocks] card preview render failed", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catHats, source, sourceLocale, style, translation]);

  return (
    <div className="snippet-card-preview-canvas">
      <div className="snippet-card-preview-motion" ref={motionRef} />
    </div>
  );
}
