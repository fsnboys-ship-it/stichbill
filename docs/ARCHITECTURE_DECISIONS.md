# Architecture decisions and approval register

Status meanings: Confirmed = supplied by owner; Proposed = design recommendation awaiting PM approval; Deferred = deliberately unimplemented. Task 001 documents choices without granting deployment or database-change approval.

| ADR | Status | Decision / reason / consequence |
|---|---|---|
| 001 | Confirmed | New private repository; no reuse of old app source. Existing app informs requirements only. |
| 002 | Confirmed | React/Vite/TypeScript/Tailwind + NestJS REST + PostgreSQL modular monolith. One transactional boundary keeps sales/stock/money consistent. |
| 003 | Proposed | npm workspace monorepo, Node 24 LTS, PostgreSQL 17, Kysely/node-postgres, SQL migrations. Pin supported patch versions in Task 002. |
| 004 | Proposed | Tenant → shop → branch, separate effective-dated tax registration. A tenant is not assumed to have one GSTIN. |
| 005 | Confirmed | Backend permission enforcement plus PostgreSQL FORCE RLS; composite tenant foreign keys. Frontend guards are convenience only. |
| 006 | Proposed | Decimal domain arithmetic, integer paise posting, append-only stock and balanced money journals; atomic posting and idempotency. |
| 007 | Proposed | Perpetual moving weighted-average cost per branch/variant; snapshot sale COGS, return at original cost; no negative stock default. CA/owner approval needed before Phase 2 valuation implementation. |
| 008 | Confirmed | Effective-dated configurable GST; Regular/Composition/Unregistered. Composition Scheme is distinct from composite supply. |
| 009 | Proposed | First-party sessions/password auth; PostgreSQL sessions/outbox. OAuth, external email/SMS and payment processors are separate later decisions. |
| 010 | Confirmed | Online-first. Offline only Phase 10 with device IDs and idempotent commands designed now. |
| 011 | Proposed | Private document storage abstraction and worker PDF/PNG rendering; separate social/review URLs alongside PNG because image pixels are not hyperlinks. |
| 012 | Confirmed | Oracle target, Windows development, separate marketing website. No deployments/services purchased during Task 001. |
| 013 | Proposed | Manual WhatsApp sharing first; consent-led automated API delivery later. No bulk sending from personal WhatsApp accounts. |
| 014 | Proposed | Initial one-shop/branch pilot; tenancy and permissions are structural from Phase 1; multi-shop checkout deferred. |
| 015 | Proposed | Production gate blocks unsupported statutory requirements, including e-invoicing if applicable to the pilot taxpayer. No generic “GST compliant” claim from a UI. |
| 016 | Proposed | Architecture uses payment allocations and append-only financial subledger; full statutory accounting/general-ledger product is out of scope. |

## Owner/PM decisions and default proposals
| Decision | Proposal | Must resolve by |
|---|---|---|
| First pilot shops, volumes and registration modes | Clothing retailer, 1 branch, 2 cashier stations; load envelope 50k variants/tenant and 20 concurrent checkouts for tests | Phase 1 capacity fixtures / Phase 3 pilot |
| Tax validation owner | Appoint CA; approve rule sources, states, invoice formats, HSN/rates, rounding and reports | Before Phase 3 legal fixture approval |
| Refund/discount/credit controls | Owner approvals for refund, manual price overrides and above-limit discounts; no negative stock | Phases 2–3 |
| Offline expectation | Confirmed deferred; visible connectivity state and safe retry only | Already set |
| Invoice/label hardware | 80mm thermal + A4 PDF initially; validate 58mm and label model if required | Phase 2 labels / Phase 3 print |
| Local language | English initial, translatable strings; Hindi/Malayalam based on pilot | Phase 2 UI |
| Costing and purchase backdating | Moving weighted average, closed periods reject backdating, return original COGS | Phase 2 |
| Customer privacy/retention | Minimise data, optional DOB/measurements, statutory finance retention override with CA review | Phases 1/4 |
| New offers | Estimates/deposits, import and stocktake included as proposed; AI/ecommerce/combined checkout deferred | Roadmap acceptance |
| Oracle reliability/budget | Single VM pilot; off-VM encrypted backups; no guaranteed zero cost | Phase 11 |
| Subscription/trial limits | Entitlement model now; prices, billing provider and expiry grace UX later | Phase 9 |
| Repository | Private `fsnboys-ship-it/stich-bill` under connected owner; no old repositories deleted | Task 001 |

## Evidence and outstanding validation
Two competitors have verified public feature claims; three competitor identities/features remain unverified. Retrieved official legacy invoice and composition-rules material inform the design but current notifications, numeric thresholds and all amendments are not fully validated. See GST_DESIGN and COMPETITOR_FEATURE_MATRIX. No hardcoded production tax seed is authorised.

Approval record: PM pending; Product Owner pending; CA pending. Task 002 requires explicit PM approval. No implementation approval is inferred from publishing the earlier cloud environment.
