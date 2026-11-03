#!/bin/bash
# Database host: encrypt locally ONLY. This program has NO OCI credentials or upload path.
set -euo pipefail
umask 077
export PGHOST=/var/run/postgresql PGUSER=postgres
: "${STICHBILL_RELEASE_SHA:?Set the reviewed release commit SHA}"
exec /usr/local/bin/node /opt/stichbill/current/infra/oracle/create-backup.mjs
