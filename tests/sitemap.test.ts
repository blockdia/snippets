import { describe, expect, it } from "vitest";

import { renderSitemapXml, sitemapResponse } from "../app/http/sitemap.server";

describe("sitemap", () => {
  it("lists localized public pages and published snippet translations", () => {
    const xml = renderSitemapXml("https://snippets.blockdia.com/sitemap.xml", [
      {
        slug: "pen-and-stamp",
        locale: "en",
        updatedAt: "2026-08-27T10:20:30.000Z",
      },
      {
        slug: "pen-and-stamp",
        locale: "zh-CN",
        updatedAt: "2026-08-27T11:20:30.000Z",
      },
    ]);

    expect(xml).toContain(
      "<loc>https://snippets.blockdia.com/en/snippets</loc>",
    );
    expect(xml).toContain(
      "<loc>https://snippets.blockdia.com/zh-cn/snippets/pen-and-stamp</loc>",
    );
    expect(xml).not.toContain(
      "<loc>https://snippets.blockdia.com/zh-tw/snippets/pen-and-stamp</loc>",
    );
    expect(xml).toContain('hreflang="zh-CN"');
    expect(xml).toContain('hreflang="x-default"');
    expect(xml).toContain("<lastmod>2026-08-27T10:20:30.000Z</lastmod>");
  });

  it("returns XML with shared public cache policy", async () => {
    const response = sitemapResponse(
      new Request("https://example.test/sitemap.xml"),
      [],
    );

    expect(response.headers.get("Content-Type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    await expect(response.text()).resolves.toContain(
      'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    );
  });
});
