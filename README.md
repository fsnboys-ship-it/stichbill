# STICH BILL

New clothing-retail SaaS, built from scratch. **Task 002: monorepo and local development foundation.** No old application source is reused; Task 001 documentation is preserved.

## Quick start

Prerequisites: Node **24.19.0**, npm **11.9.0**, Docker with Linux containers. From repository root:

```powershell
npm.cmd ci
npm.cmd run setup:env
npm.cmd run db:up
npm.cmd run db:check
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
- `database/migrations`, `database/seeds`: documentation only; no SQL or business data.
- `tests/integration`, `tests/e2e`: real database/API and browser checks.
- `infra/local`: loopback PostgreSQL development service; `infra/oracle`: reserved documentation only.

## Architecture and reviews

[Task 002 decisions/corrections](docs/TASK_002_ARCHITECTURE.md) · [Task 002 delivery report](docs/TASK_002_REPORT.md)

Task 001: [Product](docs/PRODUCT_REQUIREMENTS.md), [Architecture](docs/TECHNICAL_ARCHITECTURE.md), [Database](docs/DATABASE_DESIGN.md), [GST](docs/GST_DESIGN.md), [Security](docs/SECURITY_PLAN.md), [Competitors](docs/COMPETITOR_FEATURE_MATRIX.md), [Testing](docs/TESTING_STRATEGY.md), [Roadmap](docs/DEVELOPMENT_ROADMAP.md), [Decisions](docs/ARCHITECTURE_DECISIONS.md), [historical report](docs/TASK_001_REPORT.md).

No authentication, retail screens, business tables, migration execution or deployment in Task 002. Production databases are rejected by the development configuration. Never commit .env. The migration runner is reserved for future approved work and is not invoked by startup, tests or CI.
