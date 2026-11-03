# Task004 — Product Catalogue Increment1

## Delivery baseline

Repository `fsnboys-ship-it/stichbill`; branch `feature/task-004-product-catalogue-increment-1` starts at latest fetched main `873ec79`. Existing preview changes are preserved privately in a Git stash. Task007 PR #4 remains open/draft at `8135a30963c26467b0f42409f81aa7852ea18292`; it was neither merged nor used as the feature base. No deployment, cloud provisioning, production mutation, Firebase or Docker execution.

## Implemented behavior

Owners create/edit/deactivate tenant categories, brands and products, assign products to shops, create multiple initial size/colour variants atomically and maintain individual variants afterward. Product details show descriptions, HSN classification metadata, private images, exact decimal prices and barcode aliases. Search covers product text, style, SKU, size, colour and aliases; category/brand/status filters and 20-item pagination use real APIs. Owners can reactivate records; physical deletion is not exposed.

The mobile-first burgundy/cream catalogue has loading, empty, success/error, conflict handling, labelled forms and keyboard controls. Owner sessions restore after reload. Cashiers get only active records in an authorised shop/branch, with no cost-price field or write controls. Existing owner onboarding, shops, branches, staff and password recovery are preserved.

## Migration and security contracts

New forward migration: `database/migrations/20261103000300_product_catalogue.sql`. The previous four migration files and checksums are unchanged. Nine new tables: public `categories`, `brands`, `products`, `product_shops`, `product_variants`, `variant_barcodes`, `catalogue_prices`, `product_images`; private `auth.catalogue_events`. All enable and FORCE RLS. Composite tenant keys/FKs prevent cross-tenant associations. Case-normalized unique constraints protect category/brand names, style codes, SKUs and size/colour combinations. Barcode aliases remain reserved after deactivation; leading zeroes survive.

Three fixed-search-path SECURITY DEFINER functions (`auth.catalogue_scope`, `auth.catalogue_read`, `auth.catalogue_save`) use the existing authenticated tenant/membership/session context. A frontend tenant UUID is an untrusted resource selector; database session resolution authorises it. Product access also requires an active assignment to the selected authorised shop. Branch-only cashiers cannot omit the branch to gain whole-shop access. Products are shared tenant masters with shop assignments; they are not separate per-branch inventory records.

Runtime retains SELECT only on allowed metadata, EXECUTE only on allowlisted functions, and no direct writes. Cost prices and audit events have no runtime table grants. Only owners receive cost prices through the read function. Command transactions validate ownership, scope, actor, active associations and optimistic versions, lock the tenant during writes, and append before/after audit JSON. Existing RLS/SECURITY DEFINER functions and role flags/grantor rules are unchanged. Readiness extends exact function hashes, ACLs, policy definitions, FORCE RLS and table/function allowlists; private audit policies are inspected too. Provisioning still accepts the exact known earlier migration baseline to allow the forward upgrade.

Prices are `numeric(20,6)` and JSON decimal strings, with bigint validation/display; no floating-point money calculations. Negative, malformed, overprecision and selling-above-MRP amounts fail. One current price applies to all assigned shops; audited edits preserve change history. HSN is metadata only, with no GST calculations.

Images use the previously documented private local-volume architecture (no existing storage adapter existed). PNG/JPEG/WebP only, <=2MiB, <=4096x4096; UUID paths, SHA256 integrity, no public static directory, authenticated RLS-checked reads, private/no-store/nosniff responses, exclusive writes and rollback cleanup. Unix files/directories use 0600/0700; Windows access also depends on the user's NTFS ACLs. Back up `work/catalogue-images` alongside the database. No cloud image service was introduced.

## Changed files

- Database: new catalogue SQL; `apps/api/src/database/security.ts`, `security-manifest.ts`.
- API: `apps/api/src/catalogue/{validation,routes,storage,contract}.ts`; registration in `app.ts`, `auth/routes.ts`; `apps/api/package.json`, root lockfile (`image-size` pure JavaScript).
- Web: `Catalogue.tsx`, `ProductEditor.tsx`, `catalogue-model.ts`, `OwnerAccess.tsx`, `styles.css`.
- Contract: `packages/api-client/openapi.json`, `packages/api-client/src/schema.d.ts` regenerated.
- Tests: new unit/integration/browser catalogue tests; existing database/security/migration-provider fixtures extended.
- CI: `.github/workflows/ci.yml`, `scripts/start-ci-postgres.mjs`, `scripts/check-ci.mjs`: native PostgreSQL17 on Linux instead of a container service; existing native Windows workflow retained.
- Documentation: README, this report and `docs/TASK_004_RUN_WINDOWS_CMD.md`.

## Verification

Executed locally against an isolated **native PostgreSQL17.11** cluster on loopback port55434, dedicated development/test databases and separate runtime/migrator credentials. Earlier failing assertions were corrected, including old table counts and browser locator assertions; final results below describe reruns, not the initial failures.

| Check | Result |
|---|---|
| CI configuration validation | PASS |
| ESLint | PASS |
| TypeScript all workspaces | PASS |
| API/client/domain/worker/web production builds | PASS |
| Unit tests | PASS —31/31 |
| PostgreSQL integration/security regression tests | PASS —120/120 |
| Migration checksums, rollback and tamper rejection | PASS, included in integration suite |
| Catalogue API/RLS/owner/cashier/validation/images | PASS,11 integration tests including parent |
| OpenAPI generated contract parity | PASS |
| Browser/component form integration | PASS —5/5, including mobile catalogue forms, images, edits, persistence and cashier view |
| Hosted Linux/native Windows CI | Pending PR run |
| Windows CMD manual walkthrough on a user PC | NOT RUN in this Linux workspace; commands documented |
| Production/cloud acceptance | NOT RUN; outside this local increment |

Negative tests exercise cross-tenant and cross-shop IDs, branch bypass, direct runtime writes, private-price/audit reads, missing context, forged JSON permissions, CSRF/origin checks, duplicate aliases/SKUs/combinations, atomic rollback, stale updates and invalid money. Security mutation tests reject missing FORCE RLS, extra policies/grants, altered search_path and PUBLIC EXECUTE without repairing the unexpected state. Browser tests use real HTTP/cookies/forms/PostgreSQL, rather than mocked components.

## Remaining limits and review items

No stock, billing, purchases, customer, offline, GST, hardware or subscription functionality was added. Historical master data and inactive aliases are retained deliberately. Crash between private file creation and DB commit can leave an unreferenced private image file; no automatic garbage collector is included. Replaced images remain private historical files. Image validation checks format headers/dimensions rather than re-encoding pixels; corrupt images with plausible headers can still fail browser rendering. Production volume durability, malware/re-encoding pipeline and cloud storage remain future operational work.

The existing main local database-owner model is preserved; the unmerged Task007 NOLOGIN staging design requires separate integration/review later. Real SMTP provider delivery and real cloud restore drills remain staging acceptance gates from Task007, not claims made by this increment. Product prices are common across assigned shops; per-shop pricing is not implemented.

Follow [the exact Windows CMD setup and walkthrough](TASK_004_RUN_WINDOWS_CMD.md). No seeded user passwords or real credentials are committed. Application verification in the workspace does not mean it is running on the user's PC or published online.
