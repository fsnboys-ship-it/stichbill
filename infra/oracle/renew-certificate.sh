#!/bin/sh
# Certbot deploy hook, called only after successful renewal. No credentials here.
set -eu
/usr/sbin/nginx -t
/bin/systemctl reload nginx.service
