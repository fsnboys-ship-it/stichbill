# TASK 001 final report

Date: 30 October 2026. Status: architecture/documentation delivered for PM review; implementation is not started. All architecture remains a proposal except owner-confirmed stack/scope. No live database or infrastructure has been changed.

1. **Architecture selected:** React/Vite/TypeScript/Tailwind, NestJS REST modular monolith, PostgreSQL. A single transactional database permits atomic sale/stock/tax/money operations. Proposed npm workspace structure, explicit SQL/Kysely, PostgreSQL outbox/sessions and private document rendering avoid mandatory paid services and unnecessary distributed systems. Windows development and future Oracle deployment are designed, not executed.
2. **Repository structure:** new private repository with docs only; proposed future apps/web, apps/api, apps/worker, packages/domain, packages/api-client, database/migrations, tests, infra/local and infra/oracle. Marketing stays separate. See TECHNICAL_ARCHITECTURE.md.
3. **Database:** DATABASE_DESIGN.md contains the full proposed logical table/column catalog, composite tenant keys/FKs, unique/exclusion/check constraints, indexes, RLS design, transaction boundaries, retention and core ER diagram. Covers identities, shops/branches, variants, financial documents, tax snapshots, money journals, stock, suppliers/purchases, CRM, consents, marketing and subscriptions plus future alteration/payroll/textile entities. It is not an executable/approved migration.
4. **GST:** configurable effective-dated rules and registration modes; frozen invoice snapshots; correct document categories for Regular, Composition and Unregistered. Composition liability is separate from customer tax; ITC is reviewed, not inferred. Numeric rates/limits are not seeded or hardcoded. Legal-pack source checking and CA sign-off remain required; current regulatory validation is incomplete, explicitly documented in GST_DESIGN.md.
5. **Competitors:** Sellbii and HisabLekha primary pages supplied public feature evidence. SutriSoft, Kapda Stock and RetailNode Bills remain unverified because candidate domains could not be read/identified and searches yielded no dependable evidence. The matrix includes source URLs/excerpts for every attributed feature, grades, qualifiers and research limits. Public feature claims were not hands-on tested.
6. **Newly identified features/issues:** import dry-run, estimates/deposits, stocktake, ageing basis, original-cost return disposition, accounting-period locks, explicit payment allocation and printer validation. PNG cannot contain clickable social links: share the image with separate text URLs or a linked HTML/PDF receipt. AI, ecommerce federation and combined cross-shop checkout are postponed.
7. **Security risks:** tenant/branch leakage, staff escalation, double posting, last-unit races, over-refunds, immutable-document tampering, public links, renderer SSRF, consent misuse and recovery/migration failures. SECURITY_PLAN.md specifies controls and required evidence; no security completion claim is made.
8. **Dependencies:** current CA-approved tax/legal pack, approved migration scopes, explicit tenant/role/costing rules, Windows toolchain, agreed printers/scanners, isolated test database and reproducible CI. Oracle budget/capacity, SMTP/storage and marketing API choices are future deployment gates. Core payment/CRM ledger precedes Phase 3 even though full CRM comes in Phase 4.
9. **Open owner decisions:** approve pilot scope/volumes and costing, CA reviewer, return/credit/discount policies, printer models/language, privacy/retention, Oracle recovery targets/budget and subscription plan. Supply official URLs for the three unverified competitors if available. These do not require inventing facts or making unrelated changes now.
10. **Exact next task:** TASK 002 monorepo/dev tooling/API-health foundation described in DEVELOPMENT_ROADMAP.md. No application implementation, schema application or deployment before explicit PM approval.

## Validation performed for documentation
- Checked required nine deliverables, local links, document consistency and scope boundaries.
- Confirmed cited excerpts against retrieved source text and captured text hashes/provenance in research/SOURCE_REGISTER.md.
- Reviewed money, tax, numbering, RLS, lifecycle and phase dependencies across documents.
- No application tests, migrations or production verification performed because no application is built in this task.

## Remaining research limits
A complete five-competitor factual comparison and current consolidated statutory validation are not claimed. Exact official competitor identities and a current notification-backed CA rule pack remain follow-up requirements. No production release may bypass the applicable legal/security/restore gates.

Stop after Task 001. Await Project Manager approval before Task 002.

## Git delivery status

The documentation was reviewed and committed in the new local Git repository at `/workspace/stich-bill`. Creation of `fsnboys-ship-it/stich-bill` as a private GitHub repository was attempted with the existing connected account. GitHub returned `Resource not accessible by integration (createRepository)`. No remote repository was created and no push occurred. This is a GitHub integration permission limitation, not a rejected cloud sandbox approval.

Required owner action: create an empty **private** GitHub repository named `stich-bill` (without an initial README/license/gitignore) under the desired account and provide its URL. Then remote access can be checked and the reviewed local commits pushed. Do not provide a token/password in chat. Repository metadata/configuration publication was not changed as part of this task.
