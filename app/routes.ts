import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/root-redirect.tsx"),
  route(":locale", "routes/locale-layout.tsx", [
    index("routes/locale-home.tsx"),
    route("snippets", "routes/snippets-index.tsx"),
    route("snippets/:slug", "routes/snippet-detail.tsx"),
  ]),
] satisfies RouteConfig;
