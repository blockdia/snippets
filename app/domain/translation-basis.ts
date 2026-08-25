export const TRANSLATION_BASIS_VERSION = 1 as const;

export type TranslationUnitKind =
  "script-title" | "symbol" | "procedure" | "comment" | "reference";

export interface TranslationBasisInput {
  representation: "scratchblocks" | "scratch-blocks-ast";
  representationVersion: number;
  scripts: readonly {
    key: string;
    source: string;
  }[];
  units: readonly {
    key: string;
    kind: TranslationUnitKind;
    sourceText: string;
  }[];
}

type JsonValue =
  boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue };

function normalizeString(value: string): string {
  return value.replace(/\r\n?/g, "\n").normalize("NFC");
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
}

function normalizeKey(value: string, field: string): string {
  const normalized = normalizeString(value);
  if (normalized.length === 0) {
    throw new TypeError(`${field} must not be empty`);
  }
  return normalized;
}

function assertUniqueKeys(
  entries: readonly { key: string }[],
  field: string,
): void {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (keys.has(entry.key)) {
      throw new TypeError(`${field} contains duplicate key: ${entry.key}`);
    }
    keys.add(entry.key);
  }
}

export function canonicalizeTranslationBasis(
  input: TranslationBasisInput,
): string {
  assertPositiveInteger(input.representationVersion, "representationVersion");

  const scripts = input.scripts
    .map((script) => ({
      key: normalizeKey(script.key, "scripts.key"),
      source: normalizeString(script.source),
    }))
    .sort((left, right) => left.key.localeCompare(right.key, "en"));

  const units = input.units
    .map((unit) => ({
      key: normalizeKey(unit.key, "units.key"),
      kind: unit.kind,
      sourceText: normalizeString(unit.sourceText),
    }))
    .sort((left, right) => left.key.localeCompare(right.key, "en"));

  assertUniqueKeys(scripts, "scripts");
  assertUniqueKeys(units, "units");

  return canonicalJson({
    representation: input.representation,
    representationVersion: input.representationVersion,
    scripts,
    units,
    version: TRANSLATION_BASIS_VERSION,
  });
}

export async function computeTranslationBasisHash(
  input: TranslationBasisInput,
): Promise<string> {
  const canonical = canonicalizeTranslationBasis(input);
  const digest = await sha256(canonical);
  return `translation-basis-v${TRANSLATION_BASIS_VERSION}:${digest}`;
}

export async function computeContentHash(content: JsonValue): Promise<string> {
  return `snippet-content-v1:${await sha256(canonicalJson(content))}`;
}

export function canonicalJson(value: JsonValue): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not support non-finite numbers");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right, "en"),
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
