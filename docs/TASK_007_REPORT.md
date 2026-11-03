# Task 007 — Staging configuration and approved NOLOGIN owner model

Baseline: `873ec79` on main, correct repository `fsnboys-ship-it/stichbill`. Dedicated branch `task007-staging-configuration`. The earlier unrelated frontend preview edit was stashed before branching; it is excluded from this change. No application screen, authentication algorithm, business command, existing SQL migration or function-security manifest is rewritten.

## Security decisions

The old login-superuser database-owner contract was a bootstrap assumption, not required by RLS. It remains supported only on existing bounded development/test databases. Explicit staging configuration now requires the dedicated staging database and named runtime role, a loopback host, an explicit unprivileged port and generated application credentials. Oracle templates use 5432; native Windows test PostgreSQL can use 55432. Provisioning requires all URLs to use the same port and independent passwords. Production configuration remains rejected. Staging API startup rejects privileged database environment keys, preventing accidental loading of bootstrap/migration configuration into the runtime service.

Staging requires a dedicated NOLOGIN/NOSUPERUSER owner with no memberships, elevated flags, role settings, application objects, unrelated explicit grants or other owned databases. A separate authenticated bootstrap superuser temporarily SET ROLEs to that owner for database grants; no persistent role membership is created. The restricted migrator retains object ownership and existing database privileges; runtime retains existing application grants. Exact grantor/ACL checks are preserved. Fresh bootstrap, provisioning and readiness have distinct gates. Existing unexpected roles/objects/ACLs are rejected, never adopted/repaired. Existing migration SQL, checksums, all eight FORCE RLS policies and SECURITY DEFINER contracts are unchanged.

Staging uses one canonical HTTPS origin and the existing Secure/HttpOnly/SameSite=Strict/__Host- cookie and CSRF flow. Fastify trusts the first hop only from IPv4 loopback; proxy templates replace forwarded headers, preserve API paths, avoid auth caches and block public docs/readiness. CORS is not opened. Real SMTP recovery uses verified TLS/STARTTLS, a canonical reset fragment and redacted delivery errors. Local recovery delivery remains unchanged. Nodemailer and its type declarations are exact-pinned; no provider is provisioned.

## Changed files

- `apps/api/package.json`, `package-lock.json`: pinned SMTP dependency/types.
- `apps/api/src/config.ts`: strict staging environment, database, origin and SMTP validation.
- `apps/api/src/app.ts`, `apps/api/src/auth/routes.ts`: scoped proxy trust, origin injection and recovery adapter selection.
- `apps/api/src/auth/smtp-delivery.ts`: verified TLS SMTP delivery without provider/credential logging.
- `apps/api/src/database/connection.ts`, `check.ts`: environment-aware restricted connections/readiness.
- `apps/api/src/database/migrate.ts`: explicit staging migration gates; original local gates retained.
- `apps/api/src/database/security.ts`: explicit owner-role authority inspection and exact staging contract.
- `scripts/provision-staging-db.mjs`: transactional, locked, fresh-only bootstrap and idempotent verification.
- `database/migrations/README.md`: staging contract alongside existing local contract. No SQL changed.
- `infra/oracle/README.md`, `BACKUP_RESTORE.md`: provisioning, migration, network, release and encrypted recovery runbooks.
- `infra/oracle/nginx-staging.conf`, `nginx-api.conf`: HTTPS/proxy templates.
- `infra/oracle/staging.env.example`: placeholders only; actual secrets stay outside Git.
- `infra/oracle/backup.sh`: local-only encrypted backup entry point; cloud upload has been removed from the database host.
- `infra/oracle/systemd/stichbill-api.service`, `stichbill-backup.service`, `stichbill-backup.timer`: service/timer templates.
- `tests/integration/staging.test.mjs`, `tests/unit/staging.test.mjs`: fresh PostgreSQL 17 owner/provisioning/escalation, origin/proxy/auth, configuration, SMTP TLS and redaction tests.
- `docs/TASK_007_REPORT.md`: this report.

## Verification boundaries

Full lint/typecheck/build/unit/PostgreSQL integration/OpenAPI verification and existing browser suite are required, plus workflow validation, Nginx syntax validation and backup shell syntax. Exact final results and hosted Linux/Windows CI status are reported in the draft PR. Integration uses a fresh exclusively created local staging database on PostgreSQL 17, a separately generated bootstrap administrator and generated application credentials. It rejects an existing staging database/roles before creation and deletes only its own fixtures. An adversarial grantor test deliberately corrupts and restores ACL metadata only inside that owned disposable database. Tests exercise fresh bootstrap rejection, idempotence, privilege drift, actual SET ROLE/escalation denials, strict grantors, migration CLI gates, secure cookies and real application commands.

SMTP tests include a real local plaintext SMTP server refusing STARTTLS: no AUTH or recovery content is sent. Actual provider delivery is not exercised. Oracle resources, DNS, public HTTPS, VM service activation, encrypted OCI uploads and an off-host restore drill are not executed. Existing dependency audit findings remain a separate maintenance concern; no broad dependency update is attempted.

## Remaining execution gates and risks

