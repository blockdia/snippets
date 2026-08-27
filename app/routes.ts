import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("sitemap.xml", "routes/sitemap.ts"),
  route("artifacts/sb3/*", "routes/sb3-artifact.ts"),
  index("routes/root-redirect.tsx"),
  route(":locale", "routes/locale-layout.tsx", [
    index("routes/locale-home.tsx"),
    route("snippets", "routes/snippets-index.tsx"),
    route("snippets/:slug", "routes/snippet-detail.tsx"),
    route("search", "routes/search.tsx"),
  ]),
] satisfies RouteConfig;
