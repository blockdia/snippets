import { createContext } from "react-router";

export type AdminCapability =
  | "dashboard:read"
  | "snippets:read"
  | "snippets:write"
  | "snippets:publish"
  | "snippets:archive"
  | "tags:manage";

export interface AdminActor {
  id: string;
  email: string;
  displayName: string;
  role: "owner";
  capabilities: readonly AdminCapability[];
}

export const OWNER_CAPABILITIES = [
  "dashboard:read",
  "snippets:read",
  "snippets:write",
  "snippets:publish",
  "snippets:archive",
  "tags:manage",
] as const satisfies readonly AdminCapability[];

export const adminActorContext = createContext<AdminActor>();

export function can(actor: AdminActor, capability: AdminCapability): boolean {
  return actor.capabilities.includes(capability);
}

export function requireCapability(
  actor: AdminActor,
  capability: AdminCapability,
): void {
  if (!can(actor, capability)) {
    throw new Response("Forbidden", { status: 403 });
  }
}
