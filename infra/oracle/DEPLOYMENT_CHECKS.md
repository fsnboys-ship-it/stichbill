# Oracle VM acceptance checklist (no provisioning performed)

## Arm and release compatibility

Verify on the approved Arm VM, not through x86 emulation: `uname -m` must report aarch64, the exact Node 24.19.0/npm 11.9.0 pins must be available for that architecture, and `node -p process.arch` must report arm64. Clean-install dependencies on Arm (never copy x86 node_modules), run verify plus browser tests and the backup tests with real age/PostgreSQL 17. Exercise crypto Argon2, TLS/SMTP transport, Vite native optional packages and any browser native dependencies. Record image/package/binary versions and the exact release SHA. Current hosted Linux/Windows CI is x86; it does NOT establish Arm compatibility. Updating unsupported/security-stale pins is a separate reviewed change.

## PostgreSQL data volume and real cluster unit

Ubuntu's `postgresql.service` is a multi-cluster wrapper, not evidence that PostgreSQL 17 is running. Templates now require/bind to `postgresql@17-main.service`, with a readiness precheck before API start. Verify the actual cluster name using `pg_lsclusters`; render all unit references consistently if it differs. Do not install these Ubuntu templates on another distribution without adaptation.

Use a dedicated persistent block volume mounted by filesystem UUID at `/srv/stichbill_pgdata`, with data_directory `/srv/stichbill_pgdata/17/main`. Retain the volume on VM termination. Do not use ephemeral disk or initialize a cluster before verifying the mount. Prepare a root-owned, inaccessible empty mountpoint on the boot filesystem so it cannot become an accidental fallback data store. Example fstab entry (replace UUID only after verifying the approved device):

```text
UUID=<approved-data-filesystem-uuid> /srv/stichbill_pgdata ext4 defaults,nodev,nosuid,noexec,x-systemd.device-timeout=30s 0 2
```

Verify `findmnt --target /srv/stichbill_pgdata` shows the exact UUID/device, `mountpoint -q /srv/stichbill_pgdata` succeeds, and PostgreSQL `SHOW data_directory` points to the mounted volume. Install `systemd/postgresql-data.conf` at `/etc/systemd/system/postgresql@17-main.service.d/stichbill-data.conf`. Its mount dependency, mountpoint assertion and PG_VERSION precheck prevent silent fallback; BindsTo stops the cluster on mount-unit disappearance. API/backup units depend on the actual cluster, not the generic wrapper.

On a fresh host, prevent distribution package auto-creation of a boot-disk cluster (configure postgresql-common `create_main_cluster=false` before installing the server package). After the verified volume is mounted and an empty destination owned by postgres is prepared, an administrator may explicitly use `pg_createcluster --start-conf=manual --datadir=/srv/stichbill_pgdata/17/main 17 main`. Never automatically run initdb, pg_dropcluster, rsync or move an existing data directory; existing clusters/data require a separate reviewed migration. No such command is executed by this PR.

Before acceptance, perform controlled tests on a disposable staging VM: missing volume prevents PostgreSQL/API/backup start; restored mount allows deliberate restart; a synthetic record survives cluster/service and VM reboot; volume detachment/mount loss stops dependent services and never creates a new database on the boot disk. Verify mount/data-directory ownership and mode 0700. Verify disk-space, inode and backup-age alerts. Unit syntax review alone does not prove persistence or failure behavior.

## API, backup and TLS services

Validate systemd unit paths and binaries on the actual VM with systemd-analyze verify; API service starts as the dedicated unprivileged UID, cannot read privileged configuration/spools, and the readiness precheck rejects wrong roles/missing schema. Confirm proxy-only loopback listener and no 3001/5432 public ingress. Check cgroup IPAddressDeny enforcement; some kernels/systemd environments cannot enforce BPF restrictions. Metadata deny is additional defense, not a replacement for the separate-host IAM boundary. Local producer uses `PrivateNetwork=true` and Unix PostgreSQL socket; no OCI credential/SDK/upload execution is needed on A.

Nginx template must be tested with rendered domain/certificate paths and the actual installed version. Verify unknown hosts/TLS SNI are rejected, `/api/` failures remain API errors, no SPA fallback is applied to API routes, docs/readiness stay private, forwarded headers are replaced, and trusted origins/secure cookies/CSRF work through real HTTPS. Do not enable AAAA until IPv6 firewall/listeners/TLS are reviewed. Access logs remain disabled; any future logging must redact query strings, auth payloads and cookies.

Use an ACME webroot certificate flow: first issue with the port-80 challenge location available, then enable the TLS configuration. Configure certbot's renewal timer and install the executable root-owned deploy hook, for example `install -o root -g root -m 0755 infra/oracle/renew-certificate.sh /etc/letsencrypt/renewal-hooks/deploy/stichbill-nginx`. It validates Nginx before reloading and runs only after successful renewal. On the actual approved domain run certbot renew --dry-run, test the deploy hook separately, inspect timer next-run and certificate expiry externally, and alert well before expiration. Do not force renewal/reload on every API start. Existing public DNS, ACME issuance, renewal and real HTTPS were not tested here.

## SMTP acceptance (explicitly external)

Real SMTP delivery remains a mandatory staging acceptance test using private runtime configuration, not Git or CI secrets. Verify approved sender, SPF/DKIM/DMARC, TLS validation, canonical HTTPS reset fragment, known/unknown-account generic responses, successful inbox delivery, expiry/replay rejection and session revocation. Force a controlled delivery failure and confirm sanitized operational alerting without token/address/credential logging. Local fake-server TLS tests do not establish deliverability. No real message is sent by CI.
