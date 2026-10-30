# Security and financial integrity plan

Task 001 design; controls are requirements, not implemented guarantees. Data classes: public marketing; tenant internal catalogue/stock; personal customer/staff data; restricted measurements; highly restricted credentials/session tokens; immutable financial/legal records.

## Trust boundaries and threat controls
| Risk | Required control | Proof required |
|---|---|---|
| Cross-tenant ID guessing or omitted WHERE | Server membership validation + FORCE RLS + composite tenant FKs; no privileged DB role in API | Two-tenant API/SQL negative suite; connection reuse/missing context tests |
| Branch leakage | Branch scopes on reads, writes, exports, search, files and reports; scoped joins/RLS; aggregate routes cannot reveal hidden branches | Cashier/manager/owner matrix including direct URLs |
| Staff privilege escalation | Deny by default, allowlisted role grants, server permission checks, sensitive action approvals | Cashier cannot grant role/refund/change tax, even with crafted payload |
| Account takeover | Argon2id passwords, throttled login/reset, generic errors, secure sessions, session revocation, later MFA for owners/support | Session fixation, enumeration, reset replay and credential-stuffing tests |
| Duplicate sale/payment | Unique request idempotency + body hash + persistent client transaction/business posting unique keys | Timeout/retry/webhook replay creates one posting |
| Concurrent oversell | Sorted row locks, checked balances and movement uniqueness in same transaction | Two tills race for last unit; one succeeds |
| Wrong amounts/refunds | Server Decimal calculations, approval limits, original-line return caps, original-tax snapshots, balanced journals | Manipulated prices/tax and cumulative return/refund tests |
| Financial tampering | Posted rows immutable; reversals/notes + reason/actor; period locks; DB grants and triggers | Direct update/delete denied; explicit reversals reconcile |
| File/export leakage | Authorised private storage, expiring opaque links, download audit, export row scopes | Tenant B cannot fetch A's file or change export parameters |
| CSRF/XSS/injection | SameSite cookies plus CSRF token/origin checks; CSP; escaped user text; bound SQL; allowlisted sorting/report predicates | CSRF, stored-XSS on invoice and SQL injection tests |
| Abuse of share tokens | High-entropy token stored hashed, expiry/revoke/rate limits, no indexing; minimal invoice view | Guessing, expired and revoked links fail without internal data |
| SSRF/template abuse | Trusted templates, local fonts, renderer network deny, URL scheme/host restrictions for approved assets | Image/HTML payload cannot reach metadata/private endpoints |
| Consent misuse | Separate purpose/channel events; withdrawal checked at send/retry; suppressions and delivery dedupe | Opt-out during queued campaign suppresses message |
| Data loss/failed migrations | Off-VM encrypted backup + WAL plan; proven restoration; expand/contract migrations, forward fixes | Timed clean restore and prior-version compatibility rehearsal |
| Supply chain | Lockfile/frozen installs, package provenance/integrity/TLS, dependency review and secret scan | CI gates; documented vulnerability exception owner/expiry |

## Authentication and authorisation
Tenant chooser lists only valid memberships from a constrained identity service. Business query context derives from authenticated membership, never just a tenant header. Scope resolver checks active status, role permission and shop/branch scope. Changing role or disabling employee invalidates cached access/session capabilities promptly. Server ignores frontend role claims. Password reset tokens are random, hashed, short-lived and single-use; no passwords or bearer tokens in logs. Owner recovery and any support impersonation require auditable identity verification, explicit tenant approval and time-limited scope.

Cashier: bill in assigned branch, own shift, limited customer lookup. Manager: inventory/purchases/returns within branch, subject to limits. Owner: tenant operations and scoped invitations. Accounts: finance/report access without measurement permission. Tailor: assigned jobs/minimal measurement profile only. Platform operator: subscription/operational metadata; customer records require explicit time-bound support access. Entitlements never grant permissions. Break-glass DB access is a separate infrastructure process, never an app role.

Every HTTP request gets a correlation ID. Security events include authentication failures, role/scope changes, large exports, price/tax changes, approvals, period reopen, refund, document sharing and backup/restore. Audit stores relevant hashes/metadata without passwords, payment secrets, raw tokens or full measurement values. Database append-only audit restricts normal operators; periodically export signed/hash-checkpointed audit batches to separately protected storage for tamper evidence. This is not claimed to prevent a DB superuser from rewriting local files.

## Financial controls
Invoice finalisation uses one database transaction across document number, invoice/items, tax snapshots, stock movements/balances, journal, allocations, audit and outbox. Payment-provider calls and document rendering never occur under a long-held stock lock. Provider integration later uses pending state, authenticated webhook signatures, unique provider event IDs and reconciliation; a browser redirect cannot mark payment captured.

Use explicit discount thresholds, refunds/stock adjustment permissions, independent approval for exceptional changes and recorded reasons. Approval binds a payload hash so amounts cannot change after approval. Stocktake approval validates balance versions. Counted cash and variance are stored separately from expected cash. Financial period closure prevents silent backdating. Read models/export totals reconcile to journals/stock facts and disclose pending/unreconciled settlements.

## Privacy and customer access
Minimise contact data; no mandatory birth year. Measurements are encrypted with a separately controlled key, access logged, role-restricted and excluded from reports unless explicitly requested by authorised staff. Encrypt transport and backups; use encrypted volumes where supported. Key rotation stores key identifiers/version and preserves approved decryption paths for historical documents.

Consent records capture channel, purpose, wording/version, source/time and withdrawal. Receipt sharing is a customer-requested service workflow, not permission for future promotions. Review applicable Indian privacy, retention and channel rules before marketing launch; no promise of consent compliance from checkbox existence. Deletion requests preserve legally retained invoice facts and apply lawful PII minimisation. Retention exceptions and litigation holds are explicit.

## Backup, restore and disaster recovery
Proposed targets: RPO <=15 minutes with continuous archived WAL; RTO <=4 hours for initial pilot; owner approves measured targets and budget before production. Nightly encrypted base backup, continuous WAL, backup manifests/checksums, documented retention (proposal 30 daily backups plus approved longer legal archive), off-VM storage and separate credentials. Database backup does not replace document-file backup; record coordinated file manifest and DB checkpoint.

Monthly restore drill into isolated environment: restore base/WAL to selected point, verify keys/files, reconcile sample financial and stock totals, validate RLS, login and receipt generation, measure actual RPO/RTO, record result. Annual/major-change full recovery rehearsal. Alerts on stale backups, failed archive, disk fill, stalled outbox, repeated serialisation failures and missing audit. Never claim production readiness from successful backup upload alone.

## Migration and deployment safety
No migration applied in Task 001. Each later migration has reviewer approval, checksum, lock/timeout analysis, tenant/row count impact, backup/restore position and verification query. Rehearse on sanitised representative data. Expand schema first; support old/new versions; backfill in bounded batches; enforce constraints and remove old columns only after transition. One migration runner holds advisory lock. Failed destructive/data changes use reviewed forward repair or isolated restore, not automatic blind down migration. API readiness fails if schema is incompatible. Database change approval is required before execution under the task's stated rules.

## Residual risks / production gates
Single free-tier VM is a failure domain; budget/capacity is unconfirmed. GST pack and e-invoice applicability need current CA validation. Partial payment capture and offline conflict handling are later engineering work. Old application's client-selected super-admin pattern is not adopted. Shared public invoice tokens require careful field review. No production customers until tenancy tests, restore drill, statutory eligibility, incident process and approval gates pass.
