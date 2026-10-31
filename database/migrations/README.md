# Reviewed local migrations

Task 003 increment 1 introduces `20261031000100_access_foundation.sql`: global identity/session persistence, tenant/shop/branch memberships and read isolation. This is not a retail schema. Runtime has SELECT only on scoped organisation tables; authentication/session issuance and business-write commands are not exposed yet.

## Roles and trust boundary

For each dedicated local database, `_migrator` owns schemas/tables/functions and `_runtime` has no ownership, superuser, BYPASSRLS, role membership or schema-create privileges. Bootstrap administrator credentials are separate from both. Runtime environment contains only its connection URL.

All eight tenant tables ENABLE and FORCE RLS. Explicit migrator policies allow reviewed maintenance and narrowly scoped SECURITY DEFINER session/scope resolution. These functions pin search_path, qualify names, accept no dynamic SQL and deny PUBLIC execution. Global auth tables and migration history are not runtime-readable. Session queries validate token hash, identity, tenant, membership, both expiries and both revocations. Context is SET LOCAL in the same transaction as the business read and rechecked by RLS. RLS protects against omitted predicates; it is not a boundary against a fully compromised application possessing valid session secrets.

The fixed owner/cashier codes are the initial role subset. Owners read all active tenant locations; cashiers read their explicitly assigned locations and their own membership metadata. No runtime INSERT/UPDATE/DELETE is granted yet. Rich permission catalogues, write policies, audit events and protection of the final owner belong with command endpoints in subsequent increments.

## Execution and recovery

Use `npm run db:migrate:local` only after local role provisioning and review. The wrapper explicitly enables ALLOW_MIGRATIONS=true and --approve-local-migrations. API startup, install and builds do not migrate. Test integration is separately restricted to stichbill_test and is authorised to apply reviewed migrations there.

The Kysely-based runner uses one transaction/advisory lock, SHA-256 history and non-superuser migrator enforcement. It rejects changed/missing applied files and out-of-order additions. Failed DDL and its history row roll back together. SQL names must use YYYYMMDDHHMMSS_description.sql; line endings are LF. No automatic down/reset/drop command exists. Use reviewed forward repairs after committed schema changes. Production migration/backups remain out of scope.

The first schema is intentionally a subset: credential/reset tables, business profile details, timestamps/audited command writes, tax registrations and onboarding services are still pending. Do not treat fixture SQL as an owner-registration mechanism. No real accounts or default passwords are seeded.

## Exact local privilege contract (security correction)

- Administrator: the dedicated database owner and a login superuser (native installer postgres or isolated Docker/CI bootstrap account). Its connection is CLI/test-only, never in runtime configuration. The administrator is a trusted root and can change PostgreSQL itself; these checks do not claim to contain a compromised superuser. Provisioning verifies that the connected administrator matches the database owner.
- Migrator: database-specific login, NOINHERIT/NOSUPERUSER/NOBYPASSRLS/NOREPLICATION/NOCREATEDB/NOCREATEROLE, no role memberships in either direction or role settings. CONNECT/CREATE on the dedicated database; owns public/auth schemas, protected tables/indexes and the three reviewed resolver functions. Explicit maintenance RLS policies permit reviewed migrations. No database ownership.
- Runtime: same restricted attributes, no role memberships or ownership. CONNECT only on the dedicated database; USAGE only on public/auth; SELECT only on the eight tenant tables; EXECUTE only on the three reviewed resolver functions. No table/column writes, TRUNCATE, grant options, direct authentication/history reads or executable extra user functions.
- PUBLIC: no dedicated database access, no table or function grants; the PostgreSQL public schema's existing USAGE-only default remains (never CREATE). Schema USAGE alone grants no table access.

The shared catalog validator checks exact grants/grantors, all column ACLs, protected object ownership, role flags/membership, function bodies/signatures/search_path, exact policy expressions/roles/commands and ENABLE/FORCE RLS on every tenant table. Readiness requires the corrected global function-default ACL. Future approved schema/function changes must update this explicit allowlist with their migration. PostgreSQL 17 policy deparsing is the supported baseline.

`20261031000300_function_defaults.sql` globally revokes PUBLIC EXECUTE defaults for the actual creating migrator, without modifying the already-applied original SQL. Existing functions retain explicit runtime execution. The regression suite creates a subsequent function and verifies effective PUBLIC/runtime denial and owner execution, including an actual rejected runtime call.
