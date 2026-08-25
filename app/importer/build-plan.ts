import {
  computeContentHash,
  computeTranslationBasisHash,
} from "../domain/translation-basis";
import {
  canonicalizeLocale,
  CONTENT_FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from "../i18n/locales";
import { translateLegacyScratchblocks } from "./translate";
import type {
  ImportDiagnostic,
  ImportedContributor,
  ImportedLocalization,
  ImportedScript,
  ImportedSnippet,
  ImportedTag,
  ImportedUnit,
  LegacyImportPlan,
  LegacyInputModule,
  LegacyInputSnapshot,
  LegacyMeta,
  LegacyTranslation,
} from "./types";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMPORT_PATTERN = /^\s*!import\s+([a-zA-Z0-9_-]+)(?::(\d+))?\s*$/;
const MAX_IMPORT_DEPTH = 20;

interface ParsedSourceScript {
  id: string;
  filename: string;
  source: string;
}

interface ParsedModule {
  directory: string;
  id: string;
  meta: Required<Pick<LegacyMeta, "name" | "description">> & LegacyMeta;
  scripts: ParsedSourceScript[];
  translations: Map<Locale, LegacyTranslation>;
  translationPaths: Map<Locale, string>;
  notes: Map<Locale, string>;
  notePaths: Map<Locale, string>;
  demo: LegacyInputModule["demo"];
}

interface ResolvedScriptDraft {
  key: string;
  source: string;
  sourceModuleId: string;
  sourceScriptId: string;
  importedFrom: { moduleId: string; scriptId: string } | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").normalize("NFC").trimEnd();
}

function legacyModulePath(directory: string, entry: string): string {
  return `content/modules/${directory}/${entry}`;
}

function legacyLocale(value: string): Locale | null {
  return canonicalizeLocale(value.replaceAll("_", "-"));
}

function parseScriptFilename(filename: string) {
  const base = filename.replace(/\.txt$/i, "");
  const match = base.match(/^(\d+)[ _-](.+)$/);
  return {
    id: (match?.[2] ?? base).trim(),
    order: match ? Number.parseInt(match[1], 10) : 0,
  };
}

function stringMap(value: unknown): Record<string, string> | undefined {
  const source = record(value);
  if (!source) return undefined;
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, entry]) =>
      typeof entry === "string" && key ? [[key, entry]] : [],
    ),
  );
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseTranslation(value: unknown): LegacyTranslation | null {
  const source = record(value);
  if (!source) return null;
  const translation: LegacyTranslation = {};
  for (const field of ["name", "description", "seoDescription"] as const) {
    if (typeof source[field] === "string") translation[field] = source[field];
  }
  translation.tags = stringArray(source.tags);
  translation.keywords = stringArray(source.keywords);
  for (const field of [
    "variables",
    "lists",
    "events",
    "scriptTitles",
    "procedures",
    "procedureParams",
    "comments",
  ] as const) {
    translation[field] = stringMap(source[field]);
  }
  return translation;
}

function mergeTranslation(
  base: LegacyTranslation | undefined,
  override: LegacyTranslation | undefined,
): LegacyTranslation {
  const merged: LegacyTranslation = { ...base, ...override };
  for (const field of [
    "variables",
    "lists",
    "events",
    "scriptTitles",
    "procedures",
    "procedureParams",
    "comments",
  ] as const) {
    merged[field] = { ...(base?.[field] ?? {}), ...(override?.[field] ?? {}) };
  }
  return merged;
}

async function digest(value: string | Uint8Array): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const result = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(result), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function addDiagnostic(
  diagnostics: ImportDiagnostic[],
  severity: ImportDiagnostic["severity"],
  code: string,
  path: string,
  message: string,
) {
  diagnostics.push({ severity, code, path, message });
}

