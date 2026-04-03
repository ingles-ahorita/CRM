Schema in this repo
---------------------

1) Migrations (supabase/migrations/*.sql)
   - Versioned changes you apply with: supabase db push
   - Good for history, not always a full picture if tables were edited in the dashboard.

2) Full snapshot for Cursor / agents: supabase/schema.sql
   - Regenerate after real DB changes so the repo matches production.

   A) Recommended (Supabase CLI — needs Docker Desktop running on your Mac):

        cd /path/to/my-app
        npm run db:schema

      If the CLI asks for a password, use the one from:
      Supabase Dashboard → Project Settings → Database → Database password.

      You can also set it once per shell:

        export SUPABASE_DB_PASSWORD='your-database-password'
        npm run db:schema

   B) If `db dump` fails with "Cannot connect to the Docker daemon":
      - Start Docker Desktop, then run `npm run db:schema` again.

   C) Without Docker: install PostgreSQL client tools (e.g. `brew install libpq` and add pg_dump to PATH),
      then use the "Connection string" (URI mode) from Project Settings → Database with pg_dump --schema-only.
      Or use the SQL fallback in scripts/list_public_columns.sql (run in SQL Editor, save CSV/text into the repo).

3) Commit supabase/schema.sql after a successful dump so Agent mode can read your tables/columns.

4) Do not commit database passwords or .env files with secrets.
