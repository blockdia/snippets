CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`artifact_key` text NOT NULL,
	`kind` text NOT NULL,
	`storage` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`license` text DEFAULT 'CC-BY-4.0' NOT NULL,
	`attribution` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`revision_id`) REFERENCES `snippet_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "artifacts_kind_valid" CHECK("artifacts"."kind" IN ('sb3', 'image', 'attachment')),
	CONSTRAINT "artifacts_storage_valid" CHECK("artifacts"."storage" IN ('static', 'r2')),
	CONSTRAINT "artifacts_size_nonnegative" CHECK("artifacts"."byte_size" >= 0),
	CONSTRAINT "artifacts_integrity_not_empty" CHECK("artifacts"."storage_key" <> '' AND "artifacts"."sha256" <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_key_unique` ON `artifacts` (`revision_id`,`artifact_key`);--> statement-breakpoint
CREATE INDEX `artifacts_revision_idx` ON `artifacts` (`revision_id`);--> statement-breakpoint
CREATE TABLE `contributors` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`external_id` text,
	`display_name` text NOT NULL,
	`profile_url` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "contributors_kind_valid" CHECK("contributors"."kind" IN ('user', 'github', 'scratch', 'name', 'organization')),
	CONSTRAINT "contributors_display_name_not_empty" CHECK("contributors"."display_name" <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contributors_external_unique` ON `contributors` (`kind`,`external_id`);--> statement-breakpoint
CREATE TABLE `locales` (
	`code` text PRIMARY KEY NOT NULL,
	`url_segment` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "locales_code_not_empty" CHECK("locales"."code" <> ''),
	CONSTRAINT "locales_code_no_underscore" CHECK("locales"."code" NOT GLOB '*_*'),
	CONSTRAINT "locales_url_segment_canonical" CHECK("locales"."url_segment" <> '' AND "locales"."url_segment" = lower("locales"."url_segment") AND "locales"."url_segment" NOT GLOB '*_*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locales_url_segment_unique` ON `locales` (`url_segment`);--> statement-breakpoint
CREATE TABLE `search_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snippet_id` text NOT NULL,
	`locale` text NOT NULL,
	`revision_id` text NOT NULL,
	`localization_revision_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`keywords` text DEFAULT '' NOT NULL,
	`scripts` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`snippet_id`) REFERENCES `snippets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`locale`) REFERENCES `locales`(`code`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revision_id`) REFERENCES `snippet_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`localization_revision_id`) REFERENCES `snippet_localization_revisions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_documents_snippet_locale_unique` ON `search_documents` (`snippet_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `search_documents_localization_revision_unique` ON `search_documents` (`localization_revision_id`);--> statement-breakpoint
CREATE INDEX `search_documents_locale_idx` ON `search_documents` (`locale`,`snippet_id`);--> statement-breakpoint
CREATE TABLE `snippet_localization_publications` (
	`localization_id` text PRIMARY KEY NOT NULL,
	`localization_revision_id` text NOT NULL,
	`published_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`localization_id`) REFERENCES `snippet_localizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`localization_revision_id`) REFERENCES `snippet_localization_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`localization_id`,`localization_revision_id`) REFERENCES `snippet_localization_revisions`(`localization_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_localization_publications_revision_unique` ON `snippet_localization_publications` (`localization_revision_id`);--> statement-breakpoint
CREATE TABLE `snippet_localization_revision_contributors` (
	`localization_revision_id` text NOT NULL,
	`contributor_id` text NOT NULL,
	`role` text DEFAULT 'translator' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`localization_revision_id`, `contributor_id`, `role`),
	FOREIGN KEY (`localization_revision_id`) REFERENCES `snippet_localization_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "snippet_localization_contributors_role_valid" CHECK("snippet_localization_revision_contributors"."role" IN ('translator', 'reviewer', 'source')),
	CONSTRAINT "snippet_localization_contributors_position_nonnegative" CHECK("snippet_localization_revision_contributors"."position" >= 0)
);
--> statement-breakpoint
CREATE INDEX `snippet_localization_contributors_revision_idx` ON `snippet_localization_revision_contributors` (`localization_revision_id`,`position`);--> statement-breakpoint
CREATE TABLE `snippet_localization_revision_scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`localization_revision_id` text NOT NULL,
	`script_key` text NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`localization_revision_id`) REFERENCES `snippet_localization_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "snippet_localization_scripts_key_not_empty" CHECK("snippet_localization_revision_scripts"."script_key" <> ''),
	CONSTRAINT "snippet_localization_scripts_source_not_empty" CHECK("snippet_localization_revision_scripts"."source" <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_localization_scripts_key_unique` ON `snippet_localization_revision_scripts` (`localization_revision_id`,`script_key`);--> statement-breakpoint
