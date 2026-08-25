import { describe, expect, it } from "vitest";

import { createCjkSearchTerms, createFtsQuery } from "../app/search/fts";

describe("FTS query normalization", () => {
  it("quotes user input and enables Latin prefix matching", () => {
    expect(createFtsQuery('Move "ten" steps')).toBe(
      '"move"* AND "ten"* AND "steps"*',
    );
  });

  it("uses overlapping CJK bigrams for substring search", () => {
    expect(createCjkSearchTerms(["中文搜索"])).toEqual([
      "中",
      "文",
      "搜",
      "索",
      "中文",
      "文搜",
      "搜索",
    ]);
    expect(createFtsQuery("中文搜索")).toBe('"中文" AND "文搜" AND "搜索"');
  });

  it("ignores punctuation-only input", () => {
    expect(createFtsQuery('"() OR ***')).toBe('"or"*');
    expect(createFtsQuery("***")).toBeNull();
  });
});