function parseMeta(
  input: LegacyInputModule,
  diagnostics: ImportDiagnostic[],
): ParsedModule | null {
  const source = record(input.meta);
  const path = legacyModulePath(input.directory, "meta.json");
  if (!source) {
    addDiagnostic(
      diagnostics,
      "error",
      "INVALID_META",
      path,
      "meta.json must contain an object",
    );
    return null;
  }

  const id = typeof source.id === "string" ? source.id.trim() : "";
  const name = typeof source.name === "string" ? source.name.trim() : "";
  const description =
    typeof source.description === "string" ? source.description.trim() : "";
  if (!SLUG_PATTERN.test(id)) {
    addDiagnostic(
      diagnostics,
      "error",
      "INVALID_MODULE_ID",
      path,
      `Invalid canonical module id: ${id || "(empty)"}`,
    );
  }
  if (id !== input.directory) {
    addDiagnostic(
      diagnostics,
      "error",
      "MODULE_DIRECTORY_MISMATCH",
      path,
      `Module id ${id || "(empty)"} does not match directory ${input.directory}`,
    );
  }
  if (!name)
    addDiagnostic(
      diagnostics,
      "error",
      "MISSING_NAME",
      path,
      "English name is required",
    );
  if (!description) {
    addDiagnostic(
      diagnostics,
      "error",
      "MISSING_DESCRIPTION",
      path,
      "English description is required",
    );
  }

  const scripts = input.scripts
    .map((script) => ({ ...script, ...parseScriptFilename(script.filename) }))
    .sort(
      (left, right) =>
        left.order - right.order ||
        left.filename.localeCompare(right.filename, "en", { numeric: true }),
    )
    .map((script) => ({
      id: script.id,
      filename: script.filename,
      source: normalizeText(script.content),
    }));
  if (!scripts.length) {
    addDiagnostic(
      diagnostics,
      "error",
      "MISSING_SCRIPTS",
      legacyModulePath(input.directory, "scripts"),
      "At least one .txt script is required",
    );
  }
  const scriptIds = new Set<string>();
  for (const script of scripts) {
    if (!script.id || !script.source) {
      addDiagnostic(
        diagnostics,
        "error",
        "INVALID_SCRIPT",
        legacyModulePath(input.directory, `scripts/${script.filename}`),
        "Script id and source must not be empty",
      );
    }
    if (scriptIds.has(script.id)) {
      addDiagnostic(
        diagnostics,
        "error",
        "DUPLICATE_SCRIPT_ID",
        legacyModulePath(input.directory, `scripts/${script.filename}`),
        `Duplicate script id: ${script.id}`,
      );
    }
    scriptIds.add(script.id);
  }

  const translations = new Map<Locale, LegacyTranslation>();
  const translationPaths = new Map<Locale, string>();
  for (const translation of input.translations) {
    const locale = legacyLocale(translation.locale);
    if (!locale) {
      addDiagnostic(
        diagnostics,
        "warning",
        "UNSUPPORTED_LOCALE",
        translation.sourcePath,
        `Skipping unsupported locale ${translation.locale}`,
      );
      continue;
    }
    if (translations.has(locale)) {
      addDiagnostic(
        diagnostics,
        "error",
        "DUPLICATE_LOCALE",
        translation.sourcePath,
        `Duplicate localization for ${locale}`,
      );
      continue;
    }
    const parsed = parseTranslation(translation.value);
    if (!parsed) {
      addDiagnostic(
        diagnostics,
        "error",
        "INVALID_TRANSLATION",
        translation.sourcePath,
        "Translation file must contain an object",
      );
      continue;
    }
    translations.set(locale, parsed);
    translationPaths.set(locale, translation.sourcePath);
  }

  const notes = new Map<Locale, string>();
  const notePaths = new Map<Locale, string>();
  for (const note of input.notes) {
    const locale = legacyLocale(note.locale);
    if (!locale) {
      addDiagnostic(
        diagnostics,
        "warning",
        "UNSUPPORTED_LOCALE",
        note.sourcePath,
        `Skipping unsupported notes locale ${note.locale}`,
      );
      continue;
    }
    notes.set(locale, normalizeText(note.markdown));
    notePaths.set(locale, note.sourcePath);
  }

  const rawPreviewScriptKey = source.previewScriptKey;
  const previewScriptKey =
    typeof rawPreviewScriptKey === "string" &&
    rawPreviewScriptKey.length > 0 &&
    rawPreviewScriptKey === rawPreviewScriptKey.trim()
      ? rawPreviewScriptKey
      : undefined;
  if (rawPreviewScriptKey !== undefined && !previewScriptKey) {
    addDiagnostic(
      diagnostics,
      "error",
      "INVALID_PREVIEW_SCRIPT",
      path,
      "previewScriptKey must be a non-empty canonical script key",
    );
  }

  const meta: ParsedModule["meta"] = {
    ...(source as LegacyMeta),
    name,
    description,
    id,
    tags: stringArray(source.tags) ?? [],
    keywords: stringArray(source.keywords) ?? [],
    scriptTitles: stringMap(source.scriptTitles) ?? {},
    contributors: Array.isArray(source.contributors) ? source.contributors : [],
    variables: Array.isArray(source.variables)
      ? (source.variables as LegacyMeta["variables"])
      : [],
    references: Array.isArray(source.references)
      ? (source.references as LegacyMeta["references"])
      : [],
    seoDescription:
      typeof source.seoDescription === "string"
        ? source.seoDescription
        : undefined,
    previewScriptKey,
  };

  return {
    directory: input.directory,
    id,
    meta,
    scripts,
    translations,
    translationPaths,
    notes,
    notePaths,
    demo: input.demo,
  };
}

