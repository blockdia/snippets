const SB3_CONTENT_TYPE = "application/x.scratch.sb3";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const TURBOWARP_ORIGIN = "https://turbowarp.org";
const SB3_FILENAME_PATTERN = /^([a-f0-9]{64})\.sb3$/;

interface ByteRange {
  end: number;
  length: number;
  offset: number;
}

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Headers":
      "Range, If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Origin": TURBOWARP_ORIGIN,
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified",
    "Access-Control-Max-Age": "86400",
  });
}

function errorResponse(message: string, status: number, headers?: HeadersInit) {
  const responseHeaders = corsHeaders();
  for (const [name, value] of new Headers(headers)) {
    responseHeaders.set(name, value);
  }
  return new Response(message, { status, headers: responseHeaders });
}

function objectKey(filename: string | undefined): string | null {
  const match = filename ? SB3_FILENAME_PATTERN.exec(filename) : null;
  return match ? `sb3/${match[1]}.sb3` : null;
}

function parseRange(value: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return null;

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    const length = Math.min(suffix, size);
    const offset = size - length;
    return { offset, length, end: size - 1 };
  }

  const offset = Number(match[1]);
  if (!Number.isSafeInteger(offset) || offset >= size) return null;
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < offset) return null;
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1, end };
}

function responseHeaders(object: R2Object, contentLength?: number): Headers {
  const headers = corsHeaders();
  object.writeHttpMetadata(headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", IMMUTABLE_CACHE_CONTROL);
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType ?? SB3_CONTENT_TYPE,
  );
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", object.uploaded.toUTCString());
  if (contentLength !== undefined) {
    headers.set("Content-Length", String(contentLength));
  }
  return headers;
}

function preconditionStatus(request: Request): 304 | 412 {
  return request.headers.has("If-None-Match") ||
    request.headers.has("If-Modified-Since")
    ? 304
    : 412;
}

export function sb3PreflightResponse(filename: string | undefined): Response {
  if (!objectKey(filename)) return errorResponse("Invalid SB3 path", 400);
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function sb3MethodNotAllowedResponse(): Response {
  return errorResponse("Method Not Allowed", 405, {
    Allow: "GET, HEAD, OPTIONS",
  });
}

export async function serveSb3Artifact(
  request: Request,
  bucket: R2Bucket,
  filename: string | undefined,
): Promise<Response> {
  const key = objectKey(filename);
  if (!key) return errorResponse("Invalid SB3 path", 400);

  const rangeHeader = request.headers.get("Range");
  let range: ByteRange | null = null;
  let knownObject: R2Object | null = null;

  if (rangeHeader) {
    knownObject = await bucket.head(key);
    if (!knownObject) return errorResponse("SB3 artifact not found", 404);
    range = parseRange(rangeHeader, knownObject.size);
    if (!range) {
      return errorResponse("Range Not Satisfiable", 416, {
        "Content-Range": `bytes */${knownObject.size}`,
      });
    }
  }

  const object = await bucket.get(key, {
    onlyIf: request.headers,
    ...(range ? { range: { offset: range.offset, length: range.length } } : {}),
  });
  if (!object) return errorResponse("SB3 artifact not found", 404);

  if (!("body" in object)) {
    return new Response(null, {
      status: preconditionStatus(request),
      headers: responseHeaders(object),
    });
  }

  const headers = responseHeaders(object, range?.length ?? object.size);
  if (range) {
    headers.set(
      "Content-Range",
      `bytes ${range.offset}-${range.end}/${knownObject?.size ?? object.size}`,
    );
  }

  return new Response(request.method === "HEAD" ? null : object.body, {
    status: range ? 206 : 200,
    headers,
  });
}
