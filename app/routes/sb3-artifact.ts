import type { Route } from "./+types/sb3-artifact";
import {
  sb3MethodNotAllowedResponse,
  sb3PreflightResponse,
  serveSb3Artifact,
} from "../http/sb3-artifact.server";
import { platformContext } from "../platform/context";

export function loader({ context, params, request }: Route.LoaderArgs) {
  const { env } = context.get(platformContext);
  return serveSb3Artifact(request, env.ARTIFACTS, params["*"]);
}

export function action({ params, request }: Route.ActionArgs) {
  return request.method === "OPTIONS"
    ? sb3PreflightResponse(params["*"])
    : sb3MethodNotAllowedResponse();
}
