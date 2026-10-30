# Testing strategy

Task 001 produces a test design, not application test results. Tool proposals: Vitest for pure domain/web logic, Nest testing + real PostgreSQL integration tests, Playwright for browser flows, k6 for bounded load. Select/pin compatible versions in Task 002. Do not mock PostgreSQL to claim RLS or concurrency correctness.

## Test layers
- Domain: money/discount/tax/quantity algorithms, effective-date rule resolution, state transitions, permission predicates and original-cost returns. Include property tests for conservation of money/stock and deterministic allocation.
- Integration: migrations, constraints/triggers, RLS, transaction rollback, row-lock races, idempotency, outbox, private file metadata and journal balance using the runtime DB role.
- API: complete permission matrix, input/schema validation, rate limits, tenant scope and OpenAPI contract compatibility.
- End-to-end: owner setup, cashier login, scanner input, split sale, receipt/PNG/PDF, hold/resume, returns/refunds, purchase receipt/invoice, shift closing. Fresh browser storage and refresh/retry behaviour.
- Operational: migration on previous release fixtures, backup and point-in-time restore, deployment rollback compatibility, disk exhaustion, worker death/retry and unsupported external service states.

## Required scenarios and exact assertions
| ID | Scenario | Expected result |
|---|---|---|
| TEN-01 | Tenant B requests A's invoice/customer/file by known UUID | 404 or scoped denial; no existence/data leakage |
| TEN-02 | SQL without tenant context; reused pooled connection | Fails closed; subsequent tenant sees only own rows |
| TEN-03 | Insert child with other tenant parent, including variants/branch/shop | Composite FK and RLS reject |
| TEN-04 | Branch-limited cashier requests report/export/other branch | Denied even if sidebar route is hidden |
| FIN-01 | Two cashiers sell final unit concurrently | Exactly one committed sale and one deduction; failed cart retained |
| FIN-02 | Response lost after commit, retry same key/body | Same invoice/payment references; no second posting |
| FIN-03 | Same key, changed body | 409; original result preserved |
| FIN-04 | Failure after number allocation before commit | Entire transaction rolls back; no orphan invoice/movement/journal |
| FIN-05 | Split cash/UPI plus credit due | Allocations + receivable equal total; credit is not cash received |
| FIN-06 | Repeated partial return/refund requests | Original item remaining quantities and settlement credit never exceeded |
| FIN-07 | Sale and close shift concurrent | Lock serialises outcome; no posting into closed shift |
| FIN-08 | Purchase receipt followed by vendor invoice | Stock increased once; cost/payable adjustment correct |
| FIN-09 | Damaged return / in-transit transfer | Sellable stock not overstated; value/quantity traceable |
| FIN-10 | Journal or stock balance tampering | Constraints/grants reject; audit/reversal interface required |
| TAX-01 | Regular intra/inter-state and UT case using approved fixtures | Correct mutually exclusive components and legal document |
| TAX-02 | Composition/unregistered sale with malicious tax inputs | No separately collected GST/ITC; correct document and required legend |
| TAX-03 | Inclusive/exclusive prices, fractional discount paise, mixed fixture rates | Sum lines/taxes equals header; deterministic residual allocation |
| TAX-04 | Rule change at midnight/effective date or scheme transition | New sale uses new rule; old invoice/render stays unchanged |
| TAX-05 | Credit note after rule change | Original snapshot basis, current eligibility rules, correct reporting difference |
| TAX-06 | Unknown HSN, missing/overlap rule, mandatory unimplemented e-invoice | Posting blocked; no guessed rate or false compliance label |
| CRM-01 | Excess collection/customer advance and later allocation | Liability/receivable reconcile; no double spend of advance |
| MKT-01 | Opt-out after queueing and before retry | Suppressed at send; no marketing message issued |
| DOC-01 | Share link expires/revokes; PNG sharing | Link denied; PNG has same totals as PDF; URLs provided separately |
| OPS-01 | Worker crashes after render before ack | One content-addressed render, retry safe; sale not reposted |
| OPS-02 | Restore latest base+WAL to clean instance | Reconciled totals/files; RLS and app work; RPO/RTO measured |

## GST verification
CA-approved legal test pack is a dependency, not fabricated test data. Synthetic rates test arithmetic only. Test all registration modes, exempt/nil/mixed cases allowed in scope, GSTIN recipient data, supply-state decisions, note eligibility, supplier input-credit blocks, MRP and discount basis. Legal source version and approval reference attach to golden fixtures. Unknown statutory scope blocks launch for affected taxpayers. Use snapshot tests for document fields, plus numeric assertions; screenshots alone cannot validate tax.

## UI and retail hardware
Keyboard-only checkout, focus preservation after scanning, duplicate scans, alternate input devices, accessible labels/error messages, contrast, focus visibility and 360/768/1280px layouts. Test actual agreed thermal printers, barcode scanners and label dimensions; browser simulation is not hardware certification. Validate font shaping/currency symbols and multi-page PDF receipts. Web Share file support and cancellation/fallback tested on agreed browsers; WhatsApp automation must not send real messages in CI.

## Test data, CI and environments
Synthetic tenants A/B with two branches each, owner/manager/cashier, stock of one and mixed variants, customers sharing phone numbers, all three taxpayer modes and fiscal-year boundary cases. Keep DB tests isolated with unique database/schema per job; prohibit production credentials/hosts in test startup. CI freezes lockfile, type-checks/lints/builds, runs unit/integration/E2E smoke, validates migration checksums and scans secrets/dependencies. Pull requests require meaningful tests for changed financial/tenant behaviour; coverage percentages alone are not a release gate.

Capacity proposal: 50k variants/tenant, 20 concurrent checkout attempts, realistic invoice history and tenant skew. Measure p50/p95/p99 search/post timings, lock waits, deadlocks, DB CPU/IO and outbox lag. No “supports N shops” marketing claim until hardware-specific benchmark. Re-run expanded tests when behaviour/resources change.

## Release evidence
Each phase reports actual executed/pass/fail/skipped counts, command exits, commit, environment/tool versions and output artifacts. Document known issues and acceptance failures separately. Phase 11 requires independent tenant isolation review, CA legal-pack sign-off, printer validation, completed restore drill, incident runbook and Product Owner acceptance. No feature marked complete from mock data or a passing build.
