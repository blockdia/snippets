import { describe, expect, it } from "vitest";

import {
  CONTENT_FALLBACK_LOCALE,
  canonicalizeLocale,
  negotiateLocale,
  parseLocaleSegment,
  toLocaleSegment,
} from "../app/i18n/locales";

describe("locale model", () => {
  it("uses one global English content fallback", () => {
    expect(CONTENT_FALLBACK_LOCALE).toBe("en");
  });

  it("canonicalizes supported BCP 47 locales", () => {
    expect(canonicalizeLocale("EN")).toBe("en");
    expect(parseLocaleSegment("zh-cn")).toBe("zh-CN");
    expect(parseLocaleSegment("zh-TW")).toBe("zh-TW");
  });

  it("rejects unsupported or malformed locales", () => {
    expect(canonicalizeLocale("fr")).toBeNull();
    expect(canonicalizeLocale("not_a_locale")).toBeNull();
  });

  it("renders stable lowercase URL segments", () => {
    expect(toLocaleSegment("en")).toBe("en");
    expect(toLocaleSegment("zh-CN")).toBe("zh-cn");
  });

  it("negotiates supported locales by quality and Chinese script", () => {
    expect(negotiateLocale("fr;q=0.9, zh-Hant-HK;q=0.8, en;q=0.7")).toBe(
      "zh-TW",
    );
    expect(negotiateLocale("zh-Hans, en;q=0.5")).toBe("zh-CN");
    expect(negotiateLocale("en-GB, zh;q=0.8")).toBe("en");
    expect(negotiateLocale("fr, de;q=0.8")).toBe("en");
  });
});
