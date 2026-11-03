# Encrypted staging backup and restore procedure

Preparation only; do not run against production. Proposed RPO 24h/RTO 4h, subject to a measured isolated restore drill. Real OCI uploads and SMTP delivery need separately approved resources/credentials and are not tested by local CI.

## Backup

Install age and PostgreSQL 17 client tools. Root owns `backup.sh`, recipient list and service configuration. The public age recipient is on the VM; private recovery keys and a recoverable second copy are held off the VM by an approved administrator. Key loss means backup loss. Keep old keys for the full retention of their backups.

The supplied oneshot/timer runs pg_dump as local postgres over a Unix socket, covering all tenants and private auth/history tables. FORCE RLS remains enabled. Do not use runtime to dump: it cannot read all required records. `--create` preserves database-level metadata; custom format preserves ownership, grants, policies and function bodies. No owner/ACL stripping is permitted on restore. Dump is streamed directly through age; no plaintext dump is stored. `pipefail` prevents uploading failed/partial exports. Encrypted checksum and archive are uploaded to a private bucket with unique names and no overwrite. OCI storage encryption is additional to age encryption.

The backup uploader needs object-create only for its approved bucket/prefix, not read/delete or broad tenancy administration. Enforce OS/metadata isolation of that identity from the API before activation; instance-principal privileges otherwise apply to all VM processes. Use a separate administrator identity for retention/deletion and restore. No public bucket, pre-authenticated public URL or static cloud credential in Git.

Record the release SHA, migration checksums/history, PostgreSQL/client version, encryption recipient identifiers and provisioning contract with the backup inventory (no passwords). Application roles are reconstructed from the reviewed contract and secrets manager, not a global role/password dump. Bootstrap role is supplied by the clean server. Retain role credentials separately under access controls; rotate them after recovery. Do not restore unrelated cluster roles.

Use seven daily and four weekly archives initially. Size compressed exports and retained versions before choosing retention; 11 backups can exceed a small free allowance. Retention automation must distinguish daily/weekly generations and may not delete the last verified backup. Enable version/retention protection where approved and affordable. A same-tenancy bucket does not replace an independently controlled copy. Monitor dump/upload failures, archive age, storage capacity and restoration success. Never run `pg_dump` without reviewing stderr/exit status.

## Restore drill on an isolated host

1. Obtain approval and isolate a clean PostgreSQL 17 server with outbound SMTP disabled and no application traffic. Do not restore over any existing database. Use the SAME database name (`stichbill_staging`) and role names because the validator and grants derive names from the database.
2. Download the selected encrypted archive and its checksum to a private mode-0700 directory using a separate recovery identity. Verify the encrypted checksum. Review the inventory/release SHA. Decrypt only in that controlled environment, preferably streaming to pg_restore. Keep the private age key off the application VM.
3. As the controlled bootstrap administrator, create owner/migrator/runtime roles with EXACT documented attributes and no memberships. Owner is NOLOGIN/NOSUPERUSER; migrator/runtime use fresh independent credentials. Do not grant administrative memberships. Do not create the database yet: the archive's CREATE DATABASE is restored below. If tablespaces were introduced later, this runbook needs review first.
4. Restore as trusted bootstrap, preserving owner and ACL statements. Example (paths are placeholders, private key is local to recovery host):

```sh
set -o pipefail
age --decrypt --identity /secure/offline-recovery-key selected.dump.age |
  pg_restore --exit-on-error --create --dbname=postgres
```

Use local peer authentication or private credential files, never passwords in arguments. Run only reviewed trusted archives: restoring SQL executes code. `--create` cannot be combined with a single-transaction restore; on failure, keep the partially restored instance isolated and investigate/recreate it explicitly. Never use `--clean` against an existing database, `--no-owner` or `--no-acl` to hide errors.

5. Verify database owner, roles, schema/function ownership, EXACT grants/grantors, default privileges, all eight FORCE RLS policies and migration history against the chosen release. Run the repository readiness checker as runtime with private staging configuration. Reconstructing a database under a different name or default owner is not accepted. Do not run fresh provisioning over a restored contract to fix failures.
6. Through a reviewed administrator maintenance transaction, invalidate all restored identity/membership sessions and outstanding password-reset tokens before opening access. This prevents pre-backup tokens becoming valid again. Test this explicitly. Rotate runtime/migrator secrets and update only private configuration. Do not alter function bodies/security manifests or disable RLS for recovery.
7. Start the matching application release in isolation. Verify owner login, business/shop/branch reads, a synthetic write, cross-tenant denial and cashier scopes. Verify database persistence across restart and that runtime cannot read auth tables or assume owner/bootstrap. SMTP remains blocked until recovery links use the approved canonical origin and delivery is reviewed.
8. Record total recovery time and recovered backup timestamp. Require review before any DNS/traffic switch. Test the complete drill monthly and after security/migration changes. Daily logical dumps do not provide point-in-time recovery; introduce reviewed WAL archiving if the approved RPO becomes shorter.

Volume snapshots are supplemental; an untested crash-consistent snapshot is not proof of PostgreSQL recovery. OS administrators, the bootstrap superuser and encryption-key holders are trusted privileged actors. No claim is made that RLS contains their compromise.
