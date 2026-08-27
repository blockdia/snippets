import { createRequestHandler, RouterContextProvider } from "react-router";

import { createDatabase } from "../app/db/client";
import { withSecurityHeaders } from "../app/http/security";
import { platformContext } from "../app/platform/context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    const context = new RouterContextProvider();

    context.set(platformContext, {
      db: createDatabase(env.DB),
      env,
    });

    const response = await requestHandler(request, context);
    return withSecurityHeaders(response);
  },
} satisfies ExportedHandler<Env>;