Review/approve this draft before merge. Separately approve Oracle provisioning/deployment, region/domain/costs, real SMTP credentials/sender DNS and tester policy. Validate the pinned toolchain on Arm. Verify systemd paths, certificate renewal and persistent PostgreSQL mount dependencies on the actual VM. A single VM is not HA and free resources may be reclaimed. Use the required separate uploader host and prove API-host IAM denial before a separately reviewed upload activation; same-VM Unix users are not an OCI principal boundary. Keep decryption keys off-host; prove complete role/ACL-preserving restore and invalidate restored sessions/reset tokens before reopening access. RPO/RTO are targets, not tested guarantees. Production still needs email ownership verification policy, retention/housekeeping, operational ownership, independent backups and dependency/runtime review.

Stop for review. No merge, cloud provisioning, purchase, deployment or production data change is included.

## Local verification results

- `npm run verify`: passed lint, all workspace type checks/builds, 41/41 unit tests, 118/118 real PostgreSQL integration/security tests, and OpenAPI drift checks.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: 4/4 passed, including mobile owner lifecycle and shop/branch operations. System Chromium was used locally; CI retains its existing browser setup.
- `npm run ci:check`: passed existing Linux/native Windows workflow validation. Hosted execution status is reported separately in the PR/conversation.
- Nginx template validation in a disposable Nginx container with synthetic certificates: `nginx -t` passed.
- `bash -n infra/oracle/backup.sh` and `git diff --check`: passed.
- `npm audit --json`: 18 moderate findings, zero low/high/critical; count unchanged from the inherited baseline. No broad dependency remediation is included.
- Existing SQL migrations and `security-manifest.ts`: unchanged.


## Focused operational-security review of 9e9983c

Findings: a same-VM instance principal was available to other VM processes; uploading archive/checksum as separate objects could leave a half-published pair; the recovery pipeline could start SQL before full decryption completed; and generic postgresql.service dependencies did not guarantee a running PostgreSQL 17 cluster or mounted data volume.

Fixes:

- Removed OCI from the database-host backup job. The producer runs network-isolated and produces only verified local ciphertext. BACKUP_IDENTITY.md selects a separate uploader host with exact-instance dynamic-group matching, create-only bucket permissions, one-way pinned read-only SFTP transfer, explicit API-principal denial tests and a root-controlled expiring acceptance record. The uploader service is HARD-DISABLED, overrides any environment-file enable flag and has no timer/install target. No real IAM denial was tested and no upload was enabled.
- Added a bounded single-object envelope containing encrypted dump, exact manifest and SHA-256. Atomic local ready publication, private permissions, no-follow file access, private upload snapshots, one conditional single-part PUT and a server-side SHA-256 request checksum replace two-object publication. No overwrite/delete or automatic retry hides uncertain outcomes.
- Recovery verifies checksum, completes real age authentication and checks PGDMP before releasing a private local restore file. New gated manual restore-roles.sql creates only the exact roles, without database/grant reconstruction; pg_restore --create preserves those from the archive. New gated invalidate-restored-sessions.sql revokes both session layers and consumes old reset tokens. These are recovery procedures, NOT application migrations/startup steps.
- API and backup now depend on the real Ubuntu PostgreSQL 17 cluster. A mountpoint/PG_VERSION drop-in prevents fallback onto the boot filesystem and binds service lifetime to the data mount; API gets a runtime-role readiness precheck. Added a validated-reload certificate deploy hook and explicit Arm, mount/reboot, TLS renewal and SMTP acceptance checklist.
- Added Linux operations tests using real age and separate disposable PostgreSQL 17 containers, plus local certificate-verified Nginx/TLS routing. Linux hosted CI installs age and runs these tests; existing native Windows application/database/browser workflows are unchanged. No actual cloud credentials or SMTP secrets are added.

Focused files: .github/workflows/ci.yml; package.json; infra/oracle/{backup.sh,backup.mjs,create-backup.mjs,upload-backup.mjs,decrypt-backup.mjs,BACKUP_IDENTITY.md,BACKUP_RESTORE.md,DEPLOYMENT_CHECKS.md,README.md,restore-roles.sql,invalidate-restored-sessions.sql,renew-certificate.sh}; infra/oracle/systemd/{stichbill-api.service,stichbill-backup.service,stichbill-upload.service,postgresql-data.conf}; tests/operations/{backup.test.mjs,restore.test.mjs,nginx.test.mjs}; this report.

Unclosed acceptance gates: actual OCI IAM/canary/SSH isolation; actual Object Storage upload/retrieval/retention and independent key custody; timed off-host OCI restore; Oracle Arm toolchain; real systemd boot/mount failure/persistence; public DNS/ACME renewal; provider SMTP delivery. A separate uploader may add cost/capacity and needs approval. Checksums are not signed provenance; trusted producer/inventory/IAM remain assumptions. Admin/uploader compromise, single-VM app availability, manual retention, the 1 GiB envelope cap, dependency findings and unmeasured RPO/RTO remain explicit risks. No production-ready/OCI restore claim is made. Existing migrations, checksums, FORCE RLS, SECURITY DEFINER manifest and application role grants are unchanged.

Focused review local results: npm run verify passed (lint, type checks/builds, 41 unit and 118 PostgreSQL integration/security tests, OpenAPI drift); existing browser suite 4/4 passed; Linux test:backup operations suite 10/10 passed with real age v1.2.1 locally, synthetic key material, separate disposable PostgreSQL 17 and local certificate-verified Nginx. The operations tests do not contact OCI or a real SMTP provider. Workflow validation, shell syntax and whitespace checks passed. Hosted Linux (including operations) and unchanged native Windows CI results are recorded in the updated PR/conversation after the focused commit. The root-only uploader acceptance record is handed to the unprivileged service through systemd LoadCredential; it is not made group/world-readable to solve access.
