const QUERY_MAX_LENGTH = 200;
const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface SnippetSearchParameters {
  query: string;
  tag: string;
  page: number;
}

export function parseSnippetSearchParameters(
  searchParams: URLSearchParams,
): SnippetSearchParameters {
  const query = (searchParams.get("q") ?? "").trim().slice(0, QUERY_MAX_LENGTH);
  const rawTag = searchParams.get("tag") ?? "";
  const rawPage = Number(searchParams.get("page") ?? "1");

  return {
    query,
    tag: TAG_PATTERN.test(rawTag) ? rawTag : "",
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

export function snippetSearchHref(
  localeSegment: string,
  { query, tag, page }: SnippetSearchParameters,
): string {
  const searchParams = new URLSearchParams();
  if (query) searchParams.set("q", query);
  if (tag) searchParams.set("tag", tag);
  if (page > 1) searchParams.set("page", String(page));
  const search = searchParams.toString();
  return `/${localeSegment}/snippets${search ? `?${search}` : ""}`;
}
