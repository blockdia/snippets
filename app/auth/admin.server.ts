import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { OWNER_CAPABILITIES, type AdminActor } from "./admin";

const ACCESS_HEADER = "cf-access-jwt-assertion";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class AdminAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthenticationError";
  }
}

interface AccessConfiguration {
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
}

function configuredAccessValue(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.includes("replace-me")) {
    throw new AdminAuthenticationError(`${name} is not configured`);
  }
  return normalized;
}

function claimString(payload: JWTPayload, key: "sub" | "email" | "name") {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function localDevelopmentActor(): AdminActor {
  return {
    id: "development:owner",
    email: "owner@localhost",
    displayName: "本地管理员",
    role: "owner",
    capabilities: OWNER_CAPABILITIES,
  };
}

export async function authenticateAdminRequest(
  request: Request,
  env: AccessConfiguration,
  options: { allowLocalDevelopment: boolean },
): Promise<AdminActor> {
  const url = new URL(request.url);
  if (options.allowLocalDevelopment && LOCAL_HOSTS.has(url.hostname)) {
    return localDevelopmentActor();
  }

  const issuer = configuredAccessValue(
    env.ACCESS_TEAM_DOMAIN,
    "ACCESS_TEAM_DOMAIN",
  ).replace(/\/$/, "");
  const audience = configuredAccessValue(env.ACCESS_AUD, "ACCESS_AUD");
  const token = request.headers.get(ACCESS_HEADER);
  if (!token) {
    throw new AdminAuthenticationError("Cloudflare Access JWT is missing");
  }

  try {
    const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
      audience,
      issuer,
    });
    const subject = claimString(payload, "sub");
    const email = claimString(payload, "email");
    if (!subject || !email) {
      throw new AdminAuthenticationError(
        "Cloudflare Access JWT is missing identity claims",
      );
    }

    return {
      id: `access:${subject}`,
      email,
      displayName: claimString(payload, "name") ?? email,
      role: "owner",
      capabilities: OWNER_CAPABILITIES,
    };
  } catch (error) {
    if (error instanceof AdminAuthenticationError) throw error;
    throw new AdminAuthenticationError("Cloudflare Access JWT is invalid");
  }
}

export function requireSameOriginMutation(request: Request): void {
  if (request.method.toUpperCase() === "GET") return;
  const origin = request.headers.get("Origin");
  const requestOrigin = new URL(request.url).origin;
  if (!origin || origin !== requestOrigin) {
    throw new Response("Invalid request origin", { status: 403 });
  }
}

export function adminResponseHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
}
