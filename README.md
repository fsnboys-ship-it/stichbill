# STICH BILL

New clothing-retail SaaS, built from scratch. **Task 003, increment 1: access persistence and tenant isolation.** No old application source is reused; Task 001/002 documentation is preserved as historical delivery records.

## Quick start

Prerequisites: Node **24.19.0**, npm **11.9.0**, and local PostgreSQL **17**. Docker is optional. Follow the [native Windows setup](docs/WINDOWS_SETUP.md) to create the dedicated local database and configure its administrator connection. Then, from repository root:

```powershell
npm.cmd ci
npm.cmd run setup:db-env
npm.cmd run db:provision
npm.cmd run db:migrate:local
npm.cmd run db:check
npm.cmd run db:test:setup
npm.cmd run dev
```

On the machine running development, open port 5173. The frontend reads real API health and PostgreSQL readiness through the local Vite proxy. Full [Windows PowerShell instructions](docs/WINDOWS_SETUP.md) include URLs, native PostgreSQL alternative, port configuration and troubleshooting.

```powershell
npm.cmd run verify
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

## Workspaces

- `apps/web`: React/Vite/TypeScript/Tailwind status page.
- `apps/api`: NestJS/Fastify, liveness/readiness, Swagger and environment validation.
- `apps/worker`, `packages/domain`: reserved empty typed boundaries.
- `packages/api-client`: committed OpenAPI contract and generated typed fetch client.
- `packages/config`: shared TypeScript and ESLint configuration.
- `database/migrations`: reviewed access schema, FORCE RLS and separate migration history; `database/seeds`: no business data.
- `tests/integration`, `tests/e2e`: real database/API and browser checks.
- `infra/local`: loopback PostgreSQL development service; `infra/oracle`: reserved documentation only.

## Architecture and reviews

[Task 002 decisions/corrections](docs/TASK_002_ARCHITECTURE.md) · [Task 002 delivery report](docs/TASK_002_REPORT.md)

Task 001: [Product](docs/PRODUCT_REQUIREMENTS.md), [Architecture](docs/TECHNICAL_ARCHITECTURE.md), [Database](docs/DATABASE_DESIGN.md), [GST](docs/GST_DESIGN.md), [Security](docs/SECURITY_PLAN.md), [Competitors](docs/COMPETITOR_FEATURE_MATRIX.md), [Testing](docs/TESTING_STRATEGY.md), [Roadmap](docs/DEVELOPMENT_ROADMAP.md), [Decisions](docs/ARCHITECTURE_DECISIONS.md), [historical report](docs/TASK_001_REPORT.md).

Increment 1 has no password login, cookie/reset flow, organisation write APIs or setup screens yet. Runtime access is read-only and session-validated. The migration runner applies approved local schema explicitly; integration tests apply it only to the isolated test database. Production databases are rejected. Never commit `.env`, `.env.db` or test credential files. No products, inventory or deployment are included. Stop for PM review before the next increment.
