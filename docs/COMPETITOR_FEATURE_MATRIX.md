# Competitor feature matrix

Research date: 30 October 2026. Evidence is publicly documented vendor claims, not hands-on verification or independent performance/security validation. No competitor design, branding, source code or assets are reused. STICH BILL is a proposal, not a verified shipped product.

## Evidence grades
- **V — Verified public feature:** readable primary vendor page explicitly states the capability. This does not certify implementation quality, completeness or availability on every plan.
- **P — Partially verified:** bounded/qualified statement, e.g. only some offline workflows or a plan-specific capability; stronger interpretation is unverified.
- **N — Not verified:** no reliable accessible evidence obtained. This never means the product lacks the feature.
- **O — Our proposed feature:** architecture proposal; no competitor capability implied.

Sources S1–S3 are exact URLs with excerpts below and in research/SOURCE_REGISTER.md. Every positive matrix cell carries a source ID. The source applies to the exact claim in its row, not adjacent capabilities.

## Feature comparison
| Public feature claim | SutriSoft | Sellbii POS | Kapda Stock | HisabLekha | RetailNode Bills | STICH BILL proposal |
|---|---|---|---|---|---|---|
| Barcode billing | N | V S1: “Scan and bill in seconds” | N | V S3: “GST billing, barcode inventory” | N | O Phase 3 |
| Size/colour/style variants | N | V S1: “Size × Colour × Design Matrix” | N | V S3: “size-colour variants” | N | O Phase 2 |
| Split cash/UPI/card/credit | N | V S1: “cash, UPI, card, credit, split payment” | N | V S3: “split payment (cash + UPI)” | N | O Phase 3; credit is receivable |
| GST/HSN reports | N | V S1: “GST Summary Report”; “GSTR-1 summary” | N | V S3: “GST reports (GSTR-1, HSN, Excel export)” | N | O Phase 3/6; filing separate |
| Returns/exchanges | N | V S1: “automatic stock adjustment” | N | V S3: source return/replacement/payment/stock tied together | N | O Phase 3 same-shop initially |
| Barcode label printing | N | V S1: “Print barcodes in bulk” | N | V S3: “Batch barcode printing” | N | O Phase 2 |
| Low-stock alerts | N | V S1: “Low Stock Alerts” | N | N | N | O Phase 2 |
| Dead-stock reporting | N | V S1: “Dead Stock Report” | N | N | N | O Phase 6 |
| Customer ledger/dues | N | V S1: “outstanding dues, and payment history” | N | V S3: “due, advance, collection, payment allocation” | N | O Phases 3/4 |
| Loyalty points | N | V S1: “points redeemable on next purchase” | N | P S3: “On eligible plans” points/history/redemption | N | O Phase 7 |
| WhatsApp invoice sharing | N | V S1: “Send digital bills … on WhatsApp” | N | N (not established by captured page) | N | O manual Phase 3, API later |
| Branch dashboards | N | V S1: “View sales across all branches” | N | V S3: “multi-shop operations” | N | O Phase 9 |
| Stock transfer / warehouse | N | V S1: “full audit trail”; “Central warehouse” | N | N | N | O Phase 9 |
| Role-based access | N | V S1: “Owner, manager, cashier” | N | N (employee management alone insufficient) | N | O Phase 1 |
| Staff attendance | N | V S1: “Track who was at the counter and when” | N | N | N | O postpone with payroll |
| Excel import/export | N | V S1: “Import products from Excel” | N | P S3: “Import help included”; implementation workflow not verified | N | O import Phase 2, exports Phase 6 |
| Tally export | N | V S1: “Export data to Tally” | N | N | N | O defer until CA export mapping approved |
| Razorpay integration | N | V S1: “Razorpay Integration” | N | N | N | O payment gateway deferred |
| Offline sales | N | V S2: “Android app works offline and syncs” | N | P S3: “Size-colour variant sales … need a connection” | N | O Phase 10 only |
| Roll/metre fabric inventory | N | N (homepage saree/fabric description not sufficient) | N | V S3: “selected fabric roll … remaining metre balance” | N | O future textile extension |
| Alterations and measurements | N | N | N | V S3: work, date, tailor, measurement profile, slip and ready message | N | O Phase 8 |
| Cross-shop exchange | N | N | N | P S3: documented workflow; multi-shop features depend on plan | N | O defer; legal seller settlement complexity |
| One checkout, separate shop GST bills | N | N | N | P S3: “each shop gets its own GST invoice”; plan dependent | N | O defer beyond Phase 9 |
| Online-store stock linkage | N | N | N | P S3: “Where the online store is set up” | N | O later integration |
| Estimates and deposits | N | N | N | V S3: “estimates, deposits, and remaining balances” | N | O Phase 4 proposal |
| Outstanding ageing basis | N | N | N | V S3: “invoice-date or due-date aging” | N | O Phase 5/6 |
| AI suggestions/scanning/briefing | N | N | N | P S3: Pro AI plan feature claims, not tested | N | O postpone |
| Composition and unregistered modes | N | N | N | N | N | O critical Phase 3; do not infer from “GST-ready” |
| PNG + separate social links | N | N | N | N | N | O required Phase 3 |

