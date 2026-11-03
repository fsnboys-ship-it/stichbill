# Encrypted staging backup and restore procedure

Preparation only. No production data, real OCI upload, real SMTP or actual Oracle restore drill is executed by this PR. Proposed RPO 24h/RTO 4h remain unproven until an approved timed off-host drill with actual retained artifacts, keys, network and infrastructure.

## Backup format and publication

The old two-object archive/checksum upload is replaced. `backup.sh` now ONLY invokes the local producer; it cannot upload. The producer uses Unix peer PostgreSQL access as postgres, streams `pg_dump --format=custom --create` directly into real age encryption, and writes no plaintext dump. All subprocesses must succeed, PGDMP format and age header must match, and file sizes are bounded. Private `.partial-*` directories (0700) are never exportable. A complete artifact is verified, fsynced and atomically renamed to `<uuid>.ready/<uuid>.sbb` (file 0400). SIGKILL/power loss may leave a private partial directory; it is not a ready backup and must not be exported. Alert on producer failure/stale age; clean stale partials only after checking no producer is active.

`.sbb` is a documented local envelope: ASCII `STICHBILL-BACKUP-1\n`, one bounded JSON manifest line, then binary age ciphertext. Manifest keys are exactly `version`, `database`, `release`, `sha256` (ciphertext SHA-256) and `cipherBytes`. Database is fixed to stichbill_staging; release is a 40-character reviewed Git SHA. The parser rejects malformed/extra fields, size mismatch, corruption, truncation, symlinks and unsafe owner/modes. No manifest filename/path is executed or used for filesystem traversal. The entire envelope is capped at 1 GiB; exceeding this fails closed and requires a reviewed capacity/design change.

Only the separate uploader host from BACKUP_IDENTITY.md may publish. It snapshots an owner-private transferred file, verifies it again and sends ONE conditional single-part object PUT including the whole-object SHA-256 request checksum. Ciphertext and manifest commit together; there is no sidecar object or multipart upload. `If-None-Match: *` prevents overwriting the same stable `staging/<uuid>.sbb` name. No delete/overwrite cleanup is attempted. If a network timeout loses the response after server commit, treat the outcome as UNCERTAIN, retain the source and reconcile with a separate read-only recovery identity. Never assume a failed request means no complete object exists, generate a new name to hide uncertainty, or claim a fake transport proves OCI atomicity.

SHA-256 detects corruption, not malicious provenance. Age authenticates ciphertext to the recovery key, but anyone knowing a public recipient can encrypt their own content. Trust also depends on the protected producer, pinned read-only SFTP source, approved release inventory and bucket IAM. A compromised producer/uploader or administrator is outside that assurance; independent signed inventory/retention controls are a later strengthening option. Restore only reviewed archives from the trusted source.

Key material: public X25519 age recipient on A; private recovery key off A/B in an independently controlled, recoverable store. Key loss means backup loss. Keep old keys for every retained backup. Record release SHA, migration checksums/history, PostgreSQL/client/age versions, recipient IDs and upload receipt/object version in a protected inventory, no passwords. Use seven daily/four weekly generations only after measuring sizes and approving storage. Retention must not delete the last verified backup; producer does not implement retention. Same-tenancy storage is not an independent compromise boundary; maintain another controlled copy before production.

## Restore on an isolated PostgreSQL 17 recovery host

1. Obtain separate execution approval. Block application traffic and SMTP; ensure the intended PostgreSQL 17 cluster is empty of the staging database and all three staging roles. Never restore over the running source. Use the SAME database and role names. A different name will break derived grants/security checks. A second isolated cluster can use a different explicit loopback port. Confirm keys, approved artifact inventory and matching application release before proceeding.
2. A separate recovery identity downloads the ONE `.sbb` object/version. Use a private owner-only recovery directory (0700), umask 077 and file 0600, no symlinks. Match the object/version/release against the protected inventory. There is no separate checksum file to execute with `sha256sum -c`; the verifier parses the embedded checksum itself. Do not accept object ETag as a SHA-256 digest.
3. On the recovery host only, prepare the local decrypted dump WITHOUT executing SQL:

   ```sh
   umask 077
   STICHBILL_ENABLE_RESTORE_PREPARATION=isolated-staging-only \
   STICHBILL_BUNDLE=/private/recovery/<uuid>.sbb \
   STICHBILL_RECOVERY_IDENTITY=/private/keys/recovery.agekey \
   STICHBILL_RECOVERY_DIR=/private/recovery \
     node infra/oracle/decrypt-backup.mjs
   ```

   The key and parent directory must be private and owned by the recovery user. The helper snapshots input, verifies manifest/size/checksum, completes age authentication, then releases a mode-0600 PGDMP archive in a private directory. Any corruption/decryption/subprocess error removes that output. This corrects the old `age | pg_restore` command: do NOT start executing restore SQL before decryption has succeeded completely. Protected plaintext is allowed only on the isolated recovery host; securely remove it and the temporary key copy after the drill, considering filesystem/snapshot retention.
