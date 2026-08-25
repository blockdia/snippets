import { describe, expect, it } from "vitest";

import {
  CONTENT_FALLBACK_LOCALE,
  canonicalizeLocale,
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
});
