# Development roadmap

No application implementation is authorised by Task 001. Phase ordering is a dependency plan, not a delivery-date promise. Each phase ends with demonstrable persisted behaviour and a review. Security, backups, access controls and tests begin early; Phase 11 is the final readiness gate, not the first time these are considered.

| Phase | Scope / dependencies | Acceptance criteria |
|---|---|---|
| **0 Architecture and foundation** | This Task 001 documentation; PM/owner decisions and competitor/CA follow-ups. After approval, Task 002 scaffolds workspace/tooling. | All nine required docs reviewed; traceable unresolved gates; private repo. Foundation acceptance separately: clean Windows bootstrap, web/API health, lint/types/build and no production data. |
| **1 Authentication and tenant isolation** | Phase 0 approval; approved identity/tenant schema migrations; local email/reset approach. | Tenant A cannot read/write/export B via API or runtime SQL; membership/branch/role controls; login/logout/reset/revocation tests; migration rollback/forward-repair rehearsal. |
| **2 Products and inventory** | Phase 1; catalogue/stock migrations and costing approval. | Persist products/variants/prices/HSN and stock; exact variant barcode labels; import dry-run with rejected rows; opening stock/count/adjustment movement ledger reconciles; quantity constraints and concurrent adjustment tests. |
| **3 Billing and GST** | Phases 1–2; approved legal pack and document formats; minimal customer identity, receivable/advance/payment ledger from Phase 4 designed here; agreed printer. | Server-side finalisation atomically posts invoice/number/tax/stock/money; last-unit race and retries safe; three seller modes correct; holds, split payments, returns/notes/refunds, shifts, receipt PDF/PNG/manual share tested; no sample-data dependency. |
| **4 Customers and CRM** | Phase 3 money core; privacy/retention rules. | Customer history and size history sourced from real invoices; dues/advances/collections reconcile; estimates/deposits (if approved) separated from sales; contact/consent and customer export access tested. |
| **5 Purchases and suppliers** | Phase 2 stock/costing + Phase 3 tax/money; supplier/ITC schema approval. | PO→partial receipts→supplier invoice reconciles with no duplicate stock; purchase returns and supplier payments persist; duplicate vendor bill blocked; ITC eligibility review and payable ageing verified. |
| **6 Expenses and reports** | Phases 3–5 posted data; accounting definitions and date/period locks. | Expenses posted/audited; sales, collections, gross margin/COGS, expenses, outstanding, stock/dead-stock and GST exports reconcile to ledger; reports disclose accrual vs cash and provisional ITC; filters/exports tenant-scoped. |
| **7 Marketing and loyalty** | Phase 4 consent/customer data + Phase 6 segments; owner-approved communication channel, legal review. | Append-only points earn/redeem/reverse without overspending; campaigns recheck consent on send; birthdays/inactive reminders with opt-out; delivery retries deduplicated. WhatsApp API only after separate integration approval. |
| **8 Advanced retail workflows** | Phase 4 customer privacy, Phase 2 variants, Phase 3 returns. | Alteration jobs/tailor assignment/measurements restricted and auditable; promised date/handover tracked; customer size history. Payroll and fabric roll/metre are separate optional increments with their own financial/UOM tests. |
| **9 Multi-branch and SaaS administration** | Proven single-shop workflow; tenant/shop/branch foundations already exist; subscription policy. | Branch-scoped tills/reports; transfers through in-transit stock and costs reconcile; membership access tested; subscriptions/limits support non-destructive expiry; audited platform support. Cross-GSTIN transfers require CA-approved document flow before enabled. |
| **10 Offline billing** | Stable online commands/idempotency + registered devices; approved legal numbering/receipt/conflict policy. | Queued transactions survive restart; same device ID/transaction never posts twice; reconnect conflicts visible and resolved; server stock authoritative; fiscal/tax-rule boundary cases tested. No offline claim before supported-flow browser/device testing. |
| **11 Production readiness** | Applicable phase acceptance, CA approval, Oracle capacity/budget, domain/email/security choices. | Production-like load and isolation review, restore drill meeting approved RPO/RTO, signed migrations/release plan, hardware tests, monitoring/incident/recovery runbooks, pilot UAT and explicit deployment approval. |

## Milestones and scheduling
Pilot can follow Phases 1–4 only after the applicable Phase 11 readiness controls, and only for shops whose statutory requirements are fully supported. Broader rollout adds Phases 5–9; offline is independent optional scope. No live billing simply because Phase 3 UI renders. Scope estimates should follow approved Task 002 and a vertical-slice implementation; this document gives no unsupported calendar/cost promises.

## Important dependencies
- Financial ledger and minimal customer records must exist for split/credit/refund/advance flow in Phase 3; the Phase 4 label does not defer integrity work.
- Product HSN metadata is Phase 2; approved rates/registration rules are Phase 3. No guessed production GST seed.
- Returns and invoice snapshots exist before loyalty so point reversals have authoritative source events.
- Goods receipts and purchase invoice matching precede credible profit/ITC/ageing reports.
- Multi-branch schemas/RLS are designed from day one; multi-branch features are validated later.
- External services remain adapters. Oracle, SMTP, storage, WhatsApp API and payment processors require separately approved credentials/configuration; no paid service is mandatory in Task 001.
- Competitor URL verification is a documentation follow-up, not a prerequisite to the core financial architecture. CA/legal validation is a prerequisite to applicable production billing.

## Exact next implementation task — TASK 002
**Title:** Create the new STICH BILL monorepo foundation and reproducible Windows development workflow.

Start only after Project Manager approval of Task 001. Work in this new repository; do not import old app source. Deliver npm workspaces, pinned compatible toolchain, React/Vite/TS/Tailwind shell with accessible empty state, NestJS/Fastify API with health endpoint, generated OpenAPI client contract, shared lint/TS configuration, local PostgreSQL service definition and documented PowerShell-friendly setup, `.env.example`, test harness, CI and migration runner configuration. No retail screen mockups, migrations applied, production database connection or deployment. Database connectivity checks use an explicitly approved isolated development database; schema migration proposals are reviewed before execution.

Acceptance: clean checkout can install with lockfile and build/test web+API; health endpoint responds; UI displays real API health; environment variables validated without secrets; local prerequisites/errors documented; no external paid dependency; no deployment. Provide command evidence and consistency review, then commit. Identity and actual tenant migrations belong to the subsequent Phase 1 task after their review/approval.
