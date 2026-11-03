# Backup identity boundary — separate uploader host required

## Finding and decision

The original same-VM `oci --auth instance_principal` backup command is unsafe as an API/backup identity boundary. OCI instance principals belong to a VM, not a Unix UID; running the uploader as postgres, using a different environment file or requiring IMDSv2 does not isolate its permissions from other VM processes. Oracle explicitly warns that users with access to an instance inherit its instance-principal privileges. [Oracle instance-principal security considerations](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/callingservicesfrominstances.htm)

No real tenancy was inspected and no permission-denial test has been performed against OCI. Therefore uploads remain DISABLED. Do not interpret a local test, template, marker file or metadata filter as proof of live IAM isolation.

## Concrete isolation design

Use two independently administered hosts; this is an operational topology change, not an application/backend rewrite:

1. **API/database host A:** existing NestJS/PostgreSQL architecture. It has NO backup Object Storage allow policy, no backup API key, no OCI profile granting uploads and no uploader private SSH key. Exclude A from every dynamic group with backup access, including broad compartment/tag rules. IAM allows are additive: review inherited and tenancy-wide policies, not only the new group. The encrypted backup producer runs as postgres with `PrivateNetwork=true` and a private Unix PostgreSQL socket; its code contains no upload operation. API cannot read its mode-0700 spool. An API systemd metadata-address deny rule is defense in depth only; do not rely on BPF availability as the IAM boundary.
2. **Uploader host B:** NO API, database, app reverse proxy or publicly exposed upload endpoint. Its dynamic group matches B's exact instance OCID, never a broad app compartment/tag. It receives only OBJECT_CREATE on the approved private staging backup bucket. No object overwrite/delete/read, bucket administration or IAM privileges. Retrieval/retention use separately controlled identities. Example policy for review (placeholders are not deployable configuration):

   ```text
   Dynamic-group rule: instance.id = '<uploader-instance-ocid>'
   Allow dynamic-group stichbill-backup-uploader to manage objects in compartment <backup-compartment>
     where all {target.bucket.name = '<private-staging-backup-bucket>', request.permission = 'OBJECT_CREATE'}
   ```

3. **One-way pull:** B holds a dedicated SSH private key; A holds only its public key. A exposes a read-only SFTP export of COMPLETE encrypted `.sbb` bundles to B's private source IP only. Pin A's SSH host key on B; no agent forwarding, shell, sudo, tunnels, port forwarding or passwords. Do not give B a postgres login or database password. Do not run SFTP as postgres. A's export account is `stichbill-export`, chrooted to a root-owned `/srv/stichbill-export` with `ForceCommand internal-sftp -R`, `DisableForwarding yes`, `PermitTTY no`, and key-only authentication. A root-controlled export step copies only successfully published `<uuid>.ready/<uuid>.sbb` artifacts into the export area; no dump, key, private config, symlink or `.partial-*` path is exported. That export/transfer setup must be reviewed/tested on the actual hosts before activation; no SSH accounts or keys are created by this PR.
4. **Local uploader snapshot:** B downloads each bundle into an owner-only directory, with mode 0600 and ownership of `stichbill-upload`. `upload-backup.mjs` snapshots the file privately, validates envelope/size/SHA-256, then makes ONE conditional, single-part PUT with the server-side SHA-256 checksum. Ciphertext and checksum are in the same object; there is no second sidecar upload. Retries use the same object name and `If-None-Match: *`; no overwrite is permitted. This design avoids half-published archive/checksum pairs. CLI documentation supports single-part and checksum/precondition options. [OCI PutObject CLI](https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/os/object/put.html)

No cloud resource is created here. Reusing an approved independent uploader can avoid a new VM; a new B would require separate cost/capacity approval. Do not silently place B's role on A to preserve a one-VM budget. B's own administrators are trusted; all processes on B can potentially use B's principal, so do not co-host untrusted workloads there.

## Fail-closed activation gate (not performed)

The supplied uploader service always passes `STICHBILL_ENABLE_UPLOADS=no` directly to its executable, overriding the environment file. There is no timer or install target. Database-host producer has no OCI upload path. A separate reviewed activation change is required before uploads can run.

Before changing that literal, an administrator must record:

- A/B instance OCIDs, complete relevant IAM/dynamic-group policy review and approved bucket/compartment; prove that A and B are different hosts.
- Under the actual API service identity/cgroup, attempts to obtain metadata/backup credentials fail where metadata filtering is available. Separately, under A's own instance principal, a synthetic staging canary OBJECT_CREATE must be DENIED by IAM even if metadata is reachable. Confirm Audit `principalId` is A. Do not test with a user API key or B's credentials.
- On B, the same approved synthetic canary create is allowed, overwrite and deletion are denied, and a separate recovery identity can retrieve/check it. Run only after explicit staging-resource/data-write approval; no such requests run in CI.
- Pinned-host-key/read-only SFTP transfer succeeds from B, shell/forwarding/unauthorised source IPs fail, and A/API has no route/credentials to use B as an upload or metadata proxy.
- API cannot read backup spool/export control files, root-owned scripts, key material or B's private configuration. Check actual Linux ownership/modes and sandbox behavior after reboot.

Only after those tests pass, root may create `/etc/stichbill/uploader-isolation-approved.json` on B (regular file, UID 0, mode 0600) containing `apiInstanceId`, `uploaderInstanceId`, `namespace`, `bucket`, and an explicit short `expiresAt` UTC timestamp. PID 1 passes this root-only file to the unprivileged uploader with LoadCredential; the service is not expected to read a root-0600 source file directly. The CLI requires the expected systemd credential directory, checks private credential permissions, checks the IDs differ, validates expiry, and compares B's actual IMDSv2 instance ID before using OCI authentication. This file is a record of administrator acceptance, NOT an independent IAM proof. Never put actual values or credentials in Git/CI. Re-review after any IAM, host, SSH or service change; expiry disables uploads. Monitor missing backup age and upload denial/failure independently.

If API-host denial, policy review, service isolation or independent-host availability cannot be proved, leave uploads disabled and report staging backup acceptance as BLOCKED. Local encryption tests cannot close this gate.
