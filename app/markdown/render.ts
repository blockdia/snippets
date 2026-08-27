import type { Root } from "mdast";
import type { Plugin } from "unified";

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
}

function decodeMarkerValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function marker(
  hName: "a" | "div" | "span",
  value: string,
  properties: Record<string, unknown>,
): MarkdownNode {
  return {
    type: "text",
    value,
    data: { hName, hProperties: properties },
  };
}

function parseScratchblocksMarker(value: string): MarkdownNode | null {
  let match = /^<scratchblocks-render data-source="([^"]*)">$/.exec(value);
  if (match) {
    return marker("div", "", {
      className: ["markdown-scratchblocks-block"],
      "data-scratchblocks": "block",
      "data-source": decodeMarkerValue(match[1] ?? ""),
    });
  }

  match = /^<sb-render data-source="([^"]*)">$/.exec(value);
  if (match) {
    return marker("span", "", {
      className: ["markdown-scratchblocks-inline"],
      "data-scratchblocks": "inline",
      "data-source": decodeMarkerValue(match[1] ?? ""),
    });
  }

  match =
    /^<go-to-block-render data-script-id="([^"]*)" data-block-path="([^"]*)" data-label="([^"]*)">$/.exec(
      value,
    );
  if (match) {
    const scriptId = decodeMarkerValue(match[1] ?? "");
    const blockPath = decodeMarkerValue(match[2] ?? "");
    return marker("a", decodeMarkerValue(match[3] ?? ""), {
      className: ["go-to-block"],
      href: `#${scratchblocksScriptAnchorId(scriptId)}`,
      "data-script-id": scriptId,
      "data-block-path": blockPath,
    });
  }

  return null;
}

function transformMarkers(node: MarkdownNode): void {
  if (!node.children) return;
  node.children = node.children.map((child) => {
    if (child.type === "html" && child.value) {
      const replacement = parseScratchblocksMarker(child.value);
      if (replacement) return replacement;
    }
    transformMarkers(child);
    return child;
  });
}

export const remarkScratchblocks: Plugin<[], Root> = () => (tree) => {
  transformMarkers(tree as MarkdownNode);
};

export function prepareSnippetMarkdown(markdown: string): string {
  return markdown
    .replace(
      /<scratchblocks>([\s\S]+?)<\/scratchblocks>/gi,
      (_, source: string) =>
        `\n\n<scratchblocks-render data-source="${encodeURIComponent(source.trim())}">\n\n`,
    )
    .replace(
      /<sb>([\s\S]+?)<\/sb>/gi,
      (_, source: string) =>
        `<sb-render data-source="${encodeURIComponent(source.trim())}">`,
    )
    .replace(
      /<go-to-block\s+([^:>\s]+)\s*:\s*([^>]+?)>([\s\S]+?)<\/go-to-block>/gi,
      (_, scriptId: string, blockPath: string, label: string) =>
        `<go-to-block-render data-script-id="${encodeURIComponent(scriptId.trim())}" data-block-path="${encodeURIComponent(blockPath.trim())}" data-label="${encodeURIComponent(label.trim())}">`,
    );
}

function hashedScratchblocksScriptAnchorId(scriptKey: string): string {
  let hash = 0;
  for (const character of scriptKey) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  const readable = scriptKey
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `script-${readable || "item"}-${hash.toString(36)}`;
}

export function scratchblocksScriptAnchorId(scriptKey: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(scriptKey)) {
    return `script-${scriptKey}`;
  }
  return hashedScratchblocksScriptAnchorId(scriptKey);
}
