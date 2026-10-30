# GST architecture and verification register

Design proposal, as of 30 October 2026. This is not a certification of compliance. Official public source retrieval supports selected principles; current notified rates, limits, amendments and shop-specific applicability still require a CA-reviewed legal pack. No production tax seed is created by Task 001.

## Three registration modes
| Seller mode | Customer document | Tax collection and ITC | Required behaviour |
|---|---|---|---|
| Regular GST | Tax invoice for taxable supply; Bill of Supply where legally required for exempt supply | Applicable output GST; input credit is reviewed for eligibility, not automatically granted | Resolve place of supply and CGST+SGST/UTGST versus IGST; support inclusive/exclusive prices, HSN, original-tax notes and reports |
| Composition Scheme | Bill of Supply | No GST separately collected from customer; no ITC claim under composition | Required composition legend; record own composition liability separately from receipt; eligibility and prohibited supply checks |
| Unregistered | Clearly labelled non-GST commercial invoice | No GST charged as tax and no seller GSTIN represented; no ITC claim | Suppress tax collection fields and validate registration transitions |

Composition Scheme is a taxpayer regime under the GST framework. Composite supply is a separate classification concept for bundled supplies; it is not a registration mode or synonym. Alteration plus garment bundles may need principal-supply/valuation analysis by the CA. Do not infer composition eligibility from shop turnover alone.

For a Regular seller, exempt/nil-rated/non-GST items and mixed taxable/exempt transactions need explicit classifications and CA-approved document policy, not forced nonzero rates. Reverse charge, exports, SEZ and cross-GSTIN transfers are identified special cases. Block cases not implemented and legally approved for the pilot rather than guessing a normal retail treatment.

## Rule model and approval
A registration has effective-dated scheme/state/GSTIN evidence. A tax rule version contains jurisdiction, classification/HSN predicates, transaction applicability, optional value bands and their basis (unit/line/value after relevant discount), rates/components, eligibility limits, document requirements, precision/rounding policy, legal source URL, notification identifier/date, effective interval, reviewer and approval status. Rates, thresholds, composition base/exclusions, HSN-digit requirements and applicability limits are **data**, not constants in code.

Approved rules are immutable. New rules supersede via effective range; no overlapping ambiguous rule scopes. Unknown/multiple matches block posting. Emergency owner overrides cannot invent statutory rates; authorised tax administrator publishes a reviewed rule version. Imports have dry-run, schema validation, four-eyes approval, provenance/checksum and test vectors. Notify affected shops of rule changes. No automatic scraping of vendor pages into law.

Effective-dated registration changes preserve old invoices. Returns/credit notes usually start with original document tax snapshots, then apply currently applicable adjustment rules and time limits. Legal backdating, time-of-supply changes, registration cancellation and eligibility loss need an explicit review workflow. A composition-to-regular transition is not a global checkbox that recalculates history.

## Deterministic calculation sequence
1. Resolve seller shop/legal registration, branch jurisdiction, supply date/time-of-supply context and approved registration period.
2. Resolve recipient registration, ship-to/delivery/place-of-supply evidence and transaction kind. Address alone is not universally sufficient: bill-to/ship-to and special cases need explicit treatment.
3. Resolve product HSN, tax category and effective price/rule version; verify applicability and document kind. A normal domestic intra-state taxable retail supply maps to CGST+SGST or UTGST; inter-state to IGST. Special cases are separate rules.
4. Validate price/MRP, quantities/UOM and permitted discounts. Allocate bill-level discounts deterministically across eligible items, distribute residual paise by a stable largest-remainder/line-order method, and store allocation. Document treatment of post-sale discounts separately.
5. For exclusive prices: eligible taxable base after discounts × approved component rates. For inclusive prices: extract base using the approved total rate, then split components with deterministic rounding. Decimal arithmetic at high precision, then final integer paise at approved boundaries; never native JS floating point as authority.
6. Calculate line taxes, charges, totals and round-off; verify sum of item amounts/taxes/discounts equals document totals. Rounding adjustment is explicit ledger data, not hidden tax alteration.
7. Freeze legal, customer, item, rate, HSN/UQC, rule/engine/template versions and rendering snapshots. Atomic posting stores snapshots with stock/money; only server calculates final amounts.

Example for **synthetic testing only**, not an applicable garment rate: gross inclusive 1,180.00 at fixture rate 18% produces base 1,000.00 and tax 180.00; intra-state fixture components 90.00 + 90.00, inter-state 180.00. Property tests cover fractional paise, discounts and mixed fixture rates. The real rate pack cannot be populated from this example.

