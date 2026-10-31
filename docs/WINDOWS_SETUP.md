# Windows development — native PostgreSQL first

Task 003 increment 1 adds reviewed local access-schema migrations. Task 001/002 reports describe their historical scope. No production connection or deployment is supported.

## Prerequisites

Windows 11, Git for Windows, Node **24.19.0**, npm **11.9.0**, and PostgreSQL **17**. Install PostgreSQL 17 x64 through the installer linked by [PostgreSQL Windows downloads](https://www.postgresql.org/download/windows/). Select Server and Command Line Tools; pgAdmin is optional. Docker and WSL are not required. Use a current PostgreSQL 17 maintenance release; native Windows CI uses the runner's installed 17 release (currently documented as 17.11), while optional Docker is pinned to 17.6-bookworm.

During installation, retain the local `postgres` administrator password privately, record the port (normally 5432), and install the Windows service. Keep connections local, password authentication enabled (SCRAM), and do not open a public firewall rule. Do not enable `trust` authentication to solve connection errors. A dedicated STICH BILL database is required; do not use a production/shared application database.

```powershell
node --version
npm.cmd --version
# Only if npm differs:
npm.cmd install --global npm@11.9.0

git clone https://github.com/fsnboys-ship-it/stichbill.git
Set-Location stichbill
npm.cmd ci
npm.cmd run setup:env
```

Use `npm.cmd` to avoid npm.ps1 execution-policy issues. Do not weaken the system execution policy. For this increment's review, check out the supplied review branch/commit before these commands.

## Native PostgreSQL setup (recommended)

Check the installed service and binaries. Use the installer-selected port if different. If the service is stopped, start it through Windows Services (administrator permission may be needed); ordinary application development does not need an elevated terminal.

```powershell
Get-Service *postgres*
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p 5432
& "$pgBin\createdb.exe" -h 127.0.0.1 -p 5432 -U postgres -W stichbill_dev
```

The password prompt is local; do not paste the administrator password into chat or command arguments. If stichbill_dev already exists, verify that it is this project's dedicated database and preserve it; do not drop/recreate it.

Open the ignored `.env` in your editor. For this one-time bootstrap only, set DATABASE_URL to the installed administrator's connection:

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_URL_ENCODED_LOCAL_PASSWORD@127.0.0.1:5432/stichbill_dev
```

Replace the placeholder locally; URL-encode reserved password characters. Then run:

```powershell
npm.cmd run setup:db-env
npm.cmd run db:provision
npm.cmd run db:migrate:local
npm.cmd run db:check
npm.cmd run db:test:setup
npm.cmd run verify
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run dev
```

`setup:db-env` moves the administrator/Compose settings into ignored `.env.db`, generates separate migrator/runtime passwords, and replaces DATABASE_URL in `.env` with the restricted runtime URL. It preserves valid existing role credentials on rerun and rejects conflicting values. It parses and deterministically rewrites supported assignments, verifies staged files, then verifies the persisted files again. Unsupported keys or unrepresentable values fail before replacement; secrets are never printed. Runtime processes load `.env` only. Never load `.env.db` or `.env.test.db` into the web/API/worker. These files are for deliberate administration/test commands only; keep them private to your Windows account (file properties → Security).

`db:provision` creates database-specific, non-superuser migrator/runtime roles, removes public database access and prevents runtime schema creation. Existing roles and passwords are preserved only when the exact privilege contract passes. Unexpected ownership, grants, functions or RLS policies cause rejection without repair; incompatible roles require review. `db:migrate:local` explicitly enables both local migration gates and applies reviewed SQL with the migrator. It is never called by application startup or installation. Repeated migration runs verify checksums and apply only new migrations.

`db:test:setup` creates the separate stichbill_test database if absent, generates its separate ignored configuration and provisions its roles. It never drops/resets a database. Integration tests accept only stichbill_test, apply reviewed migrations there, insert random synthetic fixtures, and remove only those fixtures. They never use stichbill_dev as a fallback.

## Existing Task 002 checkout

Keep your existing `.env`, credentials and database/volume. Run `setup:db-env` once to separate the old bootstrap credentials, then provision/migrate/check and prepare the test database using the commands above. If `.env.db` already exists, setup:db-env verifies and preserves its valid administrator/migrator credentials. Do not run setup:env expecting it to overwrite an existing configuration. If interrupted between configuration steps, inspect the ignored files locally; do not delete a database or volume to repair credentials.

## Optional Docker setup

Choose this instead of the native server, with Docker Desktop Linux containers running. Existing volumes remain intact. On a fresh checkout:

```powershell
npm.cmd ci
npm.cmd run setup:env
npm.cmd run setup:db-env
npm.cmd run db:up
npm.cmd run db:provision
npm.cmd run db:migrate:local
npm.cmd run db:check
npm.cmd run db:test:setup
npm.cmd run verify
npm.cmd run dev
```

Compose takes its bootstrap variables from `.env.db`. It provisions only PostgreSQL, never schema automatically. `npm.cmd run db:down` stops Docker PostgreSQL while preserving its volume. Do not run both native and Docker PostgreSQL on port 5432. Changing Docker credentials after the volume was initialized does not change the stored password. Switching backends is a separate local configuration change; native and Docker databases are not automatically copied or merged.

## URLs and troubleshooting

Frontend: http://127.0.0.1:5173 · API: http://127.0.0.1:3001 · liveness: /api/v1/health · readiness: /api/v1/health/ready · Swagger: /api/docs.

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/v1/health
Invoke-RestMethod http://127.0.0.1:3001/api/v1/health/ready
```

These URLs refer to the computer running the commands. Readiness rejects elevated/migrator credentials and missing access schema. A green health page does not mean login or business setup screens exist in this increment.

- PostgreSQL unavailable: check service status, pg_isready and the installed port. Native service management uses Windows Services; db:up/down are Docker-only.
- Port conflict: update local URLs consistently in `.env`, `.env.db`, `.env.test`, `.env.test.db`; Docker also needs POSTGRES_PORT. Do not point at another application's database.
- Authentication failure: check role-specific passwords and URL encoding privately. Provisioning preserves existing passwords; do not reset roles blindly.
- Missing schema / checksum mismatch: verify the approved checkout and migration role. Never edit an already-applied migration or delete history to bypass verification; use a reviewed forward fix.
- API port conflict: edit API_PORT; Vite reads it from root .env. Web port 5173 fails if busy.

## Validation and scope

Both CI jobs run full verification plus browser tests. Linux uses PostgreSQL in a service container; Windows starts a dedicated native PostgreSQL 17 cluster on port 55432 with SCRAM, runs the same isolation tests, then stops it. CI credentials are synthetic. This validates native binaries and cross-platform tooling, not the GUI installer or your particular Windows permissions/service configuration.

This increment provides access persistence, session-context validation and read isolation only. Password login, cookie/CSRF handling, reset/invitations and owner/cashier setup screens require the next PM-reviewed increment. There are no products, inventory, tax rules, real users, production connections or deployments.

## Security correction upgrade

After checking out the reviewed security-correction commit, run `npm.cmd run setup:db-env`, `npm.cmd run db:provision`, then `npm.cmd run db:migrate:local` and `npm.cmd run db:check`. The original access migration stays immutable; the forward migration fixes global function defaults. Provisioning permits the exact known legacy schema/history only to reach that upgrade; readiness refuses the legacy default-ACL state. Do not repair a checksum mismatch by editing history.

The test administrator URL is loaded only by integration tests. Security regressions create random `stichbill_test_security_<8 hex>` databases and their own roles, mutate only those disposable objects, and remove them afterward. Native PostgreSQL's local administrator must be able to create/drop these test databases and roles. No Docker command is involved. Never substitute a production/admin URL.

Supported runtime environment keys are APP_ENV, API_HOST, API_PORT, ALLOW_MIGRATIONS and DATABASE_URL. Administrator settings (ADMIN_DATABASE_URL, MIGRATION_DATABASE_URL and POSTGRES_USER/PASSWORD/DB/PORT) live only in `.env.db`. `export`, whitespace, quoted values, CRLF/LF and absent final newline are supported. Comments/order are normalized. Run one setup process at a time. File mode 0600 is requested; on Windows keep the repository/private files restricted to your account using NTFS permissions.
