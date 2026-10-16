# Backups and keep-alive

`.github/workflows/backup.yml` runs every day at 02:17 UTC on GitHub (free for private repositories, about 2 minutes a day of the 2,000 free minutes a month). It does two things:

- **Keep-alive:** one small request to Supabase so a free project never pauses for inactivity.
- **Backup:** dumps the database, encrypts it with your passphrase and keeps it as a download on the workflow run: 30 days for daily backups, 90 days for the one taken on the 1st of each month.

What a backup contains:

| File | Contents |
|---|---|
| `0-auth-data.sql` | Logins: users, identities and two-factor settings |
| `1-public.sql` | Everything in the app: tables, data, functions, security policies |
| `2-storage-data.sql` | Storage bucket settings and the list of uploaded files |
| `row-counts.csv` | Number of rows per table, to check a restore |

**Not included:** the uploaded files themselves (logos and job photos), and project settings in the Supabase dashboard (auth URLs, email templates, API keys).

## One-time setup

1. The project must be in a **private** GitHub repository (the workflow only runs from the default branch).
2. In Supabase, click **Connect** at the top of the project → **Session pooler** → copy the URI. Replace `[YOUR-PASSWORD]` with the database password. If the password has symbols such as `@ # / :`, either reset it to letters and numbers only (Project Settings → Database → Reset password) or URL-encode them.
   Use the Session pooler, not the Direct connection: GitHub's servers can't reach the direct address.
3. Make up a long backup passphrase (e.g. five random words) and save it in your password manager. **Without it the backups can't be opened.**
4. In GitHub: repository → **Settings → Secrets and variables → Actions → New repository secret**. Add:
   - `SUPABASE_DB_URL`: the Session pooler URI from step 2
   - `BACKUP_PASSPHRASE`: the passphrase from step 3
   - `SUPABASE_URL`: same as `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`: same as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. **Actions** tab → **Daily backup and keep-alive** → **Run workflow**. Both jobs should go green, and the run page shows a `backup-YYYY-MM-DD` download at the bottom.

GitHub emails you if a scheduled run fails.

If the backup job ever says `server version mismatch`, Supabase has upgraded Postgres: change `PG_MAJOR` in the workflow to the new version number.

## Restoring

Practise this once with a test project so it isn't new on a bad day.

1. Open the workflow run you want, download the `backup-…` file and unzip it to get `backup-YYYY-MM-DD.tar.gz.gpg`.
2. Decrypt and unpack (on Windows, install [Gpg4win](https://www.gpg4win.org); `tar` is built in):
   ```
   gpg -d backup-YYYY-MM-DD.tar.gz.gpg > backup.tar.gz
   tar -xzf backup.tar.gz
   ```
3. Create a **new** Supabase project (restoring over the live one isn't recommended). Copy its Session pooler URI.
4. Load the files **in this order** with `psql` (installed with PostgreSQL; on Windows the [PostgreSQL installer](https://www.postgresql.org/download/windows/) can install just the command line tools):
   ```
   psql "NEW_PROJECT_URI" -v ON_ERROR_STOP=1 --single-transaction -f 0-auth-data.sql
   psql "NEW_PROJECT_URI" -v ON_ERROR_STOP=1 --single-transaction -f 1-public.sql
   psql "NEW_PROJECT_URI" -v ON_ERROR_STOP=1 --single-transaction -f 2-storage-data.sql
   ```
5. Check the numbers match `row-counts.csv`:
   ```
   psql "NEW_PROJECT_URI" -c "select relname, n_live_tup from pg_stat_user_tables where schemaname = 'public' order by 1"
   ```
6. In the new project, set Authentication → URL Configuration and email settings as before. Then update the Supabase URL and keys in Vercel (and the GitHub secrets) and redeploy.

Everyone can then sign in with their usual email and password.
