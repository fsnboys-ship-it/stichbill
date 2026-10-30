# Product requirements — STICH BILL

Version 0.1 • Task 001 • 30 October 2026 • Proposed for PM/Product Owner approval

## Purpose and scope
STICH BILL is an online-first, multi-tenant retail SaaS for Indian clothing shops, readymade garments, men's/women's fashion, children's wear and boutiques. It connects product variants, purchasing, sales, customer money and stock records. The public website www.stichbill.com remains independent. The old app is a functional reference only: none of its source is a foundation for this project.

Initial users are non-technical owners and cashiers. Later users include branch managers, inventory staff, accounts staff, tailors and platform support. Currency for initial operations is INR; timestamps are stored in UTC with shop-local business dates (default Asia/Kolkata). Payroll, offline transactions, fabric rolls and automated marketing are later capabilities.

A tenant is one SaaS business account. A shop is a selling business unit/legal seller context; a branch is a stock and sales location within a shop. A tenant can have several shops; each shop may have a distinct GST registration or share an applicable registration with other locations. This distinction prevents conflating a brand, location, GSTIN and subscription.

## Success criteria and workflow
A cashier selects an exact size/colour variant, checks the price, adds a customer if needed, applies an authorised discount, records payment and completes a bill. The server commits invoice, inventory, money allocations and audit records once. The issued document remains reproducible after prices, branding or GST rules change. Returns reference the original bill and quantities. Owners can reconcile closing cash and see explainable stock and profit figures.

Proposed performance targets, to validate in load tests: catalogue search p95 <300 ms API, finalise bill p95 <1.5 seconds API excluding external payments/rendering; responsive UI from 360px width; keyboard and barcode-wedge operation; no loss of confirmed bills on refresh. Phase 11 sets measured capacity and SLOs; these are targets, not performance claims.

## Requirements and delivery mapping
| ID | Requirement and observable behaviour | Phase |
|---|---|---|
| ORG-01 | Tenant signup, shop setup, branch assignment, owner/cashier access; denied tenant/branch access also denied through API | 1 |
| CAT-01 | Categories, brands, products, size/colour variants, unique tenant SKU, barcode aliases, HSN, cost/selling/MRP prices | 2 |
| INV-01 | Branch/variant balances, append-only movements, opening stock, reasoned adjustments, low-stock thresholds and stock counts | 2 |
| INV-02 | Dead-stock ageing based on receipt/last-sale dates, unsold days and remaining quantity, configurable window | 6 |
| POS-01 | Search, scanner keyboard input, size/colour confirmation, cart, held/resumed bills and salesperson attribution | 3 |
| POS-02 | Fixed/percentage discounts within permissions, split cash/UPI/card, credit balance, server calculation and idempotent finalisation | 3 |
| POS-03 | Invoice series, history, print/PDF/PNG, customer share link, reprint audit, cancellation/reversal controls | 3 |
| POS-04 | Partial/full returns, refunds and exchange group linking original return to new sale; stock disposition tracked | 3 |
| POS-05 | Cashier shifts: opening float, cash movements, expected/actual cash, variance reason and supervisor close approval | 3 |
| TAX-01 | Regular, Composition and Unregistered states with effective dates; proper document types and immutable tax snapshots | 3 |
| TAX-02 | HSN/rates, inclusive/exclusive pricing, CGST+SGST/UTGST or IGST, exempt/nil categories, credit/debit notes | 3 |
| TAX-03 | Purchase input tax eligibility/review records; composition liability records and mode-appropriate reports | 5–6 |
| CRM-01 | Customer identity/contact, purchase/size history, dues, advances, collections, allocated payments | 4 |
| CRM-02 | Segments, birthdays (optional data), repeat purchase analytics and loyalty ledger | 7 |
| BUY-01 | Suppliers, purchase orders, goods receipt, supplier invoices, partial/full purchase returns, payments and ageing | 5 |
| OPS-01 | Expenses, employees and scoped permissions; sales/profit/stock/cash/branch reports | 1, 6, 9 |
| ALT-01 | Alteration jobs, promises, tailor assignment, restricted measurement profiles, job status and handover | 8 |
| MKT-01 | Separate consent per purpose/channel, opt-out, manual invoice sharing, configured review/social links | 3–4 |
| MKT-02 | Consent-filtered campaigns, inactive-customer reminders, loyalty offers, later WhatsApp Business API adapter | 7 |
| SAAS-01 | Multi-branch operations/transfers, entitlement management, subscriptions, audited platform administration | 9 |
| EXT-01 | Payroll; roll/metre fabric extension, decimal quantities and optional roll traceability | 8 (separate approval) |
| OFF-01 | Offline queues, device identity and deterministic sync/conflict handling | 10 only |
| REL-01 | Tested backups/restores, release/migration controls, monitoring and production hardening | ongoing; release gate 11 |

