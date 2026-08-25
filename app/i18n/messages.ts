import type { Locale } from "./locales";

const en = {
  brand: "Scratch Snippets",
  navigation: {
    home: "Home",
    snippets: "Snippets",
    language: "Language",
  },
  home: {
    eyebrow: "A shared library for Scratch makers",
    title: "Small patterns that unlock bigger Scratch projects.",
    description:
      "Explore focused, reusable code snippets with clear explanations and community-ready translations.",
    primaryAction: "Browse snippets",
    latestTitle: "Latest snippets",
    latestDescription:
      "Recently published building blocks for your next project.",
  },
  index: {
    eyebrow: "Snippet library",
    title: "Find a pattern. Understand it. Make it yours.",
    description:
      "Each snippet is versioned, translated independently, and designed to be reused.",
    emptyTitle: "The library is ready for its first snippets",
    emptyDescription:
      "Content will appear here after the legacy importer runs in a later phase.",
    previous: "Previous",
    next: "Next",
  },
  card: {
    fallback: "English fallback",
    open: "View snippet",
  },
  detail: {
    code: "Scratch code",
    about: "About this snippet",
    symbols: "Variables and symbols",
    references: "References",
    tags: "Tags",
    revision: "Revision",
    translationFallbackTitle: "This snippet is not translated yet",
    translationFallbackDescription:
      "You are viewing the English content while the requested translation is unavailable or being updated.",
    availableLanguages: "Available languages",
    scriptUntitled: "Script",
    back: "Back to snippets",
  },
  errors: {
    notFoundTitle: "Snippet not found",
    notFoundDescription:
      "This snippet may not exist, may be unpublished, or may have moved.",
    localeNotFoundTitle: "Language not supported",
    localeNotFoundDescription:
      "Choose one of the available languages to continue browsing.",
    generalTitle: "Something went wrong",
    generalDescription: "The page could not be loaded. Please try again.",
  },
  footer: {
    description: "Reusable Scratch ideas, explained across languages.",
  },
} as const;

type WidenStrings<T> = T extends string
  ? string
  : { [Key in keyof T]: WidenStrings<T[Key]> };

export type Messages = WidenStrings<typeof en>;

const zhCN: Messages = {
  brand: "Scratch 代码片段",
  navigation: {
    home: "首页",
    snippets: "代码片段",
    language: "语言",
  },
  home: {
    eyebrow: "为 Scratch 创作者共享的代码库",
    title: "用小而清晰的模式，完成更大的 Scratch 项目。",
    description:
      "探索专注、可复用的代码片段，以及清楚的说明和可持续维护的翻译。",
    primaryAction: "浏览代码片段",
    latestTitle: "最新代码片段",
    latestDescription: "为下一个项目准备的近期发布模块。",
  },
  index: {
    eyebrow: "代码片段库",
    title: "找到一个模式，理解它，再把它变成自己的作品。",
    description: "每个片段都有版本历史，内容与翻译可以独立演进。",
    emptyTitle: "代码库已经准备好迎接第一批内容",
    emptyDescription: "后续阶段运行旧内容导入器后，代码片段会显示在这里。",
    previous: "上一页",
    next: "下一页",
  },
  card: {
    fallback: "暂以英文显示",
    open: "查看片段",
  },
  detail: {
    code: "Scratch 代码",
    about: "片段说明",
    symbols: "变量与符号",
    references: "参考资料",
    tags: "标签",
    revision: "版本",
    translationFallbackTitle: "这个片段还没有可用的中文翻译",
    translationFallbackDescription:
      "当前显示英文内容；中文翻译可能尚未创建，或正在适配新的代码版本。",
    availableLanguages: "可用语言",
    scriptUntitled: "脚本",
    back: "返回代码片段",
  },
  errors: {
    notFoundTitle: "找不到代码片段",
    notFoundDescription: "它可能不存在、尚未发布，或者地址已经变化。",
    localeNotFoundTitle: "暂不支持这种语言",
    localeNotFoundDescription: "请选择已有语言继续浏览。",
    generalTitle: "出现了一些问题",
    generalDescription: "页面暂时无法加载，请稍后重试。",
  },
  footer: {
    description: "跨语言分享和解释可复用的 Scratch 思路。",
  },
};

const zhTW: Messages = {
  brand: "Scratch 程式片段",
  navigation: {
    home: "首頁",
    snippets: "程式片段",
    language: "語言",
  },
  home: {
    eyebrow: "為 Scratch 創作者共享的程式庫",
    title: "用小而清楚的模式，完成更大的 Scratch 專案。",
    description:
      "探索專注、可重用的程式片段，以及清楚的說明和可持續維護的翻譯。",
    primaryAction: "瀏覽程式片段",
    latestTitle: "最新程式片段",
    latestDescription: "為下一個專案準備的近期發布模組。",
  },
  index: {
    eyebrow: "程式片段庫",
    title: "找到一個模式，理解它，再把它變成自己的作品。",
    description: "每個片段都有版本歷史，內容與翻譯可以獨立演進。",
    emptyTitle: "程式庫已經準備好迎接第一批內容",
    emptyDescription: "後續階段執行舊內容匯入器後，程式片段會顯示在這裡。",
    previous: "上一頁",
    next: "下一頁",
  },
  card: {
    fallback: "暫以英文顯示",
    open: "查看片段",
  },
  detail: {
    code: "Scratch 程式碼",
    about: "片段說明",
    symbols: "變數與符號",
    references: "參考資料",
    tags: "標籤",
    revision: "版本",
    translationFallbackTitle: "這個片段還沒有可用的中文翻譯",
    translationFallbackDescription:
      "目前顯示英文內容；中文翻譯可能尚未建立，或正在配合新的程式版本。",
    availableLanguages: "可用語言",
    scriptUntitled: "腳本",
    back: "返回程式片段",
  },
  errors: {
    notFoundTitle: "找不到程式片段",
    notFoundDescription: "它可能不存在、尚未發布，或網址已經改變。",
    localeNotFoundTitle: "暫不支援這種語言",
    localeNotFoundDescription: "請選擇已有語言繼續瀏覽。",
    generalTitle: "發生了一些問題",
    generalDescription: "頁面暫時無法載入，請稍後再試。",
  },
  footer: {
    description: "跨語言分享和解釋可重用的 Scratch 構想。",
  },
};

const messages: Record<Locale, Messages> = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
};

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
