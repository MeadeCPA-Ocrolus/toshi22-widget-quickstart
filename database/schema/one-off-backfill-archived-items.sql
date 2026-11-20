-- One-off, run once per database (works in Azure SQL and PostgreSQL).
--
-- Before the "one meaning of archived" change, a connection the client revoked
-- was marked only status = 'archived' and stayed visible in the app. This sets
-- the flag the app actually filters on, so those old rows are hidden too.
-- It changes no other data. Safe to run twice.
UPDATE items SET is_archived = 1 WHERE status = 'archived' AND is_archived = 0;
