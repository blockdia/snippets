import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("sitemap.xml", "routes/sitemap.ts"),
  route("artifacts/sb3/*", "routes/sb3-artifact.ts"),
  route("admin", "routes/admin-layout.tsx", [
    index("routes/admin-dashboard.tsx"),
    route("snippets", "routes/admin-snippets-index.tsx"),
    route("snippets/new", "routes/admin-snippet-new.tsx"),
    route("snippets/:snippetId", "routes/admin-snippet-editor.tsx"),
    route("tags", "routes/admin-tags.tsx"),
  ]),
  index("routes/root-redirect.tsx"),
  route(":locale", "routes/locale-layout.tsx", [
    index("routes/locale-home.tsx"),
    route("snippets", "routes/snippets-index.tsx"),
    route("snippets/:slug", "routes/snippet-detail.tsx"),
    route("search", "routes/search.tsx"),
  ]),
] satisfies RouteConfig;
