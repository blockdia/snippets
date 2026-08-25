import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";

import type {
  ImportDiagnostic,
  LegacyInputModule,
  LegacyInputSnapshot,
} from "../../app/importer/types";

async function readJson(
  absolutePath: string,
  displayPath: string,
  diagnostics: ImportDiagnostic[],
): Promise<unknown> {
  try {
    return JSON.parse(await readFile(absolutePath, "utf8")) as unknown;
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "INVALID_JSON",
      path: displayPath,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function readOptionalDirectory(
  absolutePath: string,
): Promise<Dirent<string>[]> {
  try {
    return await readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function loadModule(
  sourceRoot: string,
  directory: string,
  diagnostics: ImportDiagnostic[],
): Promise<LegacyInputModule> {
  const relativeRoot = path.posix.join("content/modules", directory);
  const absoluteRoot = path.join(sourceRoot, "content", "modules", directory);
  const scripts = await readOptionalDirectory(
    path.join(absoluteRoot, "scripts"),
  );
  const translations = await readOptionalDirectory(
    path.join(absoluteRoot, "i18n"),
  );
  const notes = await readOptionalDirectory(path.join(absoluteRoot, "notes"));

  const demoPath = path.join(absoluteRoot, "demo.sb3");
  let demo: LegacyInputModule["demo"];
  try {
    demo = {
      bytes: new Uint8Array(await readFile(demoPath)),
      sourcePath: path.posix.join(relativeRoot, "demo.sb3"),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  return {
    directory,
    meta: await readJson(
      path.join(absoluteRoot, "meta.json"),
      path.posix.join(relativeRoot, "meta.json"),
      diagnostics,
    ),
    scripts: await Promise.all(
      scripts
        .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(async (entry) => ({
          filename: entry.name,
          content: await readFile(
            path.join(absoluteRoot, "scripts", entry.name),
            "utf8",
          ),
        })),
    ),
    translations: await Promise.all(
      translations
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(async (entry) => {
          const sourcePath = path.posix.join(relativeRoot, "i18n", entry.name);
          return {
            locale: entry.name.replace(/\.json$/i, ""),
            value: await readJson(
              path.join(absoluteRoot, "i18n", entry.name),
              sourcePath,
              diagnostics,
            ),
            sourcePath,
          };
        }),
    ),
    notes: await Promise.all(
      notes
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(async (entry) => ({
          locale: entry.name.replace(/\.md$/i, ""),
          markdown: await readFile(
            path.join(absoluteRoot, "notes", entry.name),
            "utf8",
          ),
          sourcePath: path.posix.join(relativeRoot, "notes", entry.name),
        })),
    ),
    demo,
  };
}

export async function loadLegacySnapshot(
  sourceRoot: string,
): Promise<LegacyInputSnapshot> {
  const resolvedRoot = path.resolve(sourceRoot);
  const diagnostics: ImportDiagnostic[] = [];
  const moduleRoot = path.join(resolvedRoot, "content", "modules");
  const entries = await readdir(moduleRoot, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return {
    sourceLabel: "scratch-modules-gallery",
    modules: await Promise.all(
      directories.map((directory) =>
        loadModule(resolvedRoot, directory, diagnostics),
      ),
    ),
    globalTags: await readJson(
      path.join(resolvedRoot, "src", "i18n", "tags.json"),
      "src/i18n/tags.json",
      diagnostics,
    ),
    moduleDefaults: await readJson(
      path.join(resolvedRoot, "src", "i18n", "module-defaults.json"),
      "src/i18n/module-defaults.json",
      diagnostics,
    ),
    diagnostics,
  };
}
