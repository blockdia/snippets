export const PLACEHOLDER_DATABASE_ID = "00000000-0000-0000-0000-000000000000";
export const PLACEHOLDER_ACCESS_TEAM_DOMAIN =
  "https://replace-me.cloudflareaccess.com";
export const PLACEHOLDER_ACCESS_AUD = "replace-me";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReleaseConfig {
  accessAud: string;
  accessTeamDomain: string;
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
    accessAud: requiredString(source, "ACCESS_AUD"),
    accessTeamDomain: requiredString(source, "ACCESS_TEAM_DOMAIN"),
    databaseId: requiredString(source, "database_id"),
    databaseName: requiredString(source, "database_name"),
    r2BucketName: requiredString(source, "bucket_name"),
  };
}

export function assertReleaseConfig(config: ReleaseConfig): void {
  if (
    config.accessTeamDomain === PLACEHOLDER_ACCESS_TEAM_DOMAIN ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(
      config.accessTeamDomain,
    )
  ) {
    throw new Error(
      "Production deploy blocked: replace ACCESS_TEAM_DOMAIN with the HTTPS domain for the Cloudflare Access team.",
    );
  }
  if (
    config.accessAud === PLACEHOLDER_ACCESS_AUD ||
    !/^[a-zA-Z0-9_-]{16,}$/.test(config.accessAud)
  ) {
    throw new Error(
      "Production deploy blocked: replace ACCESS_AUD with the Cloudflare Access application audience tag.",
    );
  }
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
