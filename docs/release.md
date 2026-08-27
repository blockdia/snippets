# Production release

Production releases are intentionally gated. The repository keeps an all-zero
D1 id for local development, while `npm run deploy` refuses to publish until a
real database id, authenticated account, migrated schema, imported content, and
R2 bucket are all verified.

## 1. Authenticate and provision once

Use an interactive login on a developer machine, or provide a scoped
`CLOUDFLARE_API_TOKEN` in CI. Do not commit the token.

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 create snippets
npx wrangler r2 bucket create snippets-artifacts
```

Copy the D1 UUID printed by `wrangler d1 create` into `database_id` in
`wrangler.jsonc`. The UUID is a resource identifier, not a secret. Keep the R2
bucket private; SB3 files are exposed only through the same-origin Worker route.

Run the local quality gate and the non-mutating config guard:

```sh
npm run check
npm run release:config
```

## 2. Back up, migrate, and import

For an existing production database, export it before applying migrations.
The Worker rollback command does not roll back D1 schema or content.

```sh
npx wrangler d1 export snippets --remote --output /tmp/snippets-before-release.sql
npm run db:migrate:remote
npm run import:legacy -- \
  --source /absolute/path/to/scratch-modules-gallery \
  --apply-remote
```

The importer uploads content-addressed SB3 objects first, applies D1 content in
a transaction, and then verifies imported counts. It is idempotent, but the
source path and diagnostics should still be reviewed before every remote run.

## 3. Verify and deploy

The remote gate is read-only. It confirms authentication, the configured D1
and R2 resources, no pending migrations, and non-empty publications, search
documents, and artifacts.

```sh
npm run release:remote-check
npm run deploy
```

`npm run deploy` runs the same remote gate automatically. Avoid calling
`wrangler deploy` directly because that bypasses the repository guard.

Record the Worker version printed by Wrangler, then run content-level smoke
tests against the HTTPS deployment:

```sh
npm run release:smoke -- --base-url https://your-production-host.example
```

The smoke test checks locale negotiation, home/list/search/detail/404 pages,
baseline security headers, at least one published snippet, and an SB3 demo with
TurboWarp CORS plus a one-byte range response.

## 4. Observe and roll back

Watch errors immediately after release:

```sh
npx wrangler tail snippets --status error
npx wrangler deployments list
```

If the Worker code is unhealthy, roll back to the recorded version:

```sh
npx wrangler rollback VERSION_ID --message "Rollback failed release"
```

If a migration or import caused the failure, stop traffic-changing work and
restore D1 deliberately from the pre-release export. Do not assume a Worker
rollback restores storage.

## Release checklist

- `main` is clean and synchronized with the intended release commit.
- `npm run check` passes on that commit.
- Production dependency audit has no unresolved high or critical advisory.
- D1 export is stored outside the repository.
- `npm run release:remote-check` passes.
- The deployment version id is recorded.
- `npm run release:smoke` passes on the real HTTPS host.
- Workers Logs show no new errors during the observation window.
