#!/bin/bash
# PREPARATION ONLY. Install root-owned; run as postgres with narrowly scoped OCI identity.
set -euo pipefail
umask 077
export PGHOST=/var/run/postgresql PGUSER=postgres
: "${STICHBILL_BACKUP_BUCKET:?Set the approved private bucket}"
: "${STICHBILL_BACKUP_NAMESPACE:?Set the approved namespace}"
# Public recipients only. Keep decryption keys OFF the VM.
recipients=/etc/stichbill/backup-recipients.txt
[ -s "$recipients" ]
backup_dir=$(mktemp -d /var/lib/postgresql/stichbill-backup.XXXXXXXX)
trap 'rm -rf -- "$backup_dir"' EXIT
name="stichbill-staging-$(date -u +%Y%m%dT%H%M%SZ)-$(cat /proc/sys/kernel/random/uuid).dump.age"
# Privileged local peer authentication is required: runtime cannot back up all tenants.
# No plaintext dump on disk; pipefail prevents publishing partial backups.
/usr/bin/pg_dump --format=custom --create --dbname=stichbill_staging | /usr/bin/age -R "$recipients" > "$backup_dir/$name"
[ -s "$backup_dir/$name" ]
(cd "$backup_dir" && /usr/bin/sha256sum "$name" > "$name.sha256")
# OCI CLI path must match the reviewed installation. No static cloud key in this script.
/usr/local/bin/oci os object put --auth instance_principal --namespace-name "$STICHBILL_BACKUP_NAMESPACE" --bucket-name "$STICHBILL_BACKUP_BUCKET" --name "$name" --file "$backup_dir/$name" --no-overwrite >/dev/null
/usr/local/bin/oci os object put --auth instance_principal --namespace-name "$STICHBILL_BACKUP_NAMESPACE" --bucket-name "$STICHBILL_BACKUP_BUCKET" --name "$name.sha256" --file "$backup_dir/$name.sha256" --no-overwrite >/dev/null
printf '%s\n' 'Encrypted staging backup uploaded; verify off-host restore separately.'
