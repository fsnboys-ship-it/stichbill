# Task 007 — Oracle staging preparation (not deployed)

Target: one supported Ubuntu LTS VM, native systemd services, Node 24.19.0/npm 11.9.0 and PostgreSQL 17. Pin and review patch/image versions before execution. Test the pinned native dependencies on Arm before choosing Ampere A1. No Oracle resource, DNS record, certificate, bucket, SMTP sender or secret is created by this repository. Every cloud/deployment action below requires separate approval. Use synthetic staging data only.

## Security contract and ownership decision

Staging database name is exactly `stichbill_staging`. Only IPv4 loopback and an explicit unprivileged port (1024–65535) are accepted; the Oracle template uses 5432. All three provisioning URLs must specify the same port. This permits the existing native Windows test server on 55432 without opening remote database access. Remote hosts, URL query/fragment overrides, other database names, short passwords and incorrect application usernames are rejected. No production environment is accepted. The API remains on `127.0.0.1:3001`.

`stichbill_staging_owner` is NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION, with no role settings, memberships in either direction, explicit unrelated grants, application objects or other database ownership. The owner owns exactly the dedicated database. It is not an application schema/function owner.

The separate controlled bootstrap administrator is a login superuser, authenticated directly (`current_user=session_user`). It is trusted root, never present in the API service. It temporarily assumes the owner with transaction-local SET ROLE for database grants, then RESET ROLE. No persistent administrator/owner membership is created. PostgreSQL superusers can assume roles without membership; this is the explicit administrator-to-owner mechanism, not a membership loophole for application roles.

The existing restricted migrator owns public/auth schemas, tables, indexes and SECURITY DEFINER functions. It retains CONNECT/CREATE on its dedicated database; runtime retains CONNECT plus the existing schema/table/function grants. Both retain the exact existing role restrictions and zero memberships. The migration runner executes as migrator, never bootstrap or owner. The owner grants database permissions; the migrator grants application-object permissions. The validator checks grantors as well as grantees and grant options. It rejects drift rather than repairing it. Existing SQL files, checksums, FORCE RLS policies, function bodies/search paths and application grants are unchanged.

Local dev/test databases retain their explicitly documented legacy login-superuser database-owner contract. The legacy contract is accepted only for the existing bounded dev/test names; staging cannot use it. No conversion of an existing development/test database is automatic. Bootstrap mode accepts only a fresh empty dedicated staging database owned by the connected bootstrap administrator, then atomically creates/transfers to the NOLOGIN owner. An existing unexpected owner/role/ACL fails closed.

## Topology and network

One VM hosts Nginx, built React files, the existing NestJS API and PostgreSQL. Put PostgreSQL data on a persistent attached volume (50–100 GB initially) separate from the boot volume. Mount by UUID and make PostgreSQL depend on that mount; a missing mount must prevent startup rather than create an empty replacement cluster on the boot disk. Preserve data volumes on instance termination. One VM is a single point of failure; this is staging, not HA production.

Allow TCP 443 to approved testers; port 80 for ACME/HTTPS redirect. Restrict SSH to administrators (or approved bastion). Do not expose 3001/5432. Use host firewall and OCI network rules. No public database address. Keep PostgreSQL `listen_addresses='127.0.0.1'`; use SCRAM host authentication, never trust. OS-level postgres peer authentication is reserved for approved local administration/backups. Restrict OCI metadata/instance-principal access: API UID must not be able to use the backup uploader's cloud identity. Instance principals are VM identities, not OS-user identities; enforce metadata firewall/user separation or choose a separately isolated uploader before enabling backups.

## Private configuration

Render `staging.env.example` privately to `/etc/stichbill/staging.env`, root-owned mode 0600, consumed by systemd. Generate independent 24-byte hex passwords for runtime/migrator. Bootstrap must use a separate password of at least 24 characters; provisioning rejects shared credentials across all three connections. Never put credential values in Git, command arguments, logs or PRs. The runtime file must contain only the shown runtime keys, no ADMIN_DATABASE_URL/MIGRATION_DATABASE_URL. Avoid the local `.env` bootstrap helpers for staging.

Create separate root-only provisioning and migration environment files outside the repository:

- `provision.env`: APP_ENV=staging, APPROVE_STAGING_PROVISION=stichbill_staging, ADMIN_DATABASE_URL (separate bootstrap), DATABASE_URL (runtime), MIGRATION_DATABASE_URL (migrator). Every URL targets 127.0.0.1:5432/stichbill_staging. Role names must match the contract; bootstrap cannot be an application/owner identity.
- `migration.env`: APP_ENV=staging, ALLOW_MIGRATIONS=true, APPROVE_STAGING_MIGRATIONS=stichbill_staging, MIGRATION_DATABASE_URL only. No bootstrap credential or SMTP secret.
- `backup.env`: approved bucket/namespace identifiers only; no database password. Decryption key stays off the VM.

