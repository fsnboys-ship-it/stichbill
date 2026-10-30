# Task 002 — delivery report

Status: foundation implemented; application business features remain out of scope. Repository: https://github.com/fsnboys-ship-it/stichbill. Task 001 documentation was copied from the previously committed local documentation repository and retained; DATABASE_DESIGN.md received the four requested clarifications, not schema execution.

## Files created

- Root npm workspace manifests/lockfile, exact Node/npm pins, shared lint entrypoint, environment example, ignore/line-ending rules and developer README.
- apps/web: React/Vite/TypeScript/Tailwind health page, status/outage/retry behaviour and local API proxy.
- apps/api: NestJS/Fastify application, liveness/readiness controllers, environment validation, Kysely connection/probe, explicitly guarded SQL migration provider/runner and OpenAPI generation.
- packages/config: shared TS base/Node configs and ESLint flat configuration; packages/api-client: OpenAPI JSON, generated declarations and typed fetch client.
- apps/worker and packages/domain: typed empty workspace boundaries, with no jobs or domain implementation.
- database/migrations and database/seeds: explanatory README files only, no executable SQL or seeds.
- tests/unit: configuration, injected API probe/response and migration-file provider tests; tests/integration: real read-only PostgreSQL/API readiness checks; tests/e2e: browser status, outage and mobile width checks.
- infra/local/compose.yaml: local PostgreSQL service with named volume and loopback binding; infra/oracle/README.md: reserved only.
- scripts: non-overwriting local environment setup, cross-platform native test launcher, OpenAPI drift check and CI structural validation.
- .github/workflows/ci.yml: Linux PostgreSQL verification and Windows install/build/unit/browser checks, official Actions pinned by commit SHA, read-only GitHub permissions.
- docs/WINDOWS_SETUP.md and docs/TASK_002_ARCHITECTURE.md: executable setup instructions, version/architecture choices and mandatory future schema corrections.

## Decisions and exact setup

See [Windows setup](WINDOWS_SETUP.md) and [Task 002 architecture](TASK_002_ARCHITECTURE.md). Commands from repository root with Node 24.19.0/npm 11.9.0:

```powershell
npm.cmd ci
npm.cmd run setup:env
npm.cmd run db:up
npm.cmd run db:check
npm.cmd run dev
```

Second terminal: `npm.cmd run verify`, `npx.cmd playwright install chromium`, `npm.cmd run test:e2e`. Full instructions explain native PostgreSQL alternatives and port conflicts. No migration command is part of setup or CI.

## Verification evidence

Local Linux environment: frozen `npm ci` passed; lint, workspace typechecks and all builds passed; OpenAPI generation/drift check passed. Native test runner: 17 passed, 0 failed/skipped. Real PostgreSQL integration: 2 passed, 0 failed/skipped, including empty public schema assertion. Dependency audit reported zero advisories at verification time. Workflow YAML/command references and no-migration/no-deployment checks passed.

Local Playwright browser suite: 3 passed, 0 failed/skipped (real API/database status and refresh, simulated API outage, mobile layout). Hosted CI execution is pending the first push; it will be recorded in the final delivery update and GitHub Actions. Workflow: https://github.com/fsnboys-ship-it/stichbill/actions/workflows/ci.yml. CI contains no deployment or migration steps. Do not infer Windows results merely from Linux tests.

## Security observations

No secrets are tracked; .env remains ignored, generated local password is never printed, public client configuration contains no DB credentials. CI/database test credentials are disposable local fixtures. API and DB bind loopback; only development/test and local named PostgreSQL databases are allowed. Readiness errors omit database details. SQL uses bound queries except reviewed migration-file text behind execution gates. Production deployment/auth/security hardening belongs to future approved work. PostgreSQL volume persistence is preserved by db:down; there is no reset/drop script.

## Known limits and scope

No authentication, retail screens, business tables, migration execution, worker jobs, production DB connectivity, paid integrations, offline billing or deployment. Database readiness is a simple SELECT 1, not a business schema compatibility guarantee. Domain/worker packages are boundaries only. UI uses local Vite proxy; production hosting is not configured. Windows CI deliberately tests unavailable-DB state; Windows Docker Desktop/native PostgreSQL setup still needs validation on the owner's machine. Actual PostgreSQL integration is exercised on Linux.

PostgreSQL image and dependency versions are pinned for reproducibility, not forever exempt from patch review. Generated API declarations are reviewed/committed with the OpenAPI contract. Future migrations require approval and extension of the production migration integrity/recovery policy.

Membership uniqueness is tenant-scoped; global authentication sessions and tenant membership sessions are separated; client transaction IDs are tenant-scoped; multiple GST registrations are retained per tenant. These are documentation corrections only.

## Git and next gate

Use `git log -1 --format=%H` for the exact checkout commit; the final delivery message identifies the reviewed commit SHA. Stop after Task 002 for PM review. No Phase 1 identity/database implementation is authorised by this delivery.
