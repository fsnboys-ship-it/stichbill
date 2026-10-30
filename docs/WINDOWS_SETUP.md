# Windows PowerShell development setup

Run from a normal PowerShell terminal on Windows 11. This setup is local-only and creates no business tables. Keep the existing Task 001 documents. No production credentials are needed.

## Prerequisites

Install Git for Windows, Node.js **24.19.0** (official Windows installer or nvm-windows), and Docker Desktop with the WSL2/Linux-container backend. Docker Desktop licensing depends on your organisation; native local PostgreSQL 17 is an alternative. Start Docker Desktop before the database commands. The monorepo needs npm **11.9.0**. GitHub CI checks install/build/unit/browser execution on Windows; local PostgreSQL integration is separately tested on Linux.

```powershell
node --version  # v24.19.0
npm --version   # 11.9.0
# If the installer supplied another npm version:
npm.cmd install --global npm@11.9.0

git clone https://github.com/fsnboys-ship-it/stichbill.git
Set-Location stichbill
npm.cmd ci
npm.cmd run setup:env
npm.cmd run db:up
npm.cmd run db:check
npm.cmd run dev
```

Using `npm.cmd` avoids PowerShell execution-policy errors for npm.ps1; do not weaken the system execution policy. Node/npm pins are enforced. Commands in package scripts are cross-platform and do not depend on Bash, symlinks created by shell scripts, cp, rm or Unix environment-prefix syntax.

Open the development page at `http://127.0.0.1:5173` in your local browser. The API listens at `http://127.0.0.1:3001`; health is `/api/v1/health`, database readiness is `/api/v1/health/ready`, and Swagger UI is `/api/docs`. Those addresses refer to the machine running the commands, not a cloud workspace from your own PC. Press Ctrl+C to stop the frontend/API.

## Environment handling

`npm run setup:env` creates `.env` once, with a randomly generated local DB password. It preserves an existing file. `.env` is ignored; `.env.example` contains placeholders only. PostgreSQL's CI password is an isolated test fixture, never a production credential. No `VITE_` secrets exist.

If copying `.env.example` manually, replace the example password and update its URL-encoded form in DATABASE_URL before startup. APP_ENV is development/test only. The API accepts loopback PostgreSQL URLs for databases named stichbill_dev or stichbill_test; remote hosts, query overrides and production names are rejected. No migrations run on startup.

Port 5432 conflict: edit POSTGRES_PORT and DATABASE_URL together, e.g. 5433, then `npm run db:up`. API port conflict: edit API_PORT; the Vite proxy reads it from root .env. Web port 5173 deliberately fails if busy; stop the conflicting development server or explicitly choose another port and adjust browser tests. Do not point at another project's database to resolve a conflict.

Docker stores credentials when it first initialises the named volume. Editing .env later does not change the existing DB password. Preserve the original development credentials or use an explicitly reviewed local password update; do not delete a volume to fix it without checking its contents.

## Verification

In a second PowerShell terminal at repository root:

```powershell
npm.cmd run ci:check
npm.cmd run verify
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

`verify` runs ESLint, all workspace typechecks/builds, unit tests, real database integration tests and OpenAPI drift checking. PostgreSQL must be running. Integration tests fail if the public schema contains application/migration tables, making accidental schema changes visible. Test provider fixtures are files only; no fixture SQL executes.

For unit checks without PostgreSQL: `npm.cmd run test:unit`. To regenerate contracts intentionally: `npm.cmd run openapi:generate`, review the JSON/types and commit both. OpenAPI generation itself does not connect to the database.

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/v1/health
Invoke-RestMethod http://127.0.0.1:3001/api/v1/health/ready
# Stop PostgreSQL while preserving the volume:
npm.cmd run db:down
```

## Native PostgreSQL alternative

Use a dedicated local PostgreSQL 17 development installation. Create only the empty database/role for this project using its admin setup, with DB name stichbill_dev and a local-only password, then put its URL in .env. This is service provisioning, not a business migration. Do not use a production database or shared application schema. Skip db:up/db:down, run db:check and verify. Task 002 does not supply any CREATE TABLE statements.

## Migrations and CI

Do **not** run `db:migrate` in Task 002. The migration directory is empty, and execution requires a future reviewed SQL change plus explicit environment and command gates. Migrations are not part of test/verify/CI. No automatic down/reset command exists.

GitHub Actions: Ubuntu checks the complete workflow against a fresh PostgreSQL service; Windows checks reproducible install, lint/types/build/unit/OpenAPI and browser/API with database-down state. Both run Playwright Chromium. A Windows CI pass establishes those commands on the hosted runner; it does not certify every Docker Desktop/WSL/printer installation.

Known current limits: development-only API binding/configuration; no auth, business endpoints, worker jobs, offline functionality or deployment. The production build is a compilation artifact, not a production-ready service configuration.
