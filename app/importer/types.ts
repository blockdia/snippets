import type { Locale } from "../i18n/locales";
import type { TranslationUnitKind } from "../domain/translation-basis";

export interface LegacyTranslation {
  name?: string;
  description?: string;
  seoDescription?: string;
  tags?: string[];
  keywords?: string[];
  variables?: Record<string, string>;
  lists?: Record<string, string>;
  events?: Record<string, string>;
  scriptTitles?: Record<string, string>;
  procedures?: Record<string, string>;
  procedureParams?: Record<string, string>;
  comments?: Record<string, string>;
}

export interface LegacyMeta {
  id?: string;
  name?: string;
  description?: string;
  seoDescription?: string;
  tags?: string[];
  keywords?: string[];
  previewScriptKey?: string;
  contributors?: unknown[];
  scriptTitles?: Record<string, string>;
  variables?: {
    name?: string;
    displayName?: string;
    type?: string;
    scope?: string;
  }[];
  references?: { title?: string; url?: string; type?: string }[];
}

export interface LegacyInputModule {
  directory: string;
  meta: unknown;
  scripts: { filename: string; content: string }[];
  translations: { locale: string; value: unknown; sourcePath: string }[];
  notes: { locale: string; markdown: string; sourcePath: string }[];
  demo?: { bytes: Uint8Array; sourcePath: string };
}

export interface LegacyInputSnapshot {
  sourceLabel: string;
  modules: LegacyInputModule[];
  globalTags: unknown;
  moduleDefaults: unknown;
  diagnostics?: ImportDiagnostic[];
}

export type ImportDiagnosticSeverity = "error" | "warning" | "info";

export interface ImportDiagnostic {
  severity: ImportDiagnosticSeverity;
  code: string;
  path: string;
  message: string;
}

export interface ImportedContributor {
  id: string;
  kind: "github" | "scratch" | "name" | "organization";
  externalId: string | null;
  displayName: string;
  profileUrl: string | null;
}

export interface ImportedTag {
  id: string;
  slug: string;
  localizations: { locale: Locale; name: string }[];
}

export interface ImportedScript {
  id: string;
  key: string;
  position: number;
  source: string;
  sourceModuleId: string;
  sourceScriptId: string;
  importedFrom: { moduleId: string; scriptId: string } | null;
}

export interface ImportedUnit {
  id: string;
  key: string;
  kind: TranslationUnitKind;
  position: number;
  sourceText: string;
  sourceModuleId: string;
  sourceField: string;
}

export interface ImportedSymbol {
  id: string;
  key: string;
  kind: "variable" | "list" | "broadcast" | "custom-argument";
  scope: "global" | "sprite" | "local" | "choose";
  nameUnitKey: string;
  position: number;
  legacyName: string;
}

export interface ImportedReference {
  id: string;
  key: string;
  kind: "article" | "project" | "video" | "extension" | "repository" | "other";
  url: string;
  titleUnitKey: string;
  position: number;
}

export interface ImportedLocalization {
  localizationId: string;
  revisionId: string;
  contentHash: string;
  locale: Locale;
  title: string;
  summary: string;
  seoDescription: string | null;
  bodyMarkdown: string;
  keywords: string[];
  scripts: { id: string; scriptKey: string; source: string }[];
  units: { id: string; unitKey: string; translatedText: string }[];
  inheritedFields: string[];
  sourceRefs: string[];
}

export interface ImportedArtifact {
  id: string;
  key: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  sourcePath: string;
  bytes: Uint8Array;
}

export interface ImportedSnippet {
  legacyId: string;
  slug: string;
  snippetId: string;
  revisionId: string;
  contentHash: string;
  translationBasisHash: string;
  previewScriptKey: string | null;
  scripts: ImportedScript[];
  units: ImportedUnit[];
  symbols: ImportedSymbol[];
  references: ImportedReference[];
  tagSlugs: string[];
  contributorIds: string[];
  localizations: ImportedLocalization[];
  artifact: ImportedArtifact | null;
  sourceRef: string;
  imports: { scriptKey: string; moduleId: string; scriptId: string }[];
}

export interface LegacyImportPlan {
  version: 1;
  sourceLabel: string;
  fingerprint: string;
  snippets: ImportedSnippet[];
  contributors: ImportedContributor[];
  tags: ImportedTag[];
  diagnostics: ImportDiagnostic[];
  counts: {
    snippets: number;
    scripts: number;
    localizations: number;
    localizedScripts: number;
    tags: number;
    contributors: number;
    references: number;
    artifacts: number;
  };
}
