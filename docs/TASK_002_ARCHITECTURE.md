# Task 002 — foundation decisions and architecture corrections

Task 002 is approved for monorepo/development foundation only. No identity/business schema, authentication, retail screens, migration execution or deployment is included. Task 001 documents are retained; the corrections below supersede ambiguous notation before any future database implementation.

## Required architecture corrections
1. **Membership uniqueness:** use UNIQUE(tenant_id, identity_id). One global identity can have memberships in many tenants, but at most one membership per tenant. Never use global UNIQUE(identity_id) on memberships. Roles and branch scopes are separate membership relationships.
2. **Session separation:** global identity_sessions authenticates the identity before/independently of tenant selection. Tenant-scoped membership_sessions contains tenant_id, membership_id and identity_session_id referencing that global session; membership_id is mandatory. Tenant activation rechecks membership and scopes. Revoking the global session invalidates its membership contexts; revoking one membership does not erase unrelated tenants. The former generic tenant `sessions` name is replaced in the logical design. No tables are created now.
3. **Client transaction identifiers:** UNIQUE(tenant_id, client_transaction_id), not globally unique across tenants. Idempotency keys are likewise scoped by tenant and operation. UUID generation reduces collision risk but does not replace tenant scope or server authorisation.
4. **GST registrations:** retain multiple tax_registrations per tenant, with effective-dated registration periods and explicit shop/legal seller assignment. There is no UNIQUE(tenant_id) constraint on tax_registrations. Invoice number/rule contexts follow the chosen registration, not merely the tenant.

## Foundation choices
- Node 24.19.0 and npm 11.9.0 are exact pins. npm engine-strict fails early on unsupported versions. Package versions are exact; package-lock.json locks transitives.
- React 19.3.1, Vite 8.3.5, TypeScript 5.9.3, Tailwind 4.3.3; NestJS 12.3.2/Fastify 5.12.7, Swagger 12.0.5. TypeScript 5.9 is compatible with the selected Swagger and ESLint peers; TypeScript 7 is deliberately not selected.
- Native ESM throughout the API/tooling; `.js` relative import specifiers allow emitted Node code to run directly. Explicit Nest injection tokens also support tsx development execution.
- npm workspaces with shared compiler and ESLint configuration. Worker/domain packages are empty typed boundaries, not business implementations.
- Fastify liveness `GET /api/v1/health` indicates API process availability. Readiness `/api/v1/health/ready` executes SELECT 1 through Kysely and returns 503 with a redacted message if PostgreSQL is unavailable.
- The React page calls the generated typed OpenAPI client through Vite's `/api` proxy. It displays actual API/database status and retry state, including outage state. No CORS wildcard or browser database credentials.
- OpenAPI generation builds metadata without querying PostgreSQL. The JSON contract and generated TypeScript declarations are committed; CI regenerates and rejects drift.
- PostgreSQL 17.6 development service, persistent named volume, loopback-only exposed port. No init SQL, tables, migrations or seeds. No production DB URLs accepted by current configuration.
- SQL migration provider is configured with Kysely's `kysely/migration` entrypoint. Reviewed future SQL names are ordered, and actual execution requires two explicit opt-in gates. No migration execution in install/start/build/tests/CI.
- Native Node test runner covers environment/health/provider logic. Real PostgreSQL integration performs read-only checks and verifies an empty public schema. Playwright checks the browser against the real API plus explicit outage handling.
- Linux CI runs full verification with isolated PostgreSQL. Windows CI runs clean install/build/unit/OpenAPI/browser verification with DB intentionally unavailable, exercising a truthful degraded status. Docker/PostgreSQL instructions on Windows are documented; a running Windows PostgreSQL service is not claimed tested by that job.

## Scope and next gate
No business implementation, paid service, Oracle provisioning, marketing website edit or live Firebase interaction. Task 003/Phase 1 requires PM review of Task 002 and explicit migration approval. Add identity/session/RLS DDL only in that approved task.