## Legal document snapshots
Store seller name/address/GSTIN or unregistered status, recipient details as required, document kind/series/number/date, original document references, HSN/UQC/name/variant/quantity, taxable values, discount allocations, tax components/rates/amounts, supply state and address, reverse-charge flag, authorised signature policy, required legends and rule provenance. Include registration state, business date and tax engine version/hash. Numbers are unique by legal registration, financial year, document type and series; rendered full number must also be unique in that legal context. Validate current format/length requirements from the reviewed rules. No random invoice numbers or silent reuse.

Tax invoice, Bill of Supply and non-GST invoice templates are separate. Composition wording evidence is below. Printed, PDF, PNG and public HTML derive from the same snapshot. “Powered by Stich Bill” and configured social links do not replace legal particulars. Public receipt fields and access tokens follow SECURITY_PLAN.md.

Credit/debit notes retain original invoices/items/HSN/rates; cumulative quantity/value adjustments are capped. Return settlement and credit-note eligibility are distinct: a customer refund does not automatically make output-tax reduction legally eligible. Store financial adjustment and tax-reporting adjustment separately when needed. Debit notes are not achieved by editing an old invoice. Purchase returns retain original vendor invoice and reviewed credit/ITC reversal information.

## Input credit, composition liability and reporting
Regular taxpayer purchase records store supplier GSTIN/invoice/date, goods receipt, taxable/tax component amounts, eligibility reason, blocked-credit/reverse-charge flags, matching/reconciliation status, claim period and reversal history. Eligibility conditions, time limits and current reconciliation requirements require CA approval. An expense with GST does not imply eligible ITC. Composition and unregistered profiles cannot post an ITC claim; purchases retain cost/tax evidence.

Composition liabilities are period-level reviewed calculations on the approved turnover base/exclusions/rates; never a separately collected tax on customer Bills of Supply. Record payment/filing references and status. Regular reporting includes outward tax, HSN summary, notes and ITC review exports; composition reporting includes turnover/liability and eligible compliance export format; unregistered reports contain sales/cost figures without GST collection. Provisional exports are not filings. Report versions preserve as-of time, underlying documents and rule pack. Amendments generate traceable report revisions.

## Official source evidence and limits
| Ref | URL | Retrieved evidence | Validation limit |
|---|---|---|---|
| G1 | https://cbic-gst.gov.in/gst-invoice-rules.html | Tax invoice particulars include supplier GSTIN, serial number unique for financial year, HSN, quantity, taxable value, component rates/amounts and place of supply; separate Bill of Supply and notes sections | Page uses legacy numbering and references; corroborates concepts, not a current consolidated Rule 46/49/53 legal pack |
| G2 | https://cbic-gst.gov.in/composition-rules.html | Explicit legend: “composition taxable person, not eligible to collect tax on supplies”; scheme remains valid subject to conditions; withdrawal/denial requires transition | Legacy rule references and transitional content present. Do not adopt historic restrictions/thresholds without current amendment review |
| G3 | https://gstcouncil.gov.in/igst | Official IGST Act/2018 amendment and notifications index | Index located; all linked legislation/amendments not fully reviewed. Place-of-supply rules still need detailed legal validation |
| G4 | https://cbic-gst.gov.in/gst-acts.html | Official Act index | Linked CGST-bill-e.html/IGST-bill-e.html returned 404 during review; no current consolidated text verified here |
| G5 | https://www.gst.gov.in/ | Official portal reachable | Home page alone supplies no rate/threshold evidence |

Review targets (not claimed fully validated in this task): CGST Act sections 10 (composition), 15 (valuation), 16/17 (ITC), 31/32 (documents/collection), 34 (notes); IGST sections 7–10 for nature/place of goods supply; current CGST rules and notifications governing invoicing, composition, HSN and e-invoicing. Suggested portal composition FAQ route returned 404; it is not used as evidence. Research date is not a guarantee of consolidated law currency.

## CA sign-off checklist — mandatory before real billing
- Current garment HSN classification and rates/value-band basis; notified effective dates and discounts/MRP interaction.
- Registration validity, composition eligibility/limits, PAN-level implications, permitted supply channels and transitions; distinguish composite/mixed supplies.
- Place of supply, SGST versus UTGST, bill-to/ship-to, exemptions, alterations/bundles, reverse charge and branch transfers.
- Document format/number limits, recipient particulars, HSN digits, rounding, financial-year series, invoice-cum-bill rules and signatures.
- ITC eligibility/blocked credits/reconciliation, claims, returns and note reporting/time limits.
- Applicable e-invoicing/IRN/QR and e-way-bill requirements/thresholds. If applicable, do not pilot until integrated or an approved external lawful workflow is in place.
- Composition liability reporting and current forms/payment periods; unregistered invoices; statutory record retention and accountant exports.

Required deliverable before Phase 3 release: versioned legal pack with source documents and notification IDs, CA approval record, executable tax golden cases for all three modes and a signed sample invoice for each applicable transaction class. Task 001 leaves this gate open explicitly.
