# Scratch Snippets

An international, server-rendered library of reusable Scratch code patterns.
This repository is a clean implementation; the legacy SSG project is used only
as product and import reference.

## Stack

- Cloudflare Workers, Workers Static Assets, and private R2 artifact storage
- Cloudflare Vite Plugin
- React Router v8 SSR and React 19
- TypeScript
- Cloudflare D1 with Drizzle ORM and FTS5

The target architecture and phased implementation plan are documented in
[`PLAN.md`](./PLAN.md).
The guarded production procedure and rollback checklist are documented in
[`docs/release.md`](./docs/release.md).

The D1 entities and publication invariants are documented in
[`docs/architecture/content-domain.md`](./docs/architecture/content-domain.md).
Locale routing, SSR page behavior, and fallback rules are documented in
[`docs/architecture/ssr-routing.md`](./docs/architecture/ssr-routing.md).
Scratchblocks enhancement and D1 FTS5 search are documented in
[`docs/architecture/search-and-rendering.md`](./docs/architecture/search-and-rendering.md).
The legacy snapshot importer, deterministic revision rules, and CLI are
documented in
[`docs/architecture/legacy-importer.md`](./docs/architecture/legacy-importer.md).

## Local development

Install dependencies and start the local Worker:

```sh
npm install
npm run dev
```

The app is served at `http://localhost:5173` with a local D1 binding. The
all-zero database id in `wrangler.jsonc` is intentionally local-only; replace it
when a real Cloudflare D1 database is provisioned.

Legacy `.sb3` demos live in the local `snippets-artifacts` R2 binding rather
than `public/`. Initialize both stores and import the legacy snapshot before
testing demo pages:

```sh
npm run db:migrate:local
npm run import:legacy -- \
  --source /path/to/scratch-modules-gallery \
  --apply-local
```

The former static-artifact implementation is intentionally incompatible. When
upgrading an existing checkout, remove `.wrangler/state`, apply the migrations,
and import again instead of reusing old local D1 rows.

## Quality checks

```sh
npm run check
```

Individual commands are available for formatting, linting, type generation,
Cloudflare-runtime tests, production builds, and deployment dry-runs.

## Database workflow

Drizzle table definitions live under `app/db`. Once schema changes are ready:

```sh
npm run db:generate
npm run db:migrate:local
```

Review generated SQL before applying it. Remote migrations are always explicit:

```sh
npm run db:migrate:remote
```

Import legacy content with a read-only dry-run first:

```sh
npm run import:legacy -- --source /path/to/scratch-modules-gallery --dry-run
```

See the importer architecture document before using `--apply-local` or the
explicit `--apply-remote` mode.

## Deployment

Build and inspect the Worker package without publishing:

```sh
npm run build
npm run deploy:dry-run
```

`npm run deploy` performs a real Cloudflare deployment and should only be used
after configuring the target account and real D1 database id. It runs a remote
release gate first and refuses to deploy when resources, migrations, or imported
content are not ready. Do not bypass the gate with a direct `wrangler deploy`.

Create the private artifact bucket once before the first remote import or
deployment:

```sh
npx wrangler r2 bucket create snippets-artifacts
npm run db:migrate:remote
npm run import:legacy -- \
  --source /path/to/scratch-modules-gallery \
  --apply-remote
```

After provisioning and importing, follow the complete release runbook:

```sh
npm run release:remote-check
npm run deploy
npm run release:smoke -- --base-url https://your-production-host.example
```

## Licensing

Application source is AGPL-3.0-only. Explanations, Scratch code, and `.sb3`
artifacts have separate content licenses described in
[`CONTENT-LICENSES.md`](./CONTENT-LICENSES.md).