function parseDefaultTranslations(
  value: unknown,
): Map<Locale, LegacyTranslation> {
  const defaults = new Map<Locale, LegacyTranslation>();
  for (const [rawLocale, entry] of Object.entries(record(value) ?? {})) {
    const locale = legacyLocale(rawLocale);
    const translation = parseTranslation(entry);
    if (locale && translation) defaults.set(locale, translation);
  }
  return defaults;
}

function translationFor(
  module: ParsedModule,
  locale: Locale,
  defaults: Map<Locale, LegacyTranslation>,
): LegacyTranslation {
  return mergeTranslation(
    defaults.get(locale),
    module.translations.get(locale),
  );
}

function englishScriptTitle(
  module: ParsedModule,
  scriptId: string,
  defaults: Map<Locale, LegacyTranslation>,
): string {
  return (
    module.meta.scriptTitles?.[scriptId] ??
    defaults.get(CONTENT_FALLBACK_LOCALE)?.scriptTitles?.[scriptId] ??
    scriptId
  );
}

function resolveScripts(
  module: ParsedModule,
  modules: Map<string, ParsedModule>,
  diagnostics: ImportDiagnostic[],
): { scripts: ResolvedScriptDraft[]; imports: ImportedSnippet["imports"] } {
  const output: ResolvedScriptDraft[] = [];
  const imports: ImportedSnippet["imports"] = [];

  function expand(
    moduleId: string,
    scriptIndex: number,
    stack: string[],
  ): { source: string; scriptId: string } | null {
    const target = modules.get(moduleId);
    const targetScript = target?.scripts[scriptIndex - 1];
    const key = `${moduleId}:${scriptIndex}`;
    if (!target) {
      addDiagnostic(
        diagnostics,
        "error",
        "IMPORT_NOT_FOUND",
        legacyModulePath(module.directory, "scripts"),
        `Imported module ${moduleId} does not exist`,
      );
      return null;
    }
    if (!targetScript) {
      addDiagnostic(
        diagnostics,
        "error",
        "IMPORT_INDEX_OUT_OF_RANGE",
        legacyModulePath(module.directory, "scripts"),
        `Imported module ${moduleId} has no script ${scriptIndex}`,
      );
      return null;
    }
    if (stack.includes(key) || stack.length >= MAX_IMPORT_DEPTH) {
      addDiagnostic(
        diagnostics,
        "error",
        "IMPORT_CYCLE",
        legacyModulePath(module.directory, "scripts"),
        `Import cycle or excessive depth: ${[...stack, key].join(" -> ")}`,
      );
      return null;
    }

    const lines: string[] = [];
    for (const line of targetScript.source.split("\n")) {
      const match = line.match(IMPORT_PATTERN);
      if (!match) {
        lines.push(line);
        continue;
      }
      const nested = expand(
        match[1],
        match[2] ? Number.parseInt(match[2], 10) : 1,
        [...stack, key],
      );
      if (nested) lines.push(nested.source);
    }
    return {
      source: normalizeText(lines.join("\n")),
      scriptId: targetScript.id,
    };
  }

  for (const sourceScript of module.scripts) {
    const ownLines: string[] = [];
    let importIndex = 0;
    let sawOwnContent = false;
    for (const line of sourceScript.source.split("\n")) {
      const match = line.match(IMPORT_PATTERN);
      if (!match) {
        ownLines.push(line);
        if (line.trim()) sawOwnContent = true;
        continue;
      }
      importIndex += 1;
      if (sawOwnContent) {
        addDiagnostic(
          diagnostics,
          "warning",
          "INLINE_IMPORT_NORMALIZED",
          legacyModulePath(
            module.directory,
            `scripts/${sourceScript.filename}`,
          ),
          "Inline import is emitted as a separate leading script",
        );
      }
      const targetIndex = match[2] ? Number.parseInt(match[2], 10) : 1;
      const resolved = expand(match[1], targetIndex, [
        `${module.id}:${sourceScript.id}`,
      ]);
      if (!resolved) continue;
      const scriptKey = `${sourceScript.id}--import-${importIndex}-${match[1]}-${resolved.scriptId}`;
      output.push({
        key: scriptKey,
        source: resolved.source,
        sourceModuleId: match[1],
        sourceScriptId: resolved.scriptId,
        importedFrom: { moduleId: match[1], scriptId: resolved.scriptId },
      });
      imports.push({
        scriptKey,
        moduleId: match[1],
        scriptId: resolved.scriptId,
      });
    }
    const ownSource = normalizeText(ownLines.join("\n"));
    if (ownSource) {
      output.push({
        key: sourceScript.id,
        source: ownSource,
        sourceModuleId: module.id,
        sourceScriptId: sourceScript.id,
        importedFrom: null,
      });
    }
  }
  return { scripts: output, imports };
}

