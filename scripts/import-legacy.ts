#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { buildLegacyImportPlan } from "../app/importer/build-plan";
import {
  legacyImportSqlFile,
  legacyImportVerificationSql,
} from "../app/importer/sql";
import type { LegacyImportPlan } from "../app/importer/types";
import { loadLegacySnapshot } from "./importer/filesystem";

interface Options {
  source: string;
  database: string;
  r2Bucket: string;
  mode: "dry-run" | "local" | "remote";
  persistTo: string | null;
  emitSql: string | null;
  json: boolean;
}

const usage = `Usage: npm run import:legacy -- --source <old-project> [options]

Options:
  --dry-run              Validate and summarize only (default)
  --apply-local          Import into the local D1 database
  --apply-remote         Import into the remote D1 database (explicit only)
  --database <name>      D1 database name or binding (default: snippets)
  --r2-bucket <name>     R2 bucket name (default: snippets-artifacts)
  --persist-to <path>    Isolated local D1 persistence directory
  --emit-sql <path>      Write the deterministic import SQL to a file
  --json                 Print the plan summary as JSON
  --help                 Show this help
`;

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${flag} needs a value`);
  return value;
}

function parseOptions(args: string[]): Options {
  const options: Options = {
    source: process.env.LEGACY_PROJECT ?? "",
    database: "snippets",
    r2Bucket: "snippets-artifacts",
    mode: "dry-run",
    persistTo: null,
    emitSql: null,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--help") {
      console.log(usage);
      process.exit(0);
    } else if (flag === "--source") {
      options.source = takeValue(args, index, flag);
      index += 1;
    } else if (flag === "--database") {
      options.database = takeValue(args, index, flag);
      index += 1;
    } else if (flag === "--r2-bucket") {
      options.r2Bucket = takeValue(args, index, flag);
      index += 1;
    } else if (flag === "--emit-sql") {
      options.emitSql = takeValue(args, index, flag);
      index += 1;
    } else if (flag === "--persist-to") {
      options.persistTo = takeValue(args, index, flag);
      index += 1;
    } else if (flag === "--dry-run") {
      options.mode = "dry-run";
    } else if (flag === "--apply-local") {
      if (options.mode === "remote") throw new Error("Choose one apply mode");
      options.mode = "local";
    } else if (flag === "--apply-remote") {
      if (options.mode === "local") throw new Error("Choose one apply mode");
      options.mode = "remote";
    } else if (flag === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!options.source)
    throw new Error("--source or LEGACY_PROJECT is required");
  if (options.persistTo && options.mode === "remote")
    throw new Error("--persist-to can only be used with local D1");
  return options;
}

function run(
  command: string,
  args: string[],
  capture = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let output = "";
    if (capture && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => (output += chunk));
    }
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(`${command} exited with status ${code ?? "unknown"}`),
          ),
    );
  });
}

function wranglerExecutable(): string {
  return path.resolve(
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler",
  );
}

function printPlan(plan: LegacyImportPlan, asJson: boolean) {
  const summary = {
    source: plan.sourceLabel,
    fingerprint: plan.fingerprint,
    counts: plan.counts,
    diagnostics: plan.diagnostics,
  };
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`Legacy snapshot: ${summary.source}`);
  console.log(`Fingerprint: ${summary.fingerprint}`);
  console.log(
    Object.entries(summary.counts)
      .map(([name, value]) => `${name}=${value}`)
      .join(" "),
  );
  for (const diagnostic of plan.diagnostics) {
    console.error(
      `[${diagnostic.severity.toUpperCase()}] ${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`,
    );
  }
}

async function uploadArtifacts(
  plan: LegacyImportPlan,
  options: Options,
  temporaryDirectory: string,
) {
  const artifacts = plan.snippets.flatMap((snippet) =>
    snippet.artifact ? [snippet.artifact] : [],
  );
  const targetFlag = options.mode === "remote" ? "--remote" : "--local";
  const persistenceArgs = options.persistTo
    ? ["--persist-to", path.resolve(options.persistTo)]
    : [];

  for (const [index, artifact] of artifacts.entries()) {
    const artifactPath = path.join(temporaryDirectory, `${index}.sb3`);
    await writeFile(artifactPath, artifact.bytes, { flag: "wx" });
    await run(wranglerExecutable(), [
      "r2",
      "object",
      "put",
      `${options.r2Bucket}/${artifact.storageKey}`,
      targetFlag,
      ...persistenceArgs,
      "--file",
      artifactPath,
      "--content-type",
      artifact.contentType,
      "--cache-control",
      "public, max-age=31536000, immutable",
      "--storage-class",
      "Standard",
      "--force",
    ]);
  }
  console.log(
    `Uploaded ${artifacts.length} SB3 artifact(s) to R2 bucket ${options.r2Bucket}.`,
  );
}

function verificationRow(raw: string): Record<string, number> | null {
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value)) return null;
  for (const result of value) {
    if (!result || typeof result !== "object") continue;
    const rows = (result as { results?: unknown }).results;
    if (Array.isArray(rows) && rows[0] && typeof rows[0] === "object") {
      return rows[0] as Record<string, number>;
    }
  }
  return null;
}

function assertVerification(row: Record<string, number> | null) {
  if (!row) throw new Error("D1 verification returned no result");
  const pairs = [
    ["snippets", "expected_snippets"],
    ["publications", "expected_publications"],
    ["localization_publications", "expected_localization_publications"],
    ["search_documents", "expected_search_documents"],
    ["artifacts", "expected_artifacts"],
  ] as const;
  for (const [actual, expected] of pairs) {
    if (row[actual] !== row[expected]) {
      throw new Error(
        `Verification failed for ${actual}: ${row[actual]} != ${row[expected]}`,
      );
    }
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const snapshot = await loadLegacySnapshot(options.source);
  const plan = await buildLegacyImportPlan(snapshot);
  printPlan(plan, options.json);
  if (plan.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    process.exitCode = 1;
    return;
  }

  const importedAt = new Date().toISOString();
  const sql = legacyImportSqlFile(plan, importedAt);
  if (options.emitSql) {
    const output = path.resolve(options.emitSql);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, sql, "utf8");
    console.log(`Wrote SQL: ${output}`);
  }
  if (options.mode === "dry-run") return;

  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "snippets-import-"),
  );
  try {
    await uploadArtifacts(plan, options, temporaryDirectory);
    const sqlPath = path.join(temporaryDirectory, "legacy-import.sql");
    await writeFile(sqlPath, sql, "utf8");
    const targetFlag = options.mode === "remote" ? "--remote" : "--local";
    const persistenceArgs = options.persistTo
      ? ["--persist-to", path.resolve(options.persistTo)]
      : [];
    await run(
      wranglerExecutable(),
      [
        "d1",
        "execute",
        options.database,
        targetFlag,
        ...persistenceArgs,
        "--file",
        sqlPath,
        "--yes",
        "--json",
      ],
      true,
    );
    const rawVerification = await run(
      wranglerExecutable(),
      [
        "d1",
        "execute",
        options.database,
        targetFlag,
        ...persistenceArgs,
        "--command",
        legacyImportVerificationSql(plan),
        "--json",
      ],
      true,
    );
    assertVerification(verificationRow(rawVerification));
    console.log(`Import and verification succeeded (${options.mode}).`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
