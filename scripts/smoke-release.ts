#!/usr/bin/env node

import process from "node:process";

interface Options {
  baseUrl: URL;
}

function parseOptions(args: string[]): Options {
  let baseUrl = process.env.RELEASE_URL ?? "";
  let allowHttpLoopback = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--base-url") baseUrl = args[++index] ?? "";
    else if (flag === "--allow-http-loopback") allowHttpLoopback = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!baseUrl) {
    throw new Error(
      "--base-url or RELEASE_URL is required (for example https://snippets.example.com).",
    );
  }
  const url = new URL(baseUrl);
  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (
    url.protocol !== "https:" &&
    !(allowHttpLoopback && url.protocol === "http:" && isLoopback)
  ) {
    throw new Error("Release smoke tests require an HTTPS base URL.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return { baseUrl: url };
}

async function request(
  baseUrl: URL,
  pathname: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(new URL(pathname, baseUrl), {
    redirect: "manual",
    ...init,
  });
  console.log(`${init?.method ?? "GET"} ${pathname} -> ${response.status}`);
  return response;
}

function assertStatus(response: Response, expected: number, label: string) {
  if (response.status !== expected) {
    throw new Error(
      `${label}: expected ${expected}, received ${response.status}`,
    );
  }
}

function assertSecurityHeaders(response: Response) {
  const expected = {
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
  } as const;
  for (const [name, value] of Object.entries(expected)) {
    if (response.headers.get(name) !== value) {
      throw new Error(
        `Security header mismatch for ${name}: ${response.headers.get(name) ?? "missing"}`,
      );
    }
  }
}

function snippetPaths(html: string, localeSegment: string): string[] {
  const pattern = new RegExp(
    `href="(/${localeSegment}/snippets/[^"?#/]+)"`,
    "g",
  );
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

function artifactPath(html: string): string | null {
  return (
    /(?:https?:\/\/[^"'&< ]+)?(\/artifacts\/sb3\/[a-f0-9]{64}\.sb3)/.exec(
      html,
    )?.[1] ?? null
  );
}

async function main() {
  const { baseUrl } = parseOptions(process.argv.slice(2));
  const root = await request(baseUrl, "/");
  if (root.status < 300 || root.status >= 400) {
    throw new Error(`Root redirect: expected 3xx, received ${root.status}`);
  }
  assertSecurityHeaders(root);
  const location = root.headers.get("location");
  if (!location) throw new Error("Root redirect is missing Location.");
  const localePath = new URL(location, baseUrl).pathname;
  const localeSegment = localePath.split("/")[1];
  if (!localeSegment) throw new Error(`Invalid locale redirect: ${location}`);

  const home = await request(baseUrl, `/${localeSegment}`);
  assertStatus(home, 200, "Locale home");
  assertSecurityHeaders(home);
  if (!home.headers.get("content-type")?.includes("text/html")) {
    throw new Error("Locale home did not return HTML.");
  }

  const listing = await request(baseUrl, `/${localeSegment}/snippets`);
  assertStatus(listing, 200, "Snippet listing");
  assertSecurityHeaders(listing);
  const listingHtml = await listing.text();
  const paths = [...new Set(snippetPaths(listingHtml, localeSegment))];
  if (!paths.length)
    throw new Error("Snippet listing contains no detail links.");

  const search = await request(baseUrl, `/${localeSegment}/search?q=move`);
  assertStatus(search, 200, "Search");
  assertSecurityHeaders(search);

  const missing = await request(
    baseUrl,
    `/${localeSegment}/snippets/release-smoke-missing`,
  );
  assertStatus(missing, 404, "Missing snippet");
  assertSecurityHeaders(missing);

  let demoPath: string | null = null;
  for (const path of paths.slice(0, 12)) {
    const detail = await request(baseUrl, path);
    assertStatus(detail, 200, `Snippet detail ${path}`);
    assertSecurityHeaders(detail);
    demoPath = artifactPath(await detail.text());
    if (demoPath) break;
  }
  if (!demoPath) {
    throw new Error("No SB3 demo was found in the first 12 snippet details.");
  }

  const head = await request(baseUrl, demoPath, {
    method: "HEAD",
    headers: { Origin: "https://turbowarp.org" },
  });
  assertStatus(head, 200, "SB3 HEAD");
  assertSecurityHeaders(head);
  if (head.headers.get("accept-ranges") !== "bytes") {
    throw new Error("SB3 HEAD is missing Accept-Ranges: bytes.");
  }
  if (
    head.headers.get("access-control-allow-origin") !== "https://turbowarp.org"
  ) {
    throw new Error("SB3 HEAD is missing the TurboWarp CORS origin.");
  }

  const range = await request(baseUrl, demoPath, {
    headers: {
      Origin: "https://turbowarp.org",
      Range: "bytes=0-0",
    },
  });
  assertStatus(range, 206, "SB3 range");
  assertSecurityHeaders(range);
  if (!range.headers.get("content-range")?.startsWith("bytes 0-0/")) {
    throw new Error(
      `Unexpected Content-Range: ${range.headers.get("content-range")}`,
    );
  }
  if ((await range.arrayBuffer()).byteLength !== 1) {
    throw new Error("SB3 range response did not contain exactly one byte.");
  }

  console.log(`Release smoke tests passed for ${baseUrl.origin}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