function contributorFrom(
  value: unknown,
): Omit<ImportedContributor, "id"> | null {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (text.startsWith("gh/") && text.slice(3).trim()) {
      const name = text.slice(3).trim();
      return {
        kind: "github",
        externalId: name.toLowerCase(),
        displayName: name,
        profileUrl: `https://github.com/${name}`,
      };
    }
    if (text.startsWith("sc/") && text.slice(3).trim()) {
      const name = text.slice(3).trim();
      return {
        kind: "scratch",
        externalId: name.toLowerCase(),
        displayName: name,
        profileUrl: `https://scratch.mit.edu/users/${name}`,
      };
    }
    return {
      kind: "name",
      externalId: text.toLocaleLowerCase(),
      displayName: text,
      profileUrl: null,
    };
  }
  const source = record(value);
  if (!source || typeof source.name !== "string" || !source.name.trim())
    return null;
  const name = source.name.trim();
  const profileUrl = typeof source.url === "string" ? source.url : null;
  return {
    kind: "name",
    externalId: name.toLocaleLowerCase(),
    displayName: name,
    profileUrl,
  };
}

function referenceKind(url: string, type: string | undefined) {
  const hint = `${type ?? ""} ${url}`.toLowerCase();
  if (hint.includes("github.com")) return "repository" as const;
  if (
    hint.includes("youtube") ||
    hint.includes("youtu.be") ||
    hint.includes("video")
  )
    return "video" as const;
  if (hint.includes("scratch.mit.edu/projects")) return "project" as const;
  if (hint.includes("article") || hint.includes("wiki"))
    return "article" as const;
  return "other" as const;
}