Use an exact canonical origin, e.g. `https://staging.example.invalid` after replacing the placeholder. No path, trailing slash, wildcard, credentials or alternate port. SMTP requires host, port 465/587, username/password and a bare sender email. Port 587 requires STARTTLS; port 465 uses implicit TLS. Certificate verification stays enabled. Configure sender verification/SPF/DKIM/DMARC and staging recipient restrictions at the provider. Runtime refuses incomplete staging email configuration. Local development continues using the private mailbox. Recovery errors are generic to users; provider exception details and tokens are never logged. Monitor the sanitized failure event.

## Preparation and review before execution

1. Approve region, domain, costs, VM capacity, image/architecture, persistent volume and backup recovery objectives. Check current Oracle quotas and reclaim policy; free-tier availability is not guaranteed.
2. Prepare a reviewed immutable release from the exact PR commit. Run clean install, full verify, workflow check and browser suite. No secrets during build; no migrations during install/build/start. Preserve previous release for rollback.
3. Install PostgreSQL 17, Nginx, reviewed Node/npm binaries, age and OCI CLI. Confirm the template's binary paths. Root owns release files; the API user cannot modify releases or read privileged environment files. Do not copy node_modules from a different CPU architecture.
4. Create the empty database as the selected bootstrap superuser using a private administration session. Do not reuse a populated database. Restrict bootstrap TCP authentication to loopback and local administrators.

After separate approval, root can use transient one-shot systemd units so secrets are loaded from private files rather than arguments:

```sh
systemd-run --wait --collect --unit=stichbill-provision \
  --property=WorkingDirectory=/opt/stichbill/current \
  --property=EnvironmentFile=/etc/stichbill/provision.env \
  /usr/local/bin/node scripts/provision-staging-db.mjs
systemd-run --wait --collect --unit=stichbill-migrate \
  --property=WorkingDirectory=/opt/stichbill/current \
  --property=EnvironmentFile=/etc/stichbill/migration.env \
  /usr/local/bin/node apps/api/dist/database/migrate.js --approve-staging-migrations
systemd-run --wait --collect --unit=stichbill-readiness \
  --property=WorkingDirectory=/opt/stichbill/current \
  --property=EnvironmentFile=/etc/stichbill/staging.env \
  /usr/local/bin/node apps/api/dist/database/check.js
```

Provisioning is transactional and advisory-locked; reruns verify rather than repair. Migration uses a separate advisory lock, dedicated role, SHA-256 history and explicit flag/environment gates. A failed DDL transaction rolls back. Never edit an applied migration. Resolve existing drift through a separately reviewed repair, not automated grants. `APP_ENV=production` remains rejected.

## HTTPS, proxy and service activation (later approval only)

Replace placeholders in `nginx-staging.conf`; install `nginx-api.conf` as the named snippet. Start with the HTTP ACME location to issue the certificate, then enable the TLS server. Do not load certificate paths that do not exist. Validate `nginx -t` and systemd units before enabling. Set DNS A to the approved IP; do not publish AAAA until IPv6 TLS/firewall routing is implemented. Configure certificate renewal and alert before expiry.

One origin serves frontend and `/api/*`. Proxy preserves the API path and replaces forwarded headers. Fastify trusts only the first hop from 127.0.0.1; direct non-proxy forwarding headers are ignored. No cross-origin CORS permission is added. Existing Secure/HttpOnly/SameSite=Strict/__Host- cookies and CSRF validation are retained; unapproved/local origins are denied in staging. Swagger and detailed readiness are blocked externally; local monitoring checks readiness with the runtime role. Proxy authentication rate limits supplement PostgreSQL throttles; do not trust arbitrary X-Forwarded-For. No auth caches or request-body/cookie logs.

Install the API service only after private env/readiness succeeds. Verify synthetic owner registration, logout/login, business/shop/branch creation, staff scopes, cross-tenant denial, password reset and persistence across service/VM restarts. Staging must be clearly communicated to testers; remove any old frontend-preview wrapper only in the intended deployment checkout, not by overwriting unrelated edits.

## Release, rollback and remaining production gates

Before subsequent migrations, take and verify an encrypted backup. Stop writes as required by the reviewed migration, run it once, check readiness, switch the release symlink and restart. Roll back application only if schema compatibility is established. No automatic down migration/reset/drop exists. Restore is a separate approved operation.

See BACKUP_RESTORE.md. Staging targets RPO <=24h and RTO <=4h are unproven until a timed drill. Production still requires email ownership verification policy, monitored real SMTP delivery, session/reset/throttle retention, dependency/runtime security review, tested Arm builds, independent backups, on-call ownership and an availability decision. No production readiness is claimed.
