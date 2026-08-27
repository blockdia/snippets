import { describe, expect, it } from "vitest";

import {
  assertReleaseConfig,
  parseReleaseConfig,
  PLACEHOLDER_DATABASE_ID,
} from "../app/domain/release-config";

const validSource = `{
  "d1_databases": [{
    "database_name": "snippets",
    "database_id": "123e4567-e89b-42d3-a456-426614174000"
  }],
  "r2_buckets": [{ "bucket_name": "snippets-artifacts" }]
}`;

describe("release config guard", () => {
  it("accepts the expected production resources", () => {
    expect(() =>
      assertReleaseConfig(parseReleaseConfig(validSource)),
    ).not.toThrow();
  });

  it("blocks the local-only D1 placeholder", () => {
    const config = parseReleaseConfig(
      validSource.replace(
        "123e4567-e89b-42d3-a456-426614174000",
        PLACEHOLDER_DATABASE_ID,
      ),
    );
    expect(() => assertReleaseConfig(config)).toThrow(/placeholder D1/);
  });

  it("blocks a different R2 bucket", () => {
    const config = parseReleaseConfig(
      validSource.replace("snippets-artifacts", "public-artifacts"),
    );
    expect(() => assertReleaseConfig(config)).toThrow(/expected R2 bucket/);
  });
});
