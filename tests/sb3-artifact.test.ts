import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  sb3MethodNotAllowedResponse,
  sb3PreflightResponse,
  serveSb3Artifact,
} from "../app/http/sb3-artifact.server";

const hash = "b".repeat(64);
const missingHash = "c".repeat(64);
const pathname = `/artifacts/sb3/${hash}.sb3`;
const filename = `${hash}.sb3`;
const bytes = new Uint8Array([80, 75, 3, 4, 11, 22, 33, 44]);

describe("SB3 artifact resource route", () => {
  beforeAll(async () => {
    await env.ARTIFACTS.put(`sb3/${hash}.sb3`, bytes, {
      httpMetadata: {
        cacheControl: "public, max-age=31536000, immutable",
        contentType: "application/x.scratch.sb3",
      },
      sha256: await crypto.subtle.digest("SHA-256", bytes),
    });
  });

  it("streams a complete SB3 object with immutable and TurboWarp headers", async () => {
    const response = await serveSb3Artifact(
      new Request(`https://example.test${pathname}`, {
        headers: { Origin: "https://turbowarp.org" },
      }),
      env.ARTIFACTS,
      filename,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://turbowarp.org",
    );
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("Content-Length")).toBe(String(bytes.length));
    expect(response.headers.get("Content-Type")).toBe(
      "application/x.scratch.sb3",
    );
    expect(response.headers.get("ETag")).toMatch(/^".+"$/);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("supports HEAD, conditional requests and single byte ranges", async () => {
    const head = await serveSb3Artifact(
      new Request(`https://example.test${pathname}`, { method: "HEAD" }),
      env.ARTIFACTS,
      filename,
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Length")).toBe(String(bytes.length));
    expect((await head.arrayBuffer()).byteLength).toBe(0);

    const partial = await serveSb3Artifact(
      new Request(`https://example.test${pathname}`, {
        headers: { Range: "bytes=2-5" },
      }),
      env.ARTIFACTS,
      filename,
    );
    expect(partial.status).toBe(206);
    expect(partial.headers.get("Content-Range")).toBe(
      `bytes 2-5/${bytes.length}`,
    );
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(
      bytes.slice(2, 6),
    );

    const conditional = await serveSb3Artifact(
      new Request(`https://example.test${pathname}`, {
        headers: { "If-None-Match": head.headers.get("ETag") ?? "" },
      }),
      env.ARTIFACTS,
      filename,
    );
    expect(conditional.status).toBe(304);
  });

  it("handles preflight, invalid paths, missing objects and methods", async () => {
    const preflight = sb3PreflightResponse(filename);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, HEAD, OPTIONS",
    );

    await expect(
      serveSb3Artifact(
        new Request("https://example.test/artifacts/sb3/not-a-hash.sb3"),
        env.ARTIFACTS,
        "not-a-hash.sb3",
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      serveSb3Artifact(
        new Request(`https://example.test/artifacts/sb3/${missingHash}.sb3`),
        env.ARTIFACTS,
        `${missingHash}.sb3`,
      ),
    ).resolves.toMatchObject({ status: 404 });
    expect(sb3MethodNotAllowedResponse().status).toBe(405);
  });

  it("rejects malformed or unsatisfiable ranges", async () => {
    const response = await serveSb3Artifact(
      new Request(`https://example.test${pathname}`, {
        headers: { Range: "bytes=999-1000" },
      }),
      env.ARTIFACTS,
      filename,
    );
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe(
      `bytes */${bytes.length}`,
    );
  });
});
