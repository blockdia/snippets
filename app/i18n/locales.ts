export const SUPPORTED_LOCALES = ["en", "zh-CN", "zh-TW"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const CONTENT_FALLBACK_LOCALE: Locale = "en";

const supportedLocaleSet = new Set<string>(SUPPORTED_LOCALES);

export function canonicalizeLocale(value: string): Locale | null {
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    return canonical && supportedLocaleSet.has(canonical)
      ? (canonical as Locale)
      : null;
  } catch {
    return null;
  }
}

export function toLocaleSegment(locale: Locale): string {
  return locale.toLowerCase();
}

export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) {
    return CONTENT_FALLBACK_LOCALE;
  }

  const preferences = acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [rawTag = "", ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;
      return {
        index,
        quality: Number.isFinite(quality) ? quality : 0,
        tag: rawTag,
      };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && entry.quality > 0)
    .sort(
      (left, right) => right.quality - left.quality || left.index - right.index,
    );

  for (const preference of preferences) {
    const exact = canonicalizeLocale(preference.tag);
    if (exact) {
      return exact;
    }

    let canonical: string;
    try {
      [canonical] = Intl.getCanonicalLocales(preference.tag);
    } catch {
      continue;
    }

    const parts = canonical.split("-");
    const language = parts[0];
    const script = parts.find((part) => part.length === 4);
    const region = parts.find((part) => part.length === 2 && part !== language);

    if (language === "zh") {
      if (script === "Hant" || ["TW", "HK", "MO"].includes(region ?? "")) {
        return "zh-TW";
      }
      return "zh-CN";
    }
    if (language === "en") {
      return "en";
    }
  }

  return CONTENT_FALLBACK_LOCALE;
}
