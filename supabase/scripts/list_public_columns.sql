-- Run in Supabase Dashboard → SQL Editor (no Docker needed).
-- Paste results into a file (e.g. supabase/columns_snapshot.txt) if you need a quick reference without full pg_dump.

SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;