## Primary source excerpts
**S1:** https://sellbii.com/features — “Multiple Payment Modes”; “Cash, UPI, card, credit, split payment — all in one bill.” “Exchange & Return”; “Process exchanges and returns with automatic stock adjustment.” “Size × Colour × Design Matrix”; “Track exact inventory by size, colour, and design combination.” “Dead Stock Report”; “Identify slow-moving items before they become losses.” These are public claims; no benchmark/device test performed.

**S2:** https://sellbii.com/ — “The Android app works offline and syncs when the internet is back.” “Our team imports your products for you.” Offline claim is specifically Android in this evidence; browser offline support is not established.

**S3:** https://hisablekha.com/ — “HisabLekha combines GST billing, barcode inventory, size-colour variants, roll-and-metre stock, exchanges, customer ledgers, and multi-shop operations.” “Size-colour variant sales and some other actions need a connection.” “On eligible plans, configure points for completed bills…” “For linked customers, see estimates, deposits, and remaining balances across shops you can access—separate from completed-sale dues.” Plan and supported-flow qualifiers are preserved.

## Unverified identities and access evidence
| Requested name | Discovery attempts | Result and next evidence needed |
|---|---|---|
| SutriSoft | https://sutrisoft.com ; Bing/Google exact-name searches | Candidate domain returned HTTP 403; identity not confirmed. Search responses were unrelated or JS-only. Need owner-provided official URL or product listing. |
| Kapda Stock | https://kapdastock.com ; exact-name searches | Candidate domain returned HTTP 403; identity not confirmed. No feature inferred from name. Need official URL/store listing. |
| RetailNode Bills | https://retailnode.com ; exact-name searches | Candidate domain returned HTTP 403; identity not confirmed. Need exact official product page. |

Candidate URLs are investigation leads, **not authenticated competitor sources**. Google results were JS redirect shells; Bing returned unrelated content for the requested queries, so snippets were discarded. Another candidate `https://sutri.software` was rejected by the network proxy. No attempt was made to bypass denied access. Do not label this a completed five-vendor verification.

## Findings and prioritisation
Common **among the two verified vendors**: barcode/variant sales, GST reporting, split payments, returns/exchanges, loyalty, branch/shop workflows and customer ledgers. Offline is claimed by both with different platforms/limitations. There is insufficient evidence to assert any feature is common across all five.

Distinctively documented **within this evidence set**, not proven market-exclusive: Sellbii explicitly describes Tally export, warehouse allocation, staff attendance, dead-stock and Razorpay. HisabLekha explicitly describes cross-shop split legal invoices/exchanges, roll/metre cuts, alteration handover, estimates/deposits and stock-linked online store.

Clothing-specific workflows worth keeping: exact variant selection, size/colour barcodes, quantity-aware returns, dead stock, purchases by size matrix and alteration promises. Proposed gaps in the original brief: spreadsheet onboarding with validation; estimates/deposits as separate liabilities; overdue ageing based on invoice vs due date; stocktake/count sessions; print hardware compatibility checks; export mappings for accountants. The stocktake and integrity items are our proposals, not vendor evidence.

Postpone: cross-legal-seller combined checkout and cross-shop exchanges, AI assistants/photo entry, payment acquiring, ecommerce inventory federation, Tally synchronisation, fabric roll accounting and payroll. Core stock/money/tax posting must be proven before these additions. Do not adopt a vendor's advertised tax percentages as regulatory evidence.
