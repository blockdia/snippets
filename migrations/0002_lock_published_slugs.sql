CREATE TRIGGER `snippets_published_slug_immutable`
BEFORE UPDATE OF `slug` ON `snippets`
WHEN old.`slug` <> new.`slug`
  AND EXISTS (
    SELECT 1
    FROM `snippet_publications`
    WHERE `snippet_id` = old.`id`
  )
BEGIN
	SELECT RAISE(ABORT, 'published snippet slugs are immutable');
END;
