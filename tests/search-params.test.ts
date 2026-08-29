import { describe, expect, it } from "vitest";

import { loader as legacySearchLoader } from "../app/routes/search";
import {
  parseSnippetSearchParameters,
  snippetSearchHref,
} from "../app/search/params";

describe("snippet search parameters", () => {
  it("normalizes query, tag, and page values", () => {
    const query = `  ${"x".repeat(220)}  `;
    const parameters = parseSnippetSearchParameters(
      new URLSearchParams({ q: query, tag: "pen-tools", page: "3" }),
    );

    expect(parameters).toEqual({
      query: "x".repeat(200),
      tag: "pen-tools",
      page: 3,
    });
  });

  it.each(["0", "-2", "1.5", "2x", "Infinity", "not-a-page"])(
    "falls back to the first page for %s",
    (page) => {
      expect(
        parseSnippetSearchParameters(new URLSearchParams({ page })).page,
      ).toBe(1);
    },
  );

  it("drops invalid tags and unsupported parameters", () => {
    expect(
      parseSnippetSearchParameters(
        new URLSearchParams("tag=Motion%20Tools&page=2&extra=ignored"),
      ),
    ).toEqual({ query: "", tag: "", page: 2 });
  });

  it("builds canonical listing links and omits default values", () => {
    expect(
      snippetSearchHref("zh-cn", {
        query: "画笔 颜色",
        tag: "pen",
        page: 2,
      }),
    ).toBe(
      "/zh-cn/snippets?q=%E7%94%BB%E7%AC%94+%E9%A2%9C%E8%89%B2&tag=pen&page=2",
    );
    expect(snippetSearchHref("en", { query: "", tag: "", page: 1 })).toBe(
      "/en/snippets",
    );
  });
});

describe("legacy search route", () => {
  it("permanently redirects normalized search parameters", () => {
    try {
      legacySearchLoader({
        params: { locale: "zh-cn" },
        request: new Request(
          "https://snippets.blockdia.com/zh-cn/search?q=%20move%20&tag=motion&page=2&extra=ignored",
        ),
      } as never);
      expect.fail("Expected the legacy search loader to redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "/zh-cn/snippets?q=move&tag=motion&page=2",
      );
    }
  });
});
