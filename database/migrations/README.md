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
