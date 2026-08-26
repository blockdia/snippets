# Legacy content importer

Phase 4 migrates the current `scratch-modules-gallery` content snapshot into D1.
The old repository remains read-only import input and is never used as a runtime
CMS. Git history is deliberately outside the import boundary.

## Input and normalization

The filesystem adapter reads each `content/modules/<id>` directory:

- `meta.json` for English source metadata, tags, contributors, variables, and
  references;
- ordered `scripts/*.txt` Scratchblocks sources;
- `i18n/<locale>.json` and `notes/<locale>.md` localizations;
- optional `demo.sb3` artifacts;
- global `src/i18n/tags.json` and `module-defaults.json` values.

Hidden module directories such as `.test` are excluded. Locale filenames are
canonicalized internally to the supported BCP 47 tags `en`, `zh-CN`, and
`zh-TW`. English is always created as the content fallback; there is no
per-snippet default locale.

Legacy `!import module[:index]` directives are resolved recursively and emitted
as explicit leading scripts with dependency metadata. Missing modules, invalid
indices, cycles, malformed metadata, duplicate identities, invalid references,
and unsupported locales produce structured diagnostics. A plan containing an
error cannot generate or apply SQL.

## Identity and revision behavior

`legacy-snippet-<legacy-id>` is the stable snippet identity. Content revisions,
localization revisions, child rows, contributors, and artifacts receive
deterministic IDs derived from normalized content hashes. Re-importing the same
snapshot is therefore idempotent. A changed snapshot creates a new revision and
advances its publication pointer without rewriting an immutable published row.

The translation basis contains Scratchblocks source and language-neutral source
translation units such as script titles, symbols, and reference titles. It does
not contain translated strings, tags, artifacts, or other presentation-neutral
revision data. Consequently:

- changing source code or a source translation unit changes the basis hash;
- changing only tags, references, or an artifact can publish a new content
  revision while reusing compatible localization revisions;
- changing one translated string creates a revision only for the affected
  localization and does not invalidate the other locales.

Legacy localized Scratchblocks are materialized as localization script
overrides. The first version continues to store Scratchblocks strings while the
revision schema retains representation/version fields for a future block
representation migration.

## Attribution, licenses, and artifacts

Legacy contributor identifiers are normalized into contributor records and
attached to imported source and localization revisions. Each row retains a
legacy source reference and the snapshot fingerprint. Imported Scratch code is
recorded as CC0 1.0, prose as CC BY-SA 4.0, and `.sb3` examples as CC BY 4.0.

`.sb3` files use immutable, globally content-addressed R2 keys under
`sb3/<full-sha256>.sb3`. The bucket stays private; published demos are streamed
through `/artifacts/sb3/<full-sha256>.sb3` by the Worker with immutable cache,
range, conditional-request, and TurboWarp CORS headers. A failed D1 import can
leave an unreferenced content-addressed R2 object, but cannot overwrite a
different artifact.

## CLI workflow

Dry-run is the default and does not mutate either repository or D1:

```sh
npm run import:legacy -- \
  --source /path/to/scratch-modules-gallery \
  --dry-run
```

Use `--json` for machine-readable diagnostics or `--emit-sql <path>` to inspect
the generated SQL. Applying is always explicit:

```sh
npm run db:migrate:local
npm run import:legacy -- --source /path/to/legacy --apply-local

npm run db:migrate:remote
npm run import:legacy -- --source /path/to/legacy --apply-remote
```

`LEGACY_PROJECT` can replace `--source`; `--database` selects a non-default D1
binding/name, and `--r2-bucket` selects a non-default artifact bucket.
`--persist-to <path>` isolates both local D1 and local R2 state for testing.
Apply mode uploads every artifact to R2 before executing the generated D1 SQL,
so an upload failure cannot create a dangling database reference. It then runs
an imported-count verification query. The runtime helper uses one D1 `batch()`
call and performs the same post-import verification, which is exercised against
real D1 in the Cloudflare test runtime.

The previous static-artifact format is deliberately unsupported. Existing
local Wrangler state must be discarded and imported again. Before a remote
apply, create the private bucket once with
`wrangler r2 bucket create snippets-artifacts`.
