import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { SUPPORTED_LOCALES, type Locale } from "../i18n/locales";

export const SCRATCHBLOCKS_STYLES = [
  "scratch3",
  "scratch3-high-contrast",
  "scratch3-outline",
  "scratch2",
] as const;

export type ScratchblocksStyle = (typeof SCRATCHBLOCKS_STYLES)[number];
export type ScratchblocksTranslation = Locale | "original";

interface ScratchblocksConfig {
  style: ScratchblocksStyle;
  translation: ScratchblocksTranslation;
}

interface ScratchblocksConfigContextValue extends ScratchblocksConfig {
  setStyle: (style: ScratchblocksStyle) => void;
  setTranslation: (translation: ScratchblocksTranslation) => void;
}

const STORAGE_KEY = "scratch-snippets-scratchblocks-config";
const LEGACY_STYLE_STORAGE_KEY = "scratchblocks-style";
const DEFAULT_CONFIG: ScratchblocksConfig = {
  style: "scratch3",
  translation: "original",
};

const ScratchblocksConfigContext =
  createContext<ScratchblocksConfigContextValue | null>(null);

function isStyle(value: unknown): value is ScratchblocksStyle {
  return SCRATCHBLOCKS_STYLES.some((style) => style === value);
}

function isTranslation(value: unknown): value is ScratchblocksTranslation {
  return (
    value === "original" || SUPPORTED_LOCALES.some((locale) => locale === value)
  );
}

function readStoredConfig(): ScratchblocksConfig {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const value: unknown = JSON.parse(stored);
      if (value && typeof value === "object") {
        const candidate = value as Partial<ScratchblocksConfig>;
        return {
          style: isStyle(candidate.style)
            ? candidate.style
            : DEFAULT_CONFIG.style,
          translation: isTranslation(candidate.translation)
            ? candidate.translation
            : DEFAULT_CONFIG.translation,
        };
      }
    }

    const legacyStyle = window.localStorage.getItem(LEGACY_STYLE_STORAGE_KEY);
    return isStyle(legacyStyle)
      ? { ...DEFAULT_CONFIG, style: legacyStyle }
      : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function storeConfig(config: ScratchblocksConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // The selected configuration still applies for this page.
  }
}

export function ScratchblocksConfigProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  // Reading during render would make the server and hydration markup disagree.
  useEffect(() => setConfig(readStoredConfig()), []);

  const value = useMemo<ScratchblocksConfigContextValue>(
    () => ({
      ...config,
      setStyle(style) {
        setConfig((current) => {
          const next = { ...current, style };
          storeConfig(next);
          return next;
        });
      },
      setTranslation(translation) {
        setConfig((current) => {
          const next = { ...current, translation };
          storeConfig(next);
          return next;
        });
      },
    }),
    [config],
  );

  return (
    <ScratchblocksConfigContext value={value}>
      {children}
    </ScratchblocksConfigContext>
  );
}

export function useScratchblocksConfig(): ScratchblocksConfigContextValue {
  const config = useContext(ScratchblocksConfigContext);
  if (!config) {
    throw new Error(
      "useScratchblocksConfig must be used inside ScratchblocksConfigProvider",
    );
  }
  return config;
}
