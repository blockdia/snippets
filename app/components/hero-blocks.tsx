import { useEffect, useRef } from "react";

import type { ScratchblocksAPI } from "scratchblocks-plus";

import type { Locale } from "../i18n/locales";
import {
  ensureScratchblocksLanguage,
  loadScratchblocksApi,
} from "./scratchblocks-api";
import {
  useScratchblocksConfig,
  type ScratchblocksStyle,
} from "./scratchblocks-config";

const HERO_SCRIPT = `when green flag clicked
go to x: (0) y: (0)
repeat (4)
  move (60) steps
  turn cw (90) degrees
end`;

const HERO_REPORTER = `((60) * (4))`;

function renderDocument(
  api: ScratchblocksAPI,
  source: string,
  targetCode: string,
  options: {
    catHats: boolean;
    scale: number;
    style: ScratchblocksStyle;
  },
): SVGElement {
  const document = api.parse(source, { languages: ["en"] });
  const targetLanguage = api.allLanguages[targetCode];
  if (targetLanguage && targetCode !== "en") {
    document.translate(targetLanguage);
  }

  const view = api.newView(document, options);
  const svg = view.render();
  svg.classList.add(`scratchblocks-style-${options.style}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  return svg;
}

export function HeroBlocks({ locale }: { locale: Locale }) {
  const scriptRef = useRef<HTMLDivElement>(null);
  const reporterRef = useRef<HTMLDivElement>(null);
  const { catHats, style, translation } = useScratchblocksConfig();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const api = await loadScratchblocksApi();
        const targetLocale = translation === "original" ? locale : translation;
        const targetCode = await ensureScratchblocksLanguage(api, targetLocale);
        const isScratch3 = style.startsWith("scratch3");
        const script = renderDocument(api, HERO_SCRIPT, targetCode, {
          catHats,
          scale: isScratch3 ? 1.14 : 1.55,
          style,
        });
        const reporter = renderDocument(api, HERO_REPORTER, targetCode, {
          catHats,
          scale: isScratch3 ? 0.9 : 1.2,
          style,
        });

        if (cancelled || !scriptRef.current || !reporterRef.current) return;
        scriptRef.current.replaceChildren(script);
        reporterRef.current.replaceChildren(reporter);
        scriptRef.current.dataset.ready = "true";
        reporterRef.current.dataset.ready = "true";
      } catch (error) {
        if (!cancelled) {
          console.warn("[scratchblocks] hero render failed", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catHats, locale, style, translation]);

  return (
    <div className="hero-blocks" aria-hidden="true">
      <div className="hero-script" ref={scriptRef} />
      <div className="hero-reporter" ref={reporterRef} />
      <div className="hero-orbit">S</div>
    </div>
  );
}
