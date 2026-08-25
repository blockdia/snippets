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

export function parseLocaleSegment(segment: string): Locale | null {
  return canonicalizeLocale(segment);
}

export function toLocaleSegment(locale: Locale): string {
  return locale.toLowerCase();
}