export async function buildLegacyImportPlan(
  input: LegacyInputSnapshot,
): Promise<LegacyImportPlan> {
  const diagnostics = [...(input.diagnostics ?? [])];
  const parsedModules = input.modules
    .filter((module) => !module.directory.startsWith("."))
    .map((module) => parseMeta(module, diagnostics))
    .filter((module): module is ParsedModule => Boolean(module));
  const modules = new Map<string, ParsedModule>();
  for (const module of parsedModules) {
    if (modules.has(module.id)) {
      addDiagnostic(
        diagnostics,
        "error",
        "DUPLICATE_MODULE_ID",
        module.directory,
        `Duplicate module id ${module.id}`,
      );
    } else {
      modules.set(module.id, module);
    }
  }

  const defaults = parseDefaultTranslations(input.moduleDefaults);
  const globalTagSource = record(input.globalTags) ?? {};
  const contributorMap = new Map<string, ImportedContributor>();
  const usedTags = new Set<string>();
  const snippets: ImportedSnippet[] = [];

  for (const module of [...modules.values()].sort((left, right) =>
    left.id.localeCompare(right.id, "en"),
  )) {
    const { scripts: scriptDrafts, imports } = resolveScripts(
      module,
      modules,
      diagnostics,
    );
    const previewScriptKey = module.meta.previewScriptKey || null;
    if (
      previewScriptKey &&
      !scriptDrafts.some((script) => script.key === previewScriptKey)
    ) {
      addDiagnostic(
        diagnostics,
        "error",
        "INVALID_PREVIEW_SCRIPT",
        legacyModulePath(module.directory, "meta.json"),
        `Preview script ${previewScriptKey} does not exist after imports are resolved`,
      );
    }
    const snippetId = `legacy-snippet-${module.id}`;

    const unitsDraft: Omit<ImportedUnit, "id" | "position">[] = [];
    for (const script of scriptDrafts) {
      const sourceModule = modules.get(script.sourceModuleId) ?? module;
      unitsDraft.push({
        key: `script:${script.key}:title`,
        kind: "script-title",
        sourceText: englishScriptTitle(
          sourceModule,
          script.sourceScriptId,
          defaults,
        ),
        sourceModuleId: sourceModule.id,
        sourceField: `scriptTitles:${script.sourceScriptId}`,
      });
    }

    const symbolsDraft: Omit<
      ImportedSnippet["symbols"][number],
      "id" | "position"
    >[] = [];
    for (const [index, variable] of (module.meta.variables ?? []).entries()) {
      const name =
        typeof variable.name === "string" ? variable.name.trim() : "";
      if (!name) {
        addDiagnostic(
          diagnostics,
          "error",
          "INVALID_SYMBOL",
          legacyModulePath(module.directory, "meta.json"),
          `Variable ${index + 1} has no name`,
        );
        continue;
      }
      const kind = variable.type === "list" ? "list" : "variable";
      const scope = ["global", "sprite", "local", "choose"].includes(
        variable.scope ?? "",
      )
        ? (variable.scope as "global" | "sprite" | "local" | "choose")
        : "sprite";
      const key = `${kind}:${index + 1}`;
      const nameUnitKey = `symbol:${key}:name`;
      unitsDraft.push({
        key: nameUnitKey,
        kind: "symbol",
        sourceText: name,
        sourceModuleId: module.id,
        sourceField: `${kind === "list" ? "lists" : "variables"}:${name}`,
      });
      symbolsDraft.push({ key, kind, scope, nameUnitKey, legacyName: name });
    }

    const referencesDraft: Omit<ImportedSnippet["references"][number], "id">[] =
      [];
    for (const [index, reference] of (module.meta.references ?? []).entries()) {
      const title =
        typeof reference.title === "string" ? reference.title.trim() : "";
      const url = typeof reference.url === "string" ? reference.url.trim() : "";
      try {
        const parsed = new URL(url);
        if (!title || !["http:", "https:"].includes(parsed.protocol))
          throw new Error();
      } catch {
        addDiagnostic(
          diagnostics,
          "error",
          "INVALID_REFERENCE",
          legacyModulePath(module.directory, "meta.json"),
          `Reference ${index + 1} must have a title and HTTP(S) URL`,
        );
        continue;
      }
      const key = `reference:${index + 1}`;
      const titleUnitKey = `${key}:title`;
      unitsDraft.push({
        key: titleUnitKey,
        kind: "reference",
        sourceText: title,
        sourceModuleId: module.id,
        sourceField: `references:${index + 1}`,
      });
      referencesDraft.push({
        key,
        kind: referenceKind(url, reference.type),
        url,
        titleUnitKey,
        position: index,
      });
    }

    const tags = (module.meta.tags ?? []).filter((tag) => {
      if (!SLUG_PATTERN.test(tag)) {
        addDiagnostic(
          diagnostics,
          "error",
          "INVALID_TAG",
          legacyModulePath(module.directory, "meta.json"),
          `Invalid tag slug ${tag}`,
        );
        return false;
      }
      usedTags.add(tag);
      return true;
    });

    let artifact: ImportedSnippet["artifact"] = null;
    if (module.demo) {
      const artifactHash = await digest(module.demo.bytes);
      artifact = {
        id: "",
        key: "demo",
        storageKey: `examples/legacy/${module.id}/${artifactHash.slice(0, 16)}.sb3`,
        contentType: "application/x.scratch.sb3",
        byteSize: module.demo.bytes.byteLength,
        sha256: artifactHash,
        sourcePath: module.demo.sourcePath,
        bytes: module.demo.bytes,
      };
    }

    const basisHash = await computeTranslationBasisHash({
      representation: "scratchblocks",
      representationVersion: 1,
      scripts: scriptDrafts.map((script) => ({
        key: script.key,
        source: script.source,
      })),
      units: unitsDraft.map((unit) => ({
        key: unit.key,
        kind: unit.kind,
        sourceText: unit.sourceText,
      })),
    });
    const contentHash = await computeContentHash({
      artifact: artifact
        ? { key: artifact.key, sha256: artifact.sha256 }
        : null,
      imports,
      ...(previewScriptKey ? { previewScriptKey } : {}),
      references: referencesDraft.map(
        ({ key, kind, url, titleUnitKey, position }) => ({
          key,
          kind,
          url,
          titleUnitKey,
          position,
        }),
      ),
      scripts: scriptDrafts.map((script, position) => ({
        key: script.key,
        position,
        source: script.source,
        importedFrom: script.importedFrom,
      })),
      symbols: symbolsDraft,
      tags,
    });
    const revisionId = `legacy-revision-${module.id}-${contentHash.split(":")[1].slice(0, 24)}`;
    if (artifact) {
      artifact.id = `legacy-artifact-${module.id}-${contentHash.split(":")[1].slice(0, 16)}-${artifact.sha256.slice(0, 16)}`;
    }

    const scripts: ImportedScript[] = await Promise.all(
      scriptDrafts.map(async (script, position) => ({
        id: `legacy-script-${(await digest(`${revisionId}:${script.key}`)).slice(0, 24)}`,
        ...script,
        position,
      })),
    );
    const units: ImportedUnit[] = await Promise.all(
      unitsDraft.map(async (unit, position) => ({
        id: `legacy-unit-${(await digest(`${revisionId}:${unit.key}`)).slice(0, 24)}`,
        ...unit,
        position,
      })),
    );
    const symbols = await Promise.all(
      symbolsDraft.map(async (symbol, position) => ({
        id: `legacy-symbol-${(await digest(`${revisionId}:${symbol.key}`)).slice(0, 24)}`,
        ...symbol,
        position,
      })),
    );
    const references = await Promise.all(
      referencesDraft.map(async (reference) => ({
        id: `legacy-reference-${(await digest(`${revisionId}:${reference.key}`)).slice(0, 24)}`,
        ...reference,
      })),
    );

    const rawContributors = module.meta.contributors ?? [];
    const contributorIds: string[] = [];
    for (const value of rawContributors) {
      const contributor = contributorFrom(value);
      if (!contributor) {
        addDiagnostic(
          diagnostics,
          "warning",
          "INVALID_CONTRIBUTOR",
          legacyModulePath(module.directory, "meta.json"),
          "Skipping invalid contributor entry",
        );
        continue;
      }
      const contributorKey = `${contributor.kind}:${contributor.externalId ?? contributor.displayName}`;
      const id = `legacy-contributor-${(await digest(contributorKey)).slice(0, 24)}`;
      contributorMap.set(id, { id, ...contributor });
      contributorIds.push(id);
    }

    const localizationLocales = new Set<Locale>([CONTENT_FALLBACK_LOCALE]);
    module.translations.forEach((_value, locale) =>
      localizationLocales.add(locale),
    );
    module.notes.forEach((_value, locale) => localizationLocales.add(locale));
    const localizations: ImportedLocalization[] = [];

    for (const locale of [...localizationLocales].sort((left, right) =>
      left.localeCompare(right, "en"),
    )) {
      const translated = translationFor(module, locale, defaults);
      const inheritedFields: string[] = [];
      const title =
        locale === "en"
          ? module.meta.name
          : translated.name || module.meta.name;
      const summary =
        locale === "en"
          ? module.meta.description
          : translated.description || module.meta.description;
      if (locale !== "en" && !translated.name) inheritedFields.push("title");
      if (locale !== "en" && !translated.description)
        inheritedFields.push("summary");
      const exactNotes = module.notes.get(locale);
      const bodyMarkdown = exactNotes ?? module.notes.get("en") ?? "";
      if (locale !== "en" && !exactNotes && bodyMarkdown)
        inheritedFields.push("bodyMarkdown");

      const localizedScripts = scripts.flatMap((script) => {
        const sourceModule = modules.get(script.sourceModuleId) ?? module;
        const maps = translationFor(sourceModule, locale, defaults);
        const result = translateLegacyScratchblocks(script.source, locale, {
          vars: maps.variables,
          lists: maps.lists,
          events: maps.events,
          params: maps.procedureParams,
          procs: maps.procedures,
          comments: maps.comments,
        });
        return result !== script.source
          ? [{ id: "", scriptKey: script.key, source: result }]
          : [];
      });

      const localizedUnits = units.flatMap((unit) => {
        const sourceModule = modules.get(unit.sourceModuleId) ?? module;
        const maps = translationFor(sourceModule, locale, defaults);
        const separator = unit.sourceField.indexOf(":");
        const field = unit.sourceField.slice(
          0,
          separator,
        ) as keyof LegacyTranslation;
        const sourceKey = unit.sourceField.slice(separator + 1);
        let value = unit.sourceText;
        if (field === "scriptTitles") {
          value = maps.scriptTitles?.[sourceKey] ?? unit.sourceText;
        } else if (
          [
            "variables",
            "lists",
            "procedures",
            "procedureParams",
            "comments",
          ].includes(field)
        ) {
          const map = maps[field] as Record<string, string> | undefined;
          value = map?.[sourceKey] ?? unit.sourceText;
        }
        return value !== unit.sourceText
          ? [{ id: "", unitKey: unit.key, translatedText: value }]
          : [];
      });

      const keywords = [
        ...new Set(translated.keywords ?? module.meta.keywords ?? []),
      ];
      const localizationContentHash = await computeContentHash({
        bodyMarkdown,
        inheritedFields,
        keywords,
        locale,
        scripts: localizedScripts.map(({ scriptKey, source }) => ({
          scriptKey,
          source,
        })),
        seoDescription:
          translated.seoDescription ?? module.meta.seoDescription ?? null,
        summary,
        title,
        units: localizedUnits.map(({ unitKey, translatedText }) => ({
          unitKey,
          translatedText,
        })),
      });
      const localeKey = locale.toLowerCase();
      const localizationId = `legacy-localization-${module.id}-${localeKey}`;
      const localizationRevisionId = `legacy-localization-revision-${module.id}-${localeKey}-${localizationContentHash.split(":")[1].slice(0, 24)}`;
      localizedScripts.forEach((script) => {
        script.id = `legacy-localized-script-${localizationRevisionId}-${script.scriptKey}`;
      });
      localizedUnits.forEach((unit) => {
        unit.id = `legacy-localized-unit-${localizationRevisionId}-${unit.unitKey}`;
      });
      const dependencyRefs = new Set<string>();
      for (const script of scripts) {
        const sourceModule = modules.get(script.sourceModuleId);
        if (!sourceModule || sourceModule.id === module.id) continue;
        const dependencyRef =
          locale === "en"
            ? legacyModulePath(sourceModule.directory, "meta.json")
            : sourceModule.translationPaths.get(locale);
        if (dependencyRef) dependencyRefs.add(dependencyRef);
      }
      const sourceRefs = [
        locale === "en"
          ? legacyModulePath(module.directory, "meta.json")
          : module.translationPaths.get(locale),
        exactNotes
          ? module.notePaths.get(locale)
          : bodyMarkdown
            ? module.notePaths.get("en")
            : undefined,
        ...dependencyRefs,
      ].filter((value): value is string => Boolean(value));
      localizations.push({
        localizationId,
        revisionId: localizationRevisionId,
        contentHash: localizationContentHash,
        locale,
        title,
        summary,
        seoDescription:
          translated.seoDescription ?? module.meta.seoDescription ?? null,
        bodyMarkdown,
        keywords,
        scripts: localizedScripts,
        units: localizedUnits,
        inheritedFields,
        sourceRefs,
      });
    }

    snippets.push({
      legacyId: module.id,
      slug: module.id,
      snippetId,
      revisionId,
      contentHash,
      translationBasisHash: basisHash,
      previewScriptKey,
      scripts,
      units,
      symbols,
      references,
      tagSlugs: tags,
      contributorIds,
      localizations,
      artifact,
      sourceRef: legacyModulePath(module.directory, "meta.json"),
      imports,
    });
  }

  const tags: ImportedTag[] = [...usedTags]
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((slug) => {
      const labels = record(globalTagSource[slug]) ?? {};
      return {
        id: `legacy-tag-${slug}`,
        slug,
        localizations: SUPPORTED_LOCALES.map((locale) => {
          const legacyKey = locale.toLowerCase();
          const label =
            typeof labels[legacyKey] === "string" ? labels[legacyKey] : slug;
          if (label === slug && locale !== "en") {
            addDiagnostic(
              diagnostics,
              "warning",
              "MISSING_TAG_TRANSLATION",
              "src/i18n/tags.json",
              `Tag ${slug} has no ${locale} label`,
            );
          }
          return { locale, name: label };
        }),
      };
    });
  const contributors = [...contributorMap.values()].sort((left, right) =>
    left.id.localeCompare(right.id, "en"),
  );
  const fingerprintHash = await computeContentHash({
    contributors: contributors.map(
      ({ id, kind, externalId, displayName, profileUrl }) => ({
        id,
        kind,
        externalId,
        displayName,
        profileUrl,
      }),
    ),
    snippets: snippets.map((snippet) => ({
      contentHash: snippet.contentHash,
      legacyId: snippet.legacyId,
      localizations: snippet.localizations.map((localization) => ({
        locale: localization.locale,
        contentHash: localization.contentHash,
      })),
    })),
    tags: tags.map((tag) => ({
      slug: tag.slug,
      localizations: tag.localizations,
    })),
    version: 1,
  });
  const fingerprint = `legacy-snapshot-v1:${fingerprintHash.split(":")[1]}`;

  diagnostics.sort(
    (left, right) =>
      ({ error: 0, warning: 1, info: 2 })[left.severity] -
        { error: 0, warning: 1, info: 2 }[right.severity] ||
      left.path.localeCompare(right.path, "en") ||
      left.code.localeCompare(right.code, "en"),
  );

  return {
    version: 1,
    sourceLabel: input.sourceLabel,
    fingerprint,
    snippets,
    contributors,
    tags,
    diagnostics,
    counts: {
      snippets: snippets.length,
      scripts: snippets.reduce(
        (total, snippet) => total + snippet.scripts.length,
        0,
      ),
      localizations: snippets.reduce(
        (total, snippet) => total + snippet.localizations.length,
        0,
      ),
      localizedScripts: snippets.reduce(
        (total, snippet) =>
          total +
          snippet.localizations.reduce(
            (sum, localization) => sum + localization.scripts.length,
            0,
          ),
        0,
      ),
      tags: tags.length,
      contributors: contributors.length,
      references: snippets.reduce(
        (total, snippet) => total + snippet.references.length,
        0,
      ),
      artifacts: snippets.filter((snippet) => snippet.artifact).length,
    },
  };
}
