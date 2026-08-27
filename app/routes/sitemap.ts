import type { Route } from "./+types/sitemap";
import { sitemapResponse } from "../http/sitemap.server";
import { platformContext } from "../platform/context";
import { listSitemapSnippets } from "../services/snippets.server";

export async function loader({ context, request }: Route.LoaderArgs) {
  const { db } = context.get(platformContext);
  const snippets = await listSitemapSnippets(db);
  return sitemapResponse(request, snippets);
}
