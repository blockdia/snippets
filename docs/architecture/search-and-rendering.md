# Search and scratchblocks rendering

## Scratchblocks progressive enhancement

Snippet loaders return versioned scratchblocks source from D1. SSR always emits
that source as readable code, so content remains accessible before JavaScript or
when visual rendering fails. A focused React component enhances each script in
the browser with `scratchblocks-plus`.

The renderer dynamically loads the library and only the supported Chinese
language data when needed. It reparses the immutable source whenever the user
changes the render style or target block language. Style preference is stored
locally; content state and localization revisions are never mutated.

The enhancement provides Scratch 2, Scratch 3, high-contrast, and outline
styles; English, Simplified Chinese, and Traditional Chinese block translation;
source copying; and SVG/PNG export. A future block representation can render
through a different component because selection is based on the revision's
representation discriminator.

## Snippet-description Markdown

`body_markdown` is rendered as GitHub-flavored Markdown on the snippet detail
route with `react-markdown` and `remark-gfm`, producing React elements directly
instead of injecting an HTML string. Raw HTML is escaped, and unsafe link
protocols are removed. A small Remark plugin also preserves the legacy project's
Scratch-specific authoring syntax:

- `<scratchblocks>...</scratchblocks>` renders a multi-line script with copy and
  image-export actions.
- `<sb>...</sb>` renders an inline block.
- `<go-to-block script-id:block-path>...</go-to-block>` scrolls to and highlights
  a block in the matching main script.

The server response contains readable Scratch source as a fallback. Browser-side
enhancement uses the same style and translation preferences as main scripts.

## Search document lifecycle

Publication services rebuild `search_documents` in the same D1 batch as the
publication pointer. Triggers keep the external-content `snippet_search_fts`
table synchronized. Documents include localized title, summary, body, keywords,
and resolved script source.

The `unicode61` tokenizer does not provide arbitrary Chinese substring matches.
At publication time the application therefore appends unique CJK characters and
overlapping bigrams to the keyword field. Query normalization uses the same
bigram contract and quotes all FTS terms, preventing user input from becoming
FTS query syntax. Latin terms use prefix matching.

## Eligible-document-first query

Before applying FTS, a CTE selects at most one document for each snippet:

1. the requested canonical locale, when published and basis-compatible;
2. otherwise the platform-wide English document.

The FTS table joins only this eligible set, so target and fallback documents do
not compete for rank and pagination never sees duplicate snippets. Results use
weighted BM25 ranking across title, summary, body, keywords, and script source.
An optional tag filter is joined through the current snippet publication, not a
historical revision.

D1/SQLite does not allow the FTS5 `bm25()` auxiliary function in the same query
context as a window count. The repository runs the ranked page query and its
matching count query in parallel. Both reuse the identical eligible-document
and tag predicates.

## Search route

`/:locale/search` uses a GET form with shareable `q`, `tag`, and `page`
parameters. Its loader performs all D1 work for initial SSR and client
navigations. React Router pending state dims stale results and disables the
submit button while the next loader response is in flight. Canonical metadata
preserves normalized filters and pagination.
