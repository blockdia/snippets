import { describe, expect, it } from "vitest";

import { withSecurityHeaders } from "../app/http/security";

describe("global security headers", () => {
  it("adds baseline headers without consuming the streamed body", async () => {
    const source = new Response("streamed", {
      headers: { "Cache-Control": "public, max-age=60" },
      status: 206,
      statusText: "Partial Content",
    });

    const response = withSecurityHeaders(source);

    expect(response.status).toBe(206);
    expect(response.statusText).toBe("Partial Content");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(await response.text()).toBe("streamed");
  });
});
