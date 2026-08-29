import { redirect } from "react-router";

import type { Route } from "./+types/search";
import { toLocaleSegment } from "../i18n/locales";
import {
  parseSnippetSearchParameters,
  snippetSearchHref,
} from "../search/params";
import { requireRouteLocale } from "../routing/locale.server";

export function loader({ params, request }: Route.LoaderArgs) {
  const locale = requireRouteLocale(params.locale);
  const url = new URL(request.url);
  const localeSegment = toLocaleSegment(locale);
  const searchParameters = parseSnippetSearchParameters(url.searchParams);

  throw redirect(snippetSearchHref(localeSegment, searchParameters), 308);
}
