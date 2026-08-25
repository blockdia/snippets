import { redirect } from "react-router";

import type { Route } from "./+types/root-redirect";
import { negotiateLocale, toLocaleSegment } from "../i18n/locales";

export function loader({ request }: Route.LoaderArgs) {
  const locale = negotiateLocale(request.headers.get("Accept-Language"));
  throw redirect(`/${toLocaleSegment(locale)}`, {
    headers: { Vary: "Accept-Language" },
  });
}

export default function RootRedirect() {
  return null;
}
