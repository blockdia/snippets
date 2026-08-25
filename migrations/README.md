# D1 migrations

Drizzle-generated SQL migrations live here. The initial phase 1 domain schema is
captured by `0000_dear_shadowcat.sql`. Always inspect generated SQL before
applying it.

Drizzle owns ordinary tables, constraints, and indexes. D1-specific SQL that
Drizzle cannot model is appended to the same reviewed migration, including:

- canonical locale seed rows;
- the external-content FTS5 table and synchronization triggers;
- publication eligibility checks;
- immutability guards for published revision content.

Do not regenerate an existing migration after those native sections have been
reviewed and committed. New schema changes must create a new migration.
