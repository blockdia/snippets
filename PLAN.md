# Scratch Snippets implementation plan

## Architecture decisions

- Runtime: one Cloudflare Worker, Workers Static Assets, Cloudflare Vite Plugin,
  React Router v8 SSR, TypeScript, and one D1 database.
- D1 is the runtime content source. The legacy repository is import input only;
  Markdown and GitHub are not the runtime CMS.
- Public URLs use lowercase locale segments such as `/en/snippets/foo` and
  `/zh-cn/snippets/foo`. Internal and persisted locale values use canonical BCP
  47 (`en`, `zh-CN`, `zh-TW`). URL conversion happens only at the routing edge.
- English (`en`) is the single platform-wide content fallback. A snippet has a
  shared slug and no `default_locale` field.
- UI messages and localized content use separate stores and revision lifecycles.
- Snippets have stable identities. Code revisions and localization revisions are
  independent, immutable records with draft/published states.
- Scratch code starts as versioned `scratchblocks` strings behind a
  representation discriminator so a future block AST can coexist or replace it.
- R2 is deferred. Existing small `.sb3` examples can ship as static assets until
  artifact scale or upload requirements justify object storage.

## Translation compatibility

Localization validity is not tied directly to an arbitrary code revision id.
Each snippet revision has a versioned `translation_basis_hash`, computed from a
canonical serialization of only translation-sensitive fields: stable-keyed
script source, translatable symbol/custom-block surfaces, comments, and
reference labels. Input ordering, tags, licenses, artifact metadata, timestamps,
and other language-independent edits are excluded.

Each localization revision records the basis hash it targets, plus an optional
source revision id for provenance. When a new code revision is published:

1. If its basis hash is unchanged, compatible published localizations remain
   valid.
2. If the basis hash changes, incompatible localizations are not served; the
   page falls back to the compatible English localization and shows a translation
   prompt.
3. Hashes are prefixed with an algorithm version, for example
   `translation-basis-v1:<sha256>`, so the canonicalization contract can evolve.

## Locale-aware FTS5 search

`search_documents` contains at most one active document per snippet and locale,
while an external-content FTS5 table indexes its searchable text. Search does
not query every translation and deduplicate afterward. It first chooses exactly
one eligible document per snippet: the requested locale when present, otherwise
English. FTS5 is then applied only to that eligible set. This guarantees:

- one result row per snippet;
- requested-locale content always wins;
- English participates only when the requested localization is unavailable,
  rather than competing on ranking;
- `bm25` ranking and pagination operate on already-deduplicated snippets.

## Domain model outline

- `snippets`: stable id, shared slug, lifecycle status, timestamps.
- `snippet_revisions`: immutable language-independent versions, representation
  version, translation basis hash, authorship/license/provenance, publication.
- `snippet_localizations`: stable `(snippet_id, locale)` identity.
- `snippet_localization_revisions`: immutable title/summary/body and translated
  Scratch surfaces, target basis hash, status, provenance, publication.
- `snippet_revision_scripts` and localization script rows: stable keys preserve
  correspondence between source and translated scratchblocks.
- `tags` plus localized tag labels; snippet/tag links are revision-aware where
  editorial history requires it.
- `artifacts`: static or future R2-backed `.sb3` metadata with independent
  license, integrity hash, and storage discriminator.
- `search_documents` plus FTS5 virtual table/triggers: only published,
  basis-compatible content is indexed.

Future users, moderation, reactions, comments, collections, and API consumers
reference stable snippet/localization/revision identities; they are not part of
the initial implementation.

## Phases

### Phase 0 — foundation

- [x] Scaffold a fresh React Router v8 SSR project with the Cloudflare Vite
      Plugin; do not modify the legacy project.
- [x] Configure one Worker, local D1 binding, Drizzle entry point, generated
      Worker types, Vitest, ESLint, Prettier, and dry-run deployment checks.
- [x] Establish canonical locale helpers and the global English fallback.
- [x] Record source and content licensing boundaries.
- [ ] Provision the real remote D1 id only when a Cloudflare environment is
      selected; local development uses the placeholder binding meanwhile.

### Phase 1 — content domain and migrations

- [x] Define Drizzle tables, constraints, indexes, FTS5 SQL, publication
      invariants, and the versioned translation-basis canonicalizer.
- [x] Generate and inspect the initial D1 migration; test migrations and
      repository queries against isolated local D1.
- [x] Implement services for published snippet resolution, locale fallback,
      atomic D1 batch publication, search-document rebuilding, and basis
      compatibility.

### Phase 2 — SSR product surface

- [x] Add locale-prefix routing, `Accept-Language` negotiation, canonical locale
      redirects, and canonical BCP 47 document language values.
- [x] Implement the SSR home, snippet index, snippet detail,
      not-found/translation-fallback states, cache headers, SEO metadata, and
      localized UI messages.
- [x] Resolve listing cards with one row per snippet, requested-locale priority,
      and English-only fallback.
- [x] Port the useful visual language into an accessible responsive shell
      without carrying over the legacy SSG structure.

### Phase 3 — scratchblocks and search

- [x] Port scratchblocks rendering, supported-language translation, persistent
      style preferences, copy, SVG/PNG export, and necessary styles as an
      isolated client enhancement over SSR source code.
- [x] Implement FTS5 indexing and eligible-document-first search with weighted
      BM25 ranking, CJK search terms, topic filtering, pagination, and localized
      SSR search pages.
- [x] Add regressions proving one row per snippet, requested-locale priority,
      English-only fallback, CJK substring matching, and current-revision tag
      filtering.

### Phase 4 — legacy importer

- [x] Parse the current legacy content snapshot, validate cross-file references,
      normalize locales to BCP 47, calculate basis hashes, and emit
      deterministic ids/revisions.
- [x] Provide dry-run diagnostics, transactional D1 import, idempotency,
      attribution, license preservation, content-addressed `.sb3` migration,
      and imported-count verification. Git history is not imported.

### Phase 5 — hardening and release

- Accessibility, caching, security headers, structured data, observability,
  performance budgets, production D1 provisioning, deployment runbook, and
  content-level smoke tests.