CREATE INDEX `snippet_localization_scripts_revision_idx` ON `snippet_localization_revision_scripts` (`localization_revision_id`);--> statement-breakpoint
CREATE TABLE `snippet_localization_revision_units` (
	`id` text PRIMARY KEY NOT NULL,
	`localization_revision_id` text NOT NULL,
	`unit_key` text NOT NULL,
	`translated_text` text NOT NULL,
	FOREIGN KEY (`localization_revision_id`) REFERENCES `snippet_localization_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "snippet_localization_units_key_not_empty" CHECK("snippet_localization_revision_units"."unit_key" <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_localization_units_key_unique` ON `snippet_localization_revision_units` (`localization_revision_id`,`unit_key`);--> statement-breakpoint
CREATE INDEX `snippet_localization_units_revision_idx` ON `snippet_localization_revision_units` (`localization_revision_id`);--> statement-breakpoint
CREATE TABLE `snippet_localization_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`localization_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`translation_basis_hash` text NOT NULL,
	`source_revision_id` text,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`body_markdown` text DEFAULT '' NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`prose_license` text DEFAULT 'CC-BY-SA-4.0' NOT NULL,
	`source_kind` text DEFAULT 'editorial' NOT NULL,
	`source_ref` text,
	`metadata` text,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`localization_id`) REFERENCES `snippet_localizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_revision_id`) REFERENCES `snippet_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "snippet_localization_revisions_number_positive" CHECK("snippet_localization_revisions"."revision_number" > 0),
	CONSTRAINT "snippet_localization_revisions_status_valid" CHECK("snippet_localization_revisions"."status" IN ('draft', 'published', 'withdrawn')),
	CONSTRAINT "snippet_localization_revisions_basis_valid" CHECK("snippet_localization_revisions"."translation_basis_hash" GLOB 'translation-basis-v*:*'),
	CONSTRAINT "snippet_localization_revisions_source_kind_valid" CHECK("snippet_localization_revisions"."source_kind" IN ('editorial', 'legacy-import', 'user-submission', 'api')),
	CONSTRAINT "snippet_localization_revisions_content_not_empty" CHECK("snippet_localization_revisions"."title" <> '' AND "snippet_localization_revisions"."summary" <> ''),
	CONSTRAINT "snippet_localization_revisions_publication_consistent" CHECK(("snippet_localization_revisions"."status" = 'published' AND "snippet_localization_revisions"."published_at" IS NOT NULL) OR ("snippet_localization_revisions"."status" <> 'published'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_localization_revisions_number_unique` ON `snippet_localization_revisions` (`localization_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_localization_revisions_owner_unique` ON `snippet_localization_revisions` (`localization_id`,`id`);--> statement-breakpoint
CREATE INDEX `snippet_localization_revisions_basis_idx` ON `snippet_localization_revisions` (`localization_id`,`translation_basis_hash`,`status`);--> statement-breakpoint
CREATE TABLE `snippet_localizations` (
	`id` text PRIMARY KEY NOT NULL,
	`snippet_id` text NOT NULL,
	`locale` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`snippet_id`) REFERENCES `snippets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`locale`) REFERENCES `locales`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_localizations_locale_unique` ON `snippet_localizations` (`snippet_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_localizations_owner_unique` ON `snippet_localizations` (`snippet_id`,`id`);--> statement-breakpoint
CREATE INDEX `snippet_localizations_locale_idx` ON `snippet_localizations` (`locale`,`snippet_id`);--> statement-breakpoint
CREATE TABLE `snippet_publications` (
	`snippet_id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`published_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`snippet_id`) REFERENCES `snippets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `snippet_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`snippet_id`,`revision_id`) REFERENCES `snippet_revisions`(`snippet_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_publications_revision_unique` ON `snippet_publications` (`revision_id`);--> statement-breakpoint
CREATE TABLE `snippet_revision_contributors` (
	`revision_id` text NOT NULL,
	`contributor_id` text NOT NULL,
	`role` text DEFAULT 'author' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`revision_id`, `contributor_id`, `role`),
	FOREIGN KEY (`revision_id`) REFERENCES `snippet_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "snippet_revision_contributors_role_valid" CHECK("snippet_revision_contributors"."role" IN ('author', 'maintainer', 'source')),
	CONSTRAINT "snippet_revision_contributors_position_nonnegative" CHECK("snippet_revision_contributors"."position" >= 0)
);
--> statement-breakpoint
CREATE INDEX `snippet_revision_contributors_revision_idx` ON `snippet_revision_contributors` (`revision_id`,`position`);--> statement-breakpoint
CREATE TABLE `snippet_revision_references` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`reference_key` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`url` text NOT NULL,
	`title_unit_key` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`revision_id`) REFERENCES `snippet_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "snippet_revision_references_kind_valid" CHECK("snippet_revision_references"."kind" IN ('article', 'project', 'video', 'extension', 'repository', 'other')),
	CONSTRAINT "snippet_revision_references_url_not_empty" CHECK("snippet_revision_references"."url" <> ''),
	CONSTRAINT "snippet_revision_references_position_nonnegative" CHECK("snippet_revision_references"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_revision_references_key_unique` ON `snippet_revision_references` (`revision_id`,`reference_key`);--> statement-breakpoint
CREATE INDEX `snippet_revision_references_revision_idx` ON `snippet_revision_references` (`revision_id`,`position`);--> statement-breakpoint
CREATE TABLE `snippet_revision_scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`script_key` text NOT NULL,
	`position` integer NOT NULL,
	`source` text NOT NULL,
	`metadata` text,
	FOREIGN KEY (`revision_id`) REFERENCES `snippet_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "snippet_revision_scripts_key_not_empty" CHECK("snippet_revision_scripts"."script_key" <> ''),
	CONSTRAINT "snippet_revision_scripts_position_nonnegative" CHECK("snippet_revision_scripts"."position" >= 0),
	CONSTRAINT "snippet_revision_scripts_source_not_empty" CHECK("snippet_revision_scripts"."source" <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_revision_scripts_key_unique` ON `snippet_revision_scripts` (`revision_id`,`script_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_revision_scripts_position_unique` ON `snippet_revision_scripts` (`revision_id`,`position`);--> statement-breakpoint
CREATE INDEX `snippet_revision_scripts_revision_idx` ON `snippet_revision_scripts` (`revision_id`,`position`);--> statement-breakpoint
CREATE TABLE `snippet_revision_symbols` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`symbol_key` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text NOT NULL,
	`name_unit_key` text NOT NULL,
	`position` integer NOT NULL,
	`metadata` text,
	FOREIGN KEY (`revision_id`) REFERENCES `snippet_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "snippet_revision_symbols_key_not_empty" CHECK("snippet_revision_symbols"."symbol_key" <> ''),
	CONSTRAINT "snippet_revision_symbols_kind_valid" CHECK("snippet_revision_symbols"."kind" IN ('variable', 'list', 'broadcast', 'custom-argument')),
	CONSTRAINT "snippet_revision_symbols_scope_valid" CHECK("snippet_revision_symbols"."scope" IN ('global', 'sprite', 'local', 'choose')),
	CONSTRAINT "snippet_revision_symbols_position_nonnegative" CHECK("snippet_revision_symbols"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_revision_symbols_key_unique` ON `snippet_revision_symbols` (`revision_id`,`symbol_key`);--> statement-breakpoint
CREATE INDEX `snippet_revision_symbols_revision_idx` ON `snippet_revision_symbols` (`revision_id`,`position`);--> statement-breakpoint
CREATE TABLE `snippet_revision_tags` (
	`revision_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`revision_id`, `tag_id`),
	FOREIGN KEY (`revision_id`) REFERENCES `snippet_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "snippet_revision_tags_position_nonnegative" CHECK("snippet_revision_tags"."position" >= 0)
);
--> statement-breakpoint
CREATE INDEX `snippet_revision_tags_revision_idx` ON `snippet_revision_tags` (`revision_id`,`position`);--> statement-breakpoint
CREATE INDEX `snippet_revision_tags_tag_idx` ON `snippet_revision_tags` (`tag_id`,`revision_id`);--> statement-breakpoint
CREATE TABLE `snippet_revision_translation_units` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`unit_key` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer NOT NULL,
	`source_text` text NOT NULL,
	`metadata` text,
	FOREIGN KEY (`revision_id`) REFERENCES `snippet_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "snippet_revision_units_key_not_empty" CHECK("snippet_revision_translation_units"."unit_key" <> ''),
	CONSTRAINT "snippet_revision_units_kind_valid" CHECK("snippet_revision_translation_units"."kind" IN ('script-title', 'symbol', 'procedure', 'comment', 'reference')),
	CONSTRAINT "snippet_revision_units_position_nonnegative" CHECK("snippet_revision_translation_units"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_revision_units_key_unique` ON `snippet_revision_translation_units` (`revision_id`,`unit_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_revision_units_position_unique` ON `snippet_revision_translation_units` (`revision_id`,`position`);--> statement-breakpoint
CREATE INDEX `snippet_revision_units_revision_idx` ON `snippet_revision_translation_units` (`revision_id`,`position`);--> statement-breakpoint
CREATE TABLE `snippet_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`snippet_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`content_schema_version` integer DEFAULT 1 NOT NULL,
	`representation` text DEFAULT 'scratchblocks' NOT NULL,
	`representation_version` integer DEFAULT 1 NOT NULL,
	`content_hash` text NOT NULL,
	`translation_basis_hash` text NOT NULL,
	`change_summary` text,
	`code_license` text DEFAULT 'CC0-1.0' NOT NULL,
	`source_kind` text DEFAULT 'editorial' NOT NULL,
	`source_ref` text,
	`metadata` text,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`snippet_id`) REFERENCES `snippets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "snippet_revisions_number_positive" CHECK("snippet_revisions"."revision_number" > 0),
	CONSTRAINT "snippet_revisions_schema_version_positive" CHECK("snippet_revisions"."content_schema_version" > 0 AND "snippet_revisions"."representation_version" > 0),
	CONSTRAINT "snippet_revisions_status_valid" CHECK("snippet_revisions"."status" IN ('draft', 'published', 'withdrawn')),
	CONSTRAINT "snippet_revisions_representation_valid" CHECK("snippet_revisions"."representation" IN ('scratchblocks', 'scratch-blocks-ast')),
	CONSTRAINT "snippet_revisions_source_kind_valid" CHECK("snippet_revisions"."source_kind" IN ('editorial', 'legacy-import', 'user-submission', 'api')),
	CONSTRAINT "snippet_revisions_hashes_not_empty" CHECK("snippet_revisions"."content_hash" <> '' AND "snippet_revisions"."translation_basis_hash" GLOB 'translation-basis-v*:*'),
	CONSTRAINT "snippet_revisions_publication_consistent" CHECK(("snippet_revisions"."status" = 'published' AND "snippet_revisions"."published_at" IS NOT NULL) OR ("snippet_revisions"."status" <> 'published'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_revisions_number_unique` ON `snippet_revisions` (`snippet_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_revisions_owner_unique` ON `snippet_revisions` (`snippet_id`,`id`);--> statement-breakpoint
CREATE INDEX `snippet_revisions_status_idx` ON `snippet_revisions` (`snippet_id`,`status`);--> statement-breakpoint
CREATE TABLE `snippets` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text,
	CONSTRAINT "snippets_slug_canonical" CHECK("snippets"."slug" <> '' AND "snippets"."slug" = lower("snippets"."slug") AND "snippets"."slug" NOT GLOB '*[^a-z0-9-]*' AND "snippets"."slug" NOT GLOB '-*' AND "snippets"."slug" NOT GLOB '*-' AND "snippets"."slug" NOT GLOB '*--*'),
	CONSTRAINT "snippets_status_valid" CHECK("snippets"."status" IN ('active', 'archived')),
	CONSTRAINT "snippets_archive_consistent" CHECK(("snippets"."status" = 'archived' AND "snippets"."archived_at" IS NOT NULL) OR ("snippets"."status" = 'active' AND "snippets"."archived_at" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippets_slug_unique` ON `snippets` (`slug`);--> statement-breakpoint
CREATE TABLE `tag_localizations` (
	`tag_id` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	PRIMARY KEY(`tag_id`, `locale`),
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`locale`) REFERENCES `locales`(`code`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tag_localizations_name_not_empty" CHECK("tag_localizations"."name" <> '')
);
--> statement-breakpoint
CREATE INDEX `tag_localizations_locale_idx` ON `tag_localizations` (`locale`,`name`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "tags_slug_canonical" CHECK("tags"."slug" <> '' AND "tags"."slug" = lower("tags"."slug") AND "tags"."slug" NOT GLOB '*[^a-z0-9-]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);
--> statement-breakpoint
INSERT INTO `locales` (`code`, `url_segment`, `enabled`) VALUES
	('en', 'en', 1),
	('zh-CN', 'zh-cn', 1),
	('zh-TW', 'zh-tw', 1);
--> statement-breakpoint
CREATE VIRTUAL TABLE `snippet_search_fts` USING fts5(
	`title`,
	`summary`,
	`body`,
	`keywords`,
	`scripts`,
	content='search_documents',
	content_rowid='id',
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `search_documents_after_insert`
AFTER INSERT ON `search_documents`
BEGIN
	INSERT INTO `snippet_search_fts` (`rowid`, `title`, `summary`, `body`, `keywords`, `scripts`)
	VALUES (new.`id`, new.`title`, new.`summary`, new.`body`, new.`keywords`, new.`scripts`);
END;
--> statement-breakpoint
CREATE TRIGGER `search_documents_after_delete`
AFTER DELETE ON `search_documents`
BEGIN
	INSERT INTO `snippet_search_fts` (`snippet_search_fts`, `rowid`, `title`, `summary`, `body`, `keywords`, `scripts`)
	VALUES ('delete', old.`id`, old.`title`, old.`summary`, old.`body`, old.`keywords`, old.`scripts`);
END;
--> statement-breakpoint
CREATE TRIGGER `search_documents_after_update`
AFTER UPDATE ON `search_documents`
BEGIN
	INSERT INTO `snippet_search_fts` (`snippet_search_fts`, `rowid`, `title`, `summary`, `body`, `keywords`, `scripts`)
	VALUES ('delete', old.`id`, old.`title`, old.`summary`, old.`body`, old.`keywords`, old.`scripts`);
	INSERT INTO `snippet_search_fts` (`rowid`, `title`, `summary`, `body`, `keywords`, `scripts`)
	VALUES (new.`id`, new.`title`, new.`summary`, new.`body`, new.`keywords`, new.`scripts`);
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_content_immutable`
BEFORE UPDATE OF `snippet_id`, `revision_number`, `content_schema_version`, `representation`, `representation_version`, `content_hash`, `translation_basis_hash`, `change_summary`, `code_license`, `source_kind`, `source_ref`, `metadata`, `created_by`, `created_at`
ON `snippet_revisions`
WHEN old.`status` <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision content is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_state_monotonic`
BEFORE UPDATE OF `status` ON `snippet_revisions`
WHEN (old.`status` = 'published' AND new.`status` = 'draft')
	OR (old.`status` = 'withdrawn' AND new.`status` <> 'withdrawn')
BEGIN
	SELECT RAISE(ABORT, 'snippet revision status cannot move backwards');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_published_delete_guard`
BEFORE DELETE ON `snippet_revisions`
WHEN old.`status` <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revisions cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_revision_content_immutable`
BEFORE UPDATE OF `localization_id`, `revision_number`, `translation_basis_hash`, `source_revision_id`, `title`, `summary`, `seo_title`, `seo_description`, `body_markdown`, `keywords`, `prose_license`, `source_kind`, `source_ref`, `metadata`, `created_by`, `created_at`
ON `snippet_localization_revisions`
WHEN old.`status` <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published localization revision content is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_revision_state_monotonic`
BEFORE UPDATE OF `status` ON `snippet_localization_revisions`
WHEN (old.`status` = 'published' AND new.`status` = 'draft')
	OR (old.`status` = 'withdrawn' AND new.`status` <> 'withdrawn')
BEGIN
	SELECT RAISE(ABORT, 'localization revision status cannot move backwards');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_revision_published_delete_guard`
BEFORE DELETE ON `snippet_localization_revisions`
WHEN old.`status` <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published localization revisions cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_scripts_insert_guard`
BEFORE INSERT ON `snippet_revision_scripts`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = new.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision scripts are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_scripts_update_guard`
BEFORE UPDATE ON `snippet_revision_scripts`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision scripts are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_scripts_delete_guard`
BEFORE DELETE ON `snippet_revision_scripts`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision scripts are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_units_insert_guard`
BEFORE INSERT ON `snippet_revision_translation_units`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = new.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision translation units are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_units_update_guard`
BEFORE UPDATE ON `snippet_revision_translation_units`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision translation units are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_units_delete_guard`
BEFORE DELETE ON `snippet_revision_translation_units`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision translation units are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_scripts_insert_guard`
BEFORE INSERT ON `snippet_localization_revision_scripts`
WHEN (SELECT `status` FROM `snippet_localization_revisions` WHERE `id` = new.`localization_revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published localization scripts are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_scripts_update_guard`
BEFORE UPDATE ON `snippet_localization_revision_scripts`
WHEN (SELECT `status` FROM `snippet_localization_revisions` WHERE `id` = old.`localization_revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published localization scripts are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_scripts_delete_guard`
BEFORE DELETE ON `snippet_localization_revision_scripts`
WHEN (SELECT `status` FROM `snippet_localization_revisions` WHERE `id` = old.`localization_revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published localization scripts are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_units_insert_guard`
BEFORE INSERT ON `snippet_localization_revision_units`
WHEN (SELECT `status` FROM `snippet_localization_revisions` WHERE `id` = new.`localization_revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published localization units are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_units_update_guard`
BEFORE UPDATE ON `snippet_localization_revision_units`
WHEN (SELECT `status` FROM `snippet_localization_revisions` WHERE `id` = old.`localization_revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published localization units are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_units_delete_guard`
BEFORE DELETE ON `snippet_localization_revision_units`
WHEN (SELECT `status` FROM `snippet_localization_revisions` WHERE `id` = old.`localization_revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published localization units are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_symbols_insert_guard`
BEFORE INSERT ON `snippet_revision_symbols`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = new.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision symbols are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_symbols_update_guard`
BEFORE UPDATE ON `snippet_revision_symbols`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision symbols are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_symbols_delete_guard`
BEFORE DELETE ON `snippet_revision_symbols`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision symbols are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_references_insert_guard`
BEFORE INSERT ON `snippet_revision_references`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = new.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision references are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_references_update_guard`
BEFORE UPDATE ON `snippet_revision_references`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision references are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_references_delete_guard`
BEFORE DELETE ON `snippet_revision_references`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision references are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_tags_insert_guard`
BEFORE INSERT ON `snippet_revision_tags`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = new.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision tags are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_tags_update_guard`
BEFORE UPDATE ON `snippet_revision_tags`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision tags are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_tags_delete_guard`
BEFORE DELETE ON `snippet_revision_tags`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision tags are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_contributors_insert_guard`
BEFORE INSERT ON `snippet_revision_contributors`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = new.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision contributors are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_contributors_update_guard`
BEFORE UPDATE ON `snippet_revision_contributors`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision contributors are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_revision_contributors_delete_guard`
BEFORE DELETE ON `snippet_revision_contributors`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision contributors are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `artifacts_insert_guard`
BEFORE INSERT ON `artifacts`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = new.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision artifacts are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `artifacts_update_guard`
BEFORE UPDATE ON `artifacts`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision artifacts are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `artifacts_delete_guard`
BEFORE DELETE ON `artifacts`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = old.`revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published snippet revision artifacts are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_contributors_insert_guard`
BEFORE INSERT ON `snippet_localization_revision_contributors`
WHEN (SELECT `status` FROM `snippet_localization_revisions` WHERE `id` = new.`localization_revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published localization contributors are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_contributors_update_guard`
BEFORE UPDATE ON `snippet_localization_revision_contributors`
WHEN (SELECT `status` FROM `snippet_localization_revisions` WHERE `id` = old.`localization_revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published localization contributors are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_contributors_delete_guard`
BEFORE DELETE ON `snippet_localization_revision_contributors`
WHEN (SELECT `status` FROM `snippet_localization_revisions` WHERE `id` = old.`localization_revision_id`) <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'published localization contributors are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_publication_insert_guard`
BEFORE INSERT ON `snippet_publications`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = new.`revision_id`) <> 'published'
BEGIN
	SELECT RAISE(ABORT, 'snippet publication requires a published revision');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_publication_update_guard`
BEFORE UPDATE OF `revision_id` ON `snippet_publications`
WHEN (SELECT `status` FROM `snippet_revisions` WHERE `id` = new.`revision_id`) <> 'published'
BEGIN
	SELECT RAISE(ABORT, 'snippet publication requires a published revision');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_publication_insert_guard`
BEFORE INSERT ON `snippet_localization_publications`
WHEN (SELECT `status` FROM `snippet_localization_revisions` WHERE `id` = new.`localization_revision_id`) <> 'published'
BEGIN
	SELECT RAISE(ABORT, 'localization publication requires a published revision');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_publication_update_guard`
BEFORE UPDATE OF `localization_revision_id` ON `snippet_localization_publications`
WHEN (SELECT `status` FROM `snippet_localization_revisions` WHERE `id` = new.`localization_revision_id`) <> 'published'
BEGIN
	SELECT RAISE(ABORT, 'localization publication requires a published revision');
END;
--> statement-breakpoint
CREATE TRIGGER `search_documents_insert_guard`
BEFORE INSERT ON `search_documents`
WHEN NOT EXISTS (
	SELECT 1
	FROM `snippet_publications` AS sp
	JOIN `snippet_revisions` AS sr ON sr.`id` = sp.`revision_id`
	JOIN `snippet_localizations` AS sl ON sl.`snippet_id` = sp.`snippet_id`
	JOIN `snippet_localization_publications` AS slp ON slp.`localization_id` = sl.`id`
	JOIN `snippet_localization_revisions` AS slr ON slr.`id` = slp.`localization_revision_id`
	WHERE sp.`snippet_id` = new.`snippet_id`
		AND sp.`revision_id` = new.`revision_id`
		AND sl.`locale` = new.`locale`
		AND slp.`localization_revision_id` = new.`localization_revision_id`
		AND sr.`translation_basis_hash` = slr.`translation_basis_hash`
)
BEGIN
	SELECT RAISE(ABORT, 'search document must reference active compatible publications');
END;
--> statement-breakpoint
CREATE TRIGGER `search_documents_update_guard`
BEFORE UPDATE ON `search_documents`
WHEN NOT EXISTS (
	SELECT 1
	FROM `snippet_publications` AS sp
	JOIN `snippet_revisions` AS sr ON sr.`id` = sp.`revision_id`
	JOIN `snippet_localizations` AS sl ON sl.`snippet_id` = sp.`snippet_id`
	JOIN `snippet_localization_publications` AS slp ON slp.`localization_id` = sl.`id`
	JOIN `snippet_localization_revisions` AS slr ON slr.`id` = slp.`localization_revision_id`
	WHERE sp.`snippet_id` = new.`snippet_id`
		AND sp.`revision_id` = new.`revision_id`
		AND sl.`locale` = new.`locale`
		AND slp.`localization_revision_id` = new.`localization_revision_id`
		AND sr.`translation_basis_hash` = slr.`translation_basis_hash`
)
BEGIN
	SELECT RAISE(ABORT, 'search document must reference active compatible publications');
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_publications_after_update`
AFTER UPDATE OF `revision_id` ON `snippet_publications`
BEGIN
	DELETE FROM `search_documents`
	WHERE `snippet_id` = new.`snippet_id` AND `revision_id` <> new.`revision_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_publications_after_delete`
AFTER DELETE ON `snippet_publications`
BEGIN
	DELETE FROM `search_documents` WHERE `snippet_id` = old.`snippet_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_publications_after_update`
AFTER UPDATE OF `localization_revision_id` ON `snippet_localization_publications`
BEGIN
	DELETE FROM `search_documents`
	WHERE `localization_revision_id` = old.`localization_revision_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `snippet_localization_publications_after_delete`
AFTER DELETE ON `snippet_localization_publications`
BEGIN
	DELETE FROM `search_documents`
	WHERE `localization_revision_id` = old.`localization_revision_id`;
END;
