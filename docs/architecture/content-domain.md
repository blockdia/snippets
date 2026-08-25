# Content domain

## Identity and revision boundaries

`snippets` owns the stable identity and shared slug. It deliberately has no
locale preference or `default_locale`. `snippet_revisions` contains immutable
language-independent versions; `snippet_publications` selects the current public
revision without rewriting historical rows.

`snippet_localizations` owns the stable `(snippet_id, locale)` identity. Its
immutable content versions live in `snippet_localization_revisions`, while
`snippet_localization_publications` selects the current published translation.
Locale values reference the canonical BCP 47 registry in `locales`. English is
the application-wide fallback, not per-snippet data.

## Revision-owned data

A snippet revision owns:

- ordered, stable-keyed scripts and their representation metadata;
- stable-keyed translation units for script titles, symbols, procedures,
  comments, and reference labels;
- language-independent symbol shape and scope;
- external reference URLs and types;
- revision-aware tags, contributors, and artifacts.

A localization revision owns translated prose, keywords, optional localized
script overrides, translated units, and translator attribution. Published child
rows are protected by D1 triggers; changes require a new revision.

## Translation basis

`translation-basis-v1` hashes canonical JSON containing only representation
identity, stable-keyed source scripts, and stable-keyed translation units.
Arrays are sorted by stable key, line endings and Unicode are normalized, and
duplicate keys are rejected. Tags, licenses, artifacts, attribution, timestamps,
and editorial metadata do not affect translation compatibility.

Publishing a code revision recomputes the basis from D1 before trusting the
stored hash. The revision must have a compatible English localization. Existing
published localizations with the same basis remain active across code revisions;
incompatible ones stay in history but are excluded from reads and search.

## Publication and D1 atomicity

D1 does not support SQL `BEGIN` from application queries. Publication therefore
uses this sequence:

1. Read and validate ownership, state, locale, current revision, and basis.
2. Precompute all basis-compatible search documents.
3. Submit status changes, publication-pointer upserts, stale document deletion,
   and new search documents in one ordered `D1Database.batch()` through Drizzle.

D1 executes the batch atomically. Database triggers independently prevent
publication pointers from targeting drafts and prevent search documents from
targeting inactive or basis-incompatible publications.

## FTS5

`search_documents` holds one active row per `(snippet_id, locale)`. The external
content table `snippet_search_fts` indexes title, summary, body, keywords, and
resolved scripts; insert/update/delete triggers keep it synchronized.

The search query implemented in the search phase must choose one eligible
document per snippet before applying FTS: requested locale first, English only
when that locale is unavailable. This preserves snippet-level deduplication and
prevents English from competing with a target-language result.
