import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  assertReleaseConfig,
  parseReleaseConfig,
  type ReleaseConfig,
} from "../../app/domain/release-config";

export async function loadReleaseConfig(
  projectRoot = process.cwd(),
): Promise<ReleaseConfig> {
  const source = await readFile(
    path.join(projectRoot, "wrangler.jsonc"),
    "utf8",
  );
  const config = parseReleaseConfig(source);
  assertReleaseConfig(config);
  return config;
}
