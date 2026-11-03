# Product Catalogue: native Windows CMD

Use **Command Prompt (CMD)** on Windows. No Docker, WSL or BIOS changes are needed. Install Git, Node.js **24.19.0**, npm **11.9.0** and native **PostgreSQL 17** first. Keep the PostgreSQL installer administrator password privately. These commands operate on dedicated **local** development/test databases, never a staging/production URL.

## Get the branch

From the parent folder where you want the project (or use your existing clean checkout):

```cmd
git clone https://github.com/fsnboys-ship-it/stichbill.git
cd stichbill
git switch feature/task-004-product-catalogue-increment-1
npm.cmd install --global npm@11.9.0
npm.cmd ci
set "PATH=C:\Program Files\PostgreSQL\17\bin;%PATH%"
sc query postgresql-x64-17
```

If that service is stopped, run this in an **administrator CMD**, then return to normal CMD. If the installer used a different service name, substitute that installed name:

```cmd
net start postgresql-x64-17
```

## First-time local database setup

Do not recreate an existing database or replace existing environment files. Back up existing local data first. For a fresh checkout:

```cmd
createdb -h 127.0.0.1 -p 5432 -U postgres -W stichbill_dev
npm.cmd run setup:env
notepad .env
```

In `.env`, set `DATABASE_URL` to your native local administrator connection **temporarily**:

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/stichbill_dev
```

Replace the placeholder privately; percent-encode reserved URL characters in the password. Never paste credentials in Git, screenshots, chat or a command line. Keep `APP_ENV=development`, `API_HOST=127.0.0.1`, `API_PORT=3001`. Remove the `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` and `POSTGRES_PORT` lines (these describe an alternative container setup and are unnecessary here). Save and close Notepad, then:

```cmd
npm.cmd run setup:db-env
npm.cmd run db:provision
npm.cmd run db:migrate:local
npm.cmd run db:check
```

The separation command moves the administrator URL into ignored `.env.db` and generates distinct restricted migrator/runtime credentials. Do **not** put the administrator URL back into `.env`. The existing main-branch local model requires a local superuser database owner; Task007's proposed NOLOGIN staging model remains separate in unmerged PR #4.

For an existing correctly separated local checkout, run `npm.cmd run db:migrate:local` and `npm.cmd run db:check` after installing dependencies. Review the new migration before running it. A failed readiness check must be resolved rather than bypassed.

## Start and open Chrome

In CMD terminal 1, at the repository root:

```cmd
npm.cmd run dev:api
```

In CMD terminal 2, at the same repository root:

```cmd
npm.cmd run dev:web
```

In CMD terminal 3:

```cmd
curl.exe --fail http://127.0.0.1:3001/api/v1/health
curl.exe --fail http://127.0.0.1:3001/api/v1/health/ready
start chrome http://127.0.0.1:5173
```

Alternatively `npm.cmd run dev` runs both servers in one terminal. Keep their terminals open. Use exactly **http://127.0.0.1:5173** consistently. Do not use a different port or mix localhost/127.0.0.1, since origin/cookie checks are intentional. `localhost` on your PC is your PC; the agent workspace is a different machine and is not a published online preview.

Create your own owner account and business, then create a shop in Organisation. In Product catalogue press **Reload shops**. Create categories and brands, then **Add product**, enter a unique style code, add size/colour variants and their unique SKUs, prices and optional barcode aliases. Save, view details, upload an image, edit variants and try searching a barcode. Deactivation preserves historical records. Cashiers need an owner-granted shop/branch assignment; branch-only cashiers select their assigned branch. There are no seeded credentials.

Images are private files in `work\catalogue-images`; preserve that folder with the database when moving local data. Do not publish it as a static web directory. PostgreSQL data remains in the native service's data directory and survives stopping the application.

## Optional full local verification

The test setup creates/provisions only `stichbill_test`. Do not point it to another database:

```cmd
npm.cmd run db:test:setup
npm.cmd run ci:check
npm.cmd run verify
npx.cmd playwright install chromium
```

Browser tests must run against the test runtime, not your development database. Stop the API/frontend first. Temporarily preserve `.env` and use the restricted test runtime:

```cmd
copy /-Y .env .env.catalogue-dev-backup
copy /Y .env.test .env
npm.cmd run test:e2e
copy /Y .env.catalogue-dev-backup .env
```

Restore `.env` even if tests fail; never commit either file. Restart the API/frontend afterward. Do not proceed if the backup filename already exists: preserve it and choose another private name. Browser fixtures register synthetic accounts, exercise real PostgreSQL data and clean their own records. They are not production acceptance tests.
