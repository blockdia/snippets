import type { LanguageData, ScratchblocksAPI } from "scratchblocks-plus";

import type { Locale } from "../i18n/locales";

const languageCodes: Record<Locale, string> = {
  en: "en",
  "zh-CN": "zh_cn",
  "zh-TW": "zh_tw",
};

let apiPromise: Promise<ScratchblocksAPI> | undefined;
let stylesAppended = false;
const loadedLanguages = new Set<string>(["en"]);

export async function loadScratchblocksApi(): Promise<ScratchblocksAPI> {
  if (import.meta.env.SSR) {
    throw new Error("scratchblocks rendering is available in the browser only");
  }
  apiPromise ??= import("scratchblocks-plus").then((module) => module.default);
  const api = await apiPromise;
  if (!stylesAppended) {
    api.appendStyles();
    stylesAppended = true;
  }
  return api;
}

export async function ensureScratchblocksLanguage(
  api: ScratchblocksAPI,
  locale: Locale,
): Promise<string> {
  const code = languageCodes[locale];
  if (loadedLanguages.has(code)) return code;

  let language: unknown;
  if (!import.meta.env.SSR && locale === "zh-CN") {
    language = (await import("scratchblocks-plus/locales/zh-cn.json")).default;
  } else if (!import.meta.env.SSR && locale === "zh-TW") {
    language = (await import("scratchblocks-plus/locales/zh-tw.json")).default;
  }
  if (language) {
    api.loadLanguages({ [code]: language as LanguageData });
    loadedLanguages.add(code);
  }
  return code;
}
