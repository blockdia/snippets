export const PLACEHOLDER_DATABASE_ID = "00000000-0000-0000-0000-000000000000";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReleaseConfig {
  databaseId: string;
  databaseName: string;
  r2BucketName: string;
}

function requiredString(source: string, key: string): string {
  const match = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(source);
  if (!match) throw new Error(`wrangler.jsonc is missing ${key}`);
  return match[1];
}

export function parseReleaseConfig(source: string): ReleaseConfig {
  return {
    databaseId: requiredString(source, "database_id"),
    databaseName: requiredString(source, "database_name"),
    r2BucketName: requiredString(source, "bucket_name"),
  };
}

export function assertReleaseConfig(config: ReleaseConfig): void {
  if (
    config.databaseId === PLACEHOLDER_DATABASE_ID ||
    !UUID_PATTERN.test(config.databaseId)
  ) {
    throw new Error(
      "Production deploy blocked: replace the placeholder D1 database_id in wrangler.jsonc with the real D1 UUID.",
    );
  }
  if (config.databaseName !== "snippets") {
    throw new Error(
      `Production deploy blocked: expected D1 database_name snippets, received ${config.databaseName}.`,
    );
  }
  if (config.r2BucketName !== "snippets-artifacts") {
    throw new Error(
      `Production deploy blocked: expected R2 bucket snippets-artifacts, received ${config.r2BucketName}.`,
    );
  }
}
