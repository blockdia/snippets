import { useEffect, useRef } from "react";

import type { Locale } from "../i18n/locales";
import {
  ensureScratchblocksLanguage,
  loadScratchblocksApi,
} from "./scratchblocks-api";

export function ScratchblocksCardPreview({
  source,
  sourceLocale,
}: {
  source: string | null;
  sourceLocale: Locale;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!source) return;

      try {
        const api = await loadScratchblocksApi();
        const language = await ensureScratchblocksLanguage(api, sourceLocale);
        const document = api.parse(source, { languages: [language, "en"] });
        const view = api.newView(document, { scale: 0.62, style: "scratch3" });
        const svg = view.render();
        svg.classList.add("scratchblocks-style-scratch3");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");

        if (cancelled || !canvasRef.current) return;
        canvasRef.current.replaceChildren(svg);
      } catch (error) {
        if (!cancelled) {
          console.warn("[scratchblocks] card preview render failed", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, sourceLocale]);

  return <div className="snippet-card-preview-canvas" ref={canvasRef} />;
}