4. As controlled bootstrap superuser over local peer authentication, run the reviewed role script with explicit intent:

   ```sh
   PGOPTIONS='-c stichbill.restore_roles_approved=isolated-staging-restore' \
     psql --dbname=postgres --set=ON_ERROR_STOP=1 --file=infra/oracle/restore-roles.sql
   ```

   It transactionally rejects pre-existing roles/database, creates the exact NOLOGIN/non-superuser owner and restricted LOGIN migrator/runtime with PASSWORD NULL, and grants NO memberships or database access. Set independent generated 48-hex application passwords privately using psql `\password` or an approved secret procedure; never put passwords in CLI arguments, Git or CI. There are no restored global role/password scripts. Do not give either application role membership in bootstrap/owner. Do not create the staging database or run fresh provisioning: `pg_restore --create` restores it and its original owner/ACLs from the archive.
5. After reviewing the trusted archive/list and verifying the target/roles, restore the fully authenticated local dump:

   ```sh
   pg_restore --exit-on-error --create --dbname=postgres /private/recovery/.decrypt-<id>/verified.dump
   ```

   Execute as controlled bootstrap superuser via private local authentication; use PostgreSQL 17 tools. `--dbname=postgres` is the initial maintenance connection; data goes into stichbill_staging as named in the archive. Keep all owners, grants, grantors/default ACLs and functions. Never add `--no-owner`, `--no-acl`, `--clean`, migrations or permissive grants to get past errors. `--create` cannot be single-transaction: failure may leave a partial database. Exit immediately and keep that entire target quarantined. Explicitly review/drop/recreate only that disposable failed target before retry; no automatic destruction/repair is supplied. Restore archives execute trusted-source SQL. [PostgreSQL 17 restore behavior](https://www.postgresql.org/docs/17/app-pgrestore.html)
6. Verify exact database owner/role attributes/memberships, database ACL grantors, object/function ownership, default privileges, all eight FORCE RLS policies, function hashes and migration history against the selected release. Run the existing readiness checker as runtime using private staging config/new runtime password. Do not use bootstrap readiness to bypass runtime checks. An ownership/grantor mismatch is a failed restore, not permission to relax validation.
7. Before opening any access, invalidate restored sessions and reset tokens as the approved recovery administrator:

   ```sh
   PGOPTIONS='-c stichbill.recovery_approved=isolated-staging-restore' \
     psql --dbname=stichbill_staging --set=ON_ERROR_STOP=1 --file=infra/oracle/invalidate-restored-sessions.sql
   ```

   The gated transaction sets revoked_at on global identity sessions and membership sessions, and used_at on outstanding password resets. This is maintenance SQL, NOT a migration or startup step. Verify old session/reset tokens fail and a new valid login succeeds. Rotate/update private application credentials; owner stays NOLOGIN. A failed transaction must be rolled back and reviewed while target remains quarantined.
8. With SMTP still blocked, verify owner login, shop/branch reads/writes, staff scopes, foreign-tenant denial, restart persistence and inability of runtime to read auth tables or assume owner/bootstrap. Review logs for redaction. Record measured RPO/RTO and results before any DNS/traffic cutover approval. Only the approved live SMTP acceptance test can reopen recovery delivery.

## Automated checks versus a real OCI drill

`npm run test:backup` is Linux-only operations verification with real age and disposable PostgreSQL 17 containers. It checks encryption round-trip, authenticated-decryption failure, tampered/truncated bundles, private modes, symlink rejection, failed dump/encryption, default-disabled uploads, and a single verified fake PUT with failure/no cleanup-write behavior. Its PostgreSQL test executes the SAME role and session-invalidation scripts, verifies the existing exact readiness contract after pg_dump/pg_restore, checks data and old-token invalidation/new login, and refuses an overwrite attempt. Existing Windows application/DB/browser workflows are unchanged.

These automated tests use synthetic keys/data and a fake upload transport. They do NOT prove real OCI IAM denial, Object Storage transfer/retention, SSH export, key-custody recovery, Oracle Arm, systemd boot/mount behavior, public TLS, SMTP delivery or the timed real off-host restore. Those remain explicit acceptance gates. Daily logical backups do not provide point-in-time recovery; WAL archiving requires a separately reviewed design. Volume snapshots supplement but never replace these checks.
