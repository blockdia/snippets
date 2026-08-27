#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";

import { loadReleaseConfig } from "./release/config";

function wranglerExecutable(): string {
  return path.resolve(
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler",
  );
}

function runWrangler(args: string[], capture = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(wranglerExecutable(), args, {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: "1" },
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let output = "";
    if (capture && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
      });
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else
        reject(
          new Error(`wrangler ${args.join(" ")} failed with status ${code}`),
        );
    });
  });
}

function firstD1Row(raw: string): Record<string, unknown> | null {
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value)) return null;
  for (const result of value) {
    if (!result || typeof result !== "object") continue;
    const rows = (result as { results?: unknown }).results;
    if (Array.isArray(rows) && rows[0] && typeof rows[0] === "object") {
      return rows[0] as Record<string, unknown>;
    }
  }
  return null;
}

function positiveCount(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(
      `Remote content check failed: ${key} must be a positive integer, received ${String(value)}.`,
    );
  }
  return value;
}

async function main() {
  const config = await loadReleaseConfig();

  await runWrangler(["whoami"]);
  await runWrangler(["d1", "info", config.databaseName]);
  await runWrangler(["r2", "bucket", "info", config.r2BucketName]);

  const migrations = await runWrangler(
    ["d1", "migrations", "list", config.databaseName, "--remote"],
    true,
  );
  process.stdout.write(migrations);
  if (!migrations.includes("No migrations to apply")) {
    throw new Error(
      "Production deploy blocked: remote D1 still has unapplied migrations.",
    );
  }

  const rawCounts = await runWrangler(
    [
      "d1",
      "execute",
      config.databaseName,
      "--remote",
      "--command",
      "SELECT (SELECT count(*) FROM snippet_publications) AS publications, (SELECT count(*) FROM search_documents) AS search_documents, (SELECT count(*) FROM artifacts) AS artifacts;",
      "--json",
    ],
    true,
  );
  const row = firstD1Row(rawCounts);
  if (!row) throw new Error("Remote content check returned no D1 result row.");

  const publications = positiveCount(row, "publications");
  const searchDocuments = positiveCount(row, "search_documents");
  const artifacts = positiveCount(row, "artifacts");
  console.log(
    `Remote release check passed: publications=${publications} search_documents=${searchDocuments} artifacts=${artifacts}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
