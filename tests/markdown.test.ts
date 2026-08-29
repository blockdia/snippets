import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScratchblocksConfigProvider } from "../app/components/scratchblocks-config";
import { SnippetMarkdown } from "../app/components/snippet-markdown";
import { scratchblocksScriptAnchorId } from "../app/markdown/render";

const labels = {
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Copy failed",
  exportSvg: "Export SVG",
  exportPng: "Export PNG",
  loading: "Rendering block preview…",
  renderFailed: "Render failed",
  codePreview: "Code preview",
};

function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    createElement(
      ScratchblocksConfigProvider,
      null,
      createElement(SnippetMarkdown, { labels, locale: "en", markdown }),
    ),
  );
}

describe("snippet markdown", () => {
  it("renders common GFM content as React elements", () => {
    const html = renderMarkdown(
      "# Heading\n\n**bold** and [link](https://example.com)\n\n- one\n- two\n\n| A | B |\n| - | - |\n| 1 | 2 |",
    );

    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<table>");
  });

  it("renders block and inline scratchblocks as React components", () => {
    const html = renderMarkdown(
      "<scratchblocks>\nwhen green flag clicked\n</scratchblocks>\n\nClick <sb>(a :: custom-arg)</sb>.",
    );

    expect(html).toContain('class="scratchblocks-renderer"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Rendering block preview…");
    expect(html).toContain("when green flag clicked");
    expect(html).toContain('class="markdown-scratchblocks-inline-canvas"');
    expect(html).toContain("(a :: custom-arg)");
    expect(html).not.toContain("data-markdown-scratchblocks");
  });

  it("renders go-to-block links against the matching script anchor", () => {
    const html = renderMarkdown(
      "<go-to-block main:1.2>jump there</go-to-block>",
    );

    expect(html).toContain('class="go-to-block"');
    expect(html).toContain('data-script-id="main"');
    expect(html).toContain('data-block-path="1.2"');
    expect(html).toContain(`href="#${scratchblocksScriptAnchorId("main")}"`);
  });

  it("uses readable anchors for URL-safe script keys", () => {
    expect(scratchblocksScriptAnchorId("main")).toBe("script-main");
    expect(scratchblocksScriptAnchorId("Main_2")).toBe("script-Main_2");
  });

  it("keeps collision-resistant anchors for script keys with special characters", () => {
    expect(scratchblocksScriptAnchorId("main script")).toMatch(
      /^script-main-script-[a-z0-9]+$/,
    );
  });

  it("escapes raw HTML and removes unsafe link protocols", () => {
    const html = renderMarkdown(
      '<script>alert("xss")</script>\n\n[unsafe](javascript:alert(1))',
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("unsafe");
  });
});
