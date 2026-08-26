import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown, {
  type Components,
  type ExtraProps,
} from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Element } from "hast";

import type { Locale } from "../i18n/locales";
import {
  prepareSnippetMarkdown,
  remarkScratchblocks,
} from "../markdown/render";
import {
  ensureScratchblocksLanguage,
  loadScratchblocksApi,
} from "./scratchblocks-api";
import { useScratchblocksConfig } from "./scratchblocks-config";
import {
  GO_TO_SCRATCHBLOCK_EVENT,
  type GoToScratchblockDetail,
} from "./scratchblocks-navigation";
import {
  ScratchblocksRenderer,
  type ScratchblocksLabels,
} from "./scratchblocks-renderer";

function nodeProperty(
  node: Element | undefined,
  property: string,
): string | undefined {
  const value = node?.properties[property];
  return typeof value === "string" ? value : undefined;
}

function InlineScratchblocks({
  labels,
  source,
  sourceLocale,
}: {
  labels: ScratchblocksLabels;
  source: string;
  sourceLocale: Locale;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const { catHats, scale, style, translation } = useScratchblocksConfig();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const api = await loadScratchblocksApi();
        const sourceCode = await ensureScratchblocksLanguage(api, sourceLocale);
        const targetCode =
          translation === "original"
            ? sourceCode
            : await ensureScratchblocksLanguage(api, translation);
        const document = api.parse(source, { languages: [sourceCode, "en"] });
        const targetLanguage = api.allLanguages[targetCode];
        if (targetLanguage && targetCode !== sourceCode) {
          document.translate(targetLanguage);
        }
        const view = api.newView(document, {
          catHats,
          inline: true,
          scale: (style.startsWith("scratch3") ? 0.675 : 1) * scale,
          style,
        });
        const svg = view.render();
        svg.classList.add(`scratchblocks-style-${style}`);
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", labels.codePreview);
        if (!cancelled && containerRef.current) {
          containerRef.current.replaceChildren(svg);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[scratchblocks] inline render failed", error);
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

  return (
    <span className="markdown-scratchblocks-inline-canvas" ref={containerRef}>
      <code>{source}</code>
    </span>
  );
}

export function SnippetMarkdown({
  labels,
  locale,
  markdown,
}: {
  labels: ScratchblocksLabels;
  locale: Locale;
  markdown: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const source = useMemo(() => prepareSnippetMarkdown(markdown), [markdown]);
  const components = useMemo<Components>(
    () => ({
      div({ node, ...props }: React.ComponentProps<"div"> & ExtraProps) {
        if (nodeProperty(node, "data-scratchblocks") === "block") {
          return (
            <div className={props.className}>
              <ScratchblocksRenderer
                labels={labels}
                scriptKey={`about-block-${node?.position?.start.offset ?? 0}`}
                source={nodeProperty(node, "data-source") ?? ""}
                sourceLocale={locale}
              />
            </div>
          );
        }
        return <div {...props} />;
      },
      span({ node, ...props }: React.ComponentProps<"span"> & ExtraProps) {
        if (nodeProperty(node, "data-scratchblocks") === "inline") {
          return (
            <InlineScratchblocks
              labels={labels}
              source={nodeProperty(node, "data-source") ?? ""}
              sourceLocale={locale}
            />
          );
        }
        return <span {...props} />;
      },
    }),
    [labels, locale],
  );

  useEffect(() => {
    const currentRoot = rootRef.current;
    if (!currentRoot) return;
    const rootElement: HTMLDivElement = currentRoot;

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a.go-to-block");
      if (!link || !rootElement.contains(link)) return;

      const scriptKey = link.dataset.scriptId;
      const blockPath = link.dataset.blockPath;
      if (!scriptKey || !blockPath) return;
      event.preventDefault();
      window.dispatchEvent(
        new CustomEvent<GoToScratchblockDetail>(GO_TO_SCRATCHBLOCK_EVENT, {
          detail: { blockPath, scriptKey },
        }),
      );
    }

    rootElement.addEventListener("click", handleClick);
    return () => rootElement.removeEventListener("click", handleClick);
  }, []);

  return (
    <div ref={rootRef}>
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm, remarkScratchblocks]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
