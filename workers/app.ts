import { createRequestHandler, RouterContextProvider } from "react-router";

import { createDatabase } from "../app/db/client";
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

    return requestHandler(request, context);
  },
} satisfies ExportedHandler<Env>;
