# Task 003 Increment 3 — Shops, branches and staff access

Baseline: clean branch `task003-increment3-shop-staff` from merged main `77a539c`. Existing identity, tenancy, role and scope structures are extended, not replaced.

## Workflows

Owners create/edit shops with a code, name, address, business contact and active flag. Branches have a code, name, address and active flag and belong to one immutable shop. Existing tenant/shop code uniqueness and composite foreign keys remain authoritative. Deactivation is reversible; physical deletion is not exposed.

Owners add already registered accounts by email and display name, choose owner or cashier, and assign whole shops or individual branches. Staff register using the existing authentication flow and can stop before business setup. After access is added or changed they sign in again. Owners can edit roles/scopes or suspend/reactivate access. Changes revoke the affected membership sessions immediately, without revoking unrelated tenant sessions. Last-owner suspension/demotion is rejected, including concurrent changes.

The mobile management section includes lists, inactive-state labels, create/edit controls, empty/loading states, input validation and errors. Cashiers receive only their permitted active shops and branches and no staff-management controls. Browser-supplied IDs and role choices are always authorised by the backend.

## Migration and security review

Forward migration `20261103000200_organisation_access.sql`:

- Adds shop address/contact and branch address with bounded lengths. Existing records get empty strings rather than invented business data; new saves require details.
- Adds private `auth.access_events` with actor, subject, tenant, action, timestamp and resulting access settings. Runtime has no SELECT/INSERT/UPDATE/DELETE privileges on this table; only the reviewed staff command appends events atomically with its change. Database administrators/migrators remain trusted and can perform maintenance.
- Adds three constrained definer functions: `organisation_read`, `save_location`, `save_staff`. Each uses a fixed `pg_catalog` search path and qualified table names. Runtime receives only explicit EXECUTE. No new direct runtime write grants.
- All eight existing tenant FORCE RLS policies and resolver functions remain unchanged. Normal cashier reads preserve the existing active/scope restrictions. Owner management reads use an explicitly authorised, tenant-filtered function so inactive locations can be managed without broadening runtime read policies.
- All writers lock the tenant row and then revalidate the caller's current owner/session context. This serializes concurrent owner changes, scope replacement, location edits and revocation. Composite constraints reject foreign tenant/shop/branch assignments. The last-owner check counts active memberships with enabled identities.
- Exact new signatures, languages, volatility and body hashes are added to the security allowlist. Readiness requires the new schema; provisioning still recognises the exact earlier baseline for forward upgrade.

The organisation API lives within the existing authentication plugin and inherits its cookie, CSRF, Origin, no-store and error-redaction controls. Strict request schemas reject extra identity/permission fields. Transaction-scoped tenant context is required for every organisation read/write.

## Files

API: `organisation/routes.ts`, authentication route/contract integration, security checker and manifest. Frontend: new `Organisation.tsx` and `OwnerAccess.tsx` integration. Generated OpenAPI JSON and client declarations updated. Tests: new organisation integration suite, migration fixture/discovery updates, privilege/upgrade tests and extended mobile owner browser flow. This report is the only new documentation file.

## Verification

Local full verification: lint, workspace type checks/builds, 27 unit tests, 87 PostgreSQL integration/security tests, OpenAPI drift check, workflow validation and whitespace check. Browser tests cover owner lifecycle, shop/branch creation, deactivation, registered-staff addition and revocation on a mobile viewport.

Isolation tests cover actual foreign tenants/shops/branches, cashier restrictions, missing context, inactive visibility, immediate revocation, audit access denial, last-owner protection and concurrent owner changes. Existing authentication and tenant isolation suites remain intact. CI starts from a clean database; the disposable security suite additionally applies Increment 2 first, inserts a historical shop, upgrades, and asserts preservation of its name and default empty new fields.

Linux and native Windows CI results are recorded in the PR and final conversation report after running on the committed revision. Native Windows PostgreSQL setup and CI workflow remain unchanged. No new dependencies, provider, production credentials or deployment.

## Limits

Staff must already have an account; no invitation email delivery is introduced. Access changes require the affected staff member to sign in again, including an owner editing their own access. Addresses and business contacts are bounded free text; GST/tax details are deliberately absent. Historical addresses/contact details remain empty until edited. Audit viewing/retention and larger-tenant pagination are future work; this increment exposes no audit-edit API. Existing dependency findings and local recovery-delivery limitations from Increment 2 remain applicable. No products, inventory, billing or GST screens are added.

Stop for Project Manager review; do not merge or deploy.