## Invoice and sharing experience
All customer invoices include “Powered by Stich Bill”. Show business branding and legal particulars above promotional content. Generate a PNG and PDF from the same immutable document snapshot. PNG pixels cannot contain clickable hyperlinks: send the PNG alongside separate Instagram, Facebook and Google rating URLs in a message/caption, or provide an HTML invoice page/PDF with clickable links. Sharing through wa.me opens a text message; it does not attach a local PNG automatically. Use browser Web Share with file support when available; otherwise download the image and provide copyable message/links. Manual WhatsApp sharing is Phase 3; automated API delivery requires explicit later integration and channel policy review.

Share links contain random revocable tokens, not guessable invoice numbers. Public pages expose only the agreed receipt fields; no measurements, credit ledger, staff details or internal margin. Disable indexing. Marketing consent is independent of requesting a receipt. Revalidate opt-out immediately before campaign delivery.

## Retail rules
- Stock is an integer count for garment variants; reject fractional pieces. Reserve decimal UOM support for fabric later.
- Default no negative sellable stock. A held bill is a saved draft, not a stock reservation; revalidate quantities and prices on resume and before posting.
- Returned damaged goods go to quarantine, not automatically into sellable stock. Exchanges create a return and a replacement sale with explicit net settlement.
- Credit is an outstanding receivable, not money received. Require an identified customer for credit and advances.
- A recorded UPI/card method is not evidence of a processor-confirmed transfer. Cashiers record external references with reconciliation status; gateway capture is future work.
- A finished invoice is immutable. Corrections use permitted credit/debit/cancellation documents with reasons and links.
- Shop registration status determines whether GST may be collected. Missing/ambiguous tax configuration blocks finalisation with an actionable error.

## Pilot and later scope
Pilot: one tenant/shop/branch, owner and cashier, three registration modes supported in the engine, products/opening inventory, reliable sale/return/payment flow, basic customer records and a daily close. A given shop operates in its own approved registration mode. No pilot for a taxpayer needing unimplemented mandatory e-invoicing or other compliance workflows.

Minimal customer identity and payment ledger are dependencies of Phase 3 despite the fuller CRM phase being 4. Initial stock valuation is opening cost; purchases refine it in Phase 5. Multi-tenant and branch boundaries exist from Phase 1, even though the multi-branch user experience arrives in Phase 9.

Defer AI, online storefront/marketplaces, cross-shop combined checkout, cross-GSTIN exchanges, full general-ledger accounting, automatic tax filing, payment acquiring, wholesale/manufacturing workflows and unrelated retail industries. These are not implied by existing UI ideas.

## Additional proposals from analysis
Add spreadsheet import with dry-run/errors, supplier duplicate-invoice checks, stocktake reconciliation, estimates with deposits, return-disposition tracking, expense attachments, receipt delivery status, accounting-period locks, sales reprint audit and accessibility/localisation readiness. See competitor evidence for which are vendor-observed; other items are our integrity proposals.

## Owner decisions
Approve pilot shops and expected product/bill volumes; GST registration examples and reviewing CA; thermal paper sizes/barcode printer models; initial language; discount and credit limits; refund/exchange window; returns without original invoice; negative-stock override policy; stock costing choice; data retention; subscription pricing; Oracle budget and availability expectations. Defaults and unresolved gates are in ARCHITECTURE_DECISIONS.md. No answer is required merely to finish this design task.
