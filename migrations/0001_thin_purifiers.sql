PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_artifacts` (
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
	CONSTRAINT "artifacts_kind_valid" CHECK("__new_artifacts"."kind" IN ('sb3', 'image', 'attachment')),
	CONSTRAINT "artifacts_storage_valid" CHECK("__new_artifacts"."storage" = 'r2'),
	CONSTRAINT "artifacts_size_nonnegative" CHECK("__new_artifacts"."byte_size" >= 0),
	CONSTRAINT "artifacts_integrity_not_empty" CHECK("__new_artifacts"."storage_key" <> '' AND "__new_artifacts"."sha256" <> '')
);
--> statement-breakpoint
INSERT INTO `__new_artifacts`("id", "revision_id", "artifact_key", "kind", "storage", "storage_key", "content_type", "byte_size", "sha256", "license", "attribution", "created_at") SELECT "id", "revision_id", "artifact_key", "kind", "storage", "storage_key", "content_type", "byte_size", "sha256", "license", "attribution", "created_at" FROM `artifacts`;--> statement-breakpoint
DROP TABLE `artifacts`;--> statement-breakpoint
ALTER TABLE `__new_artifacts` RENAME TO `artifacts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_key_unique` ON `artifacts` (`revision_id`,`artifact_key`);--> statement-breakpoint
CREATE INDEX `artifacts_revision_idx` ON `artifacts` (`revision_id`);