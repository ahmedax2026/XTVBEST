#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo 'Usage: bash start-xbest.sh /path/to/XBEST [server arguments...]' >&2
  exit 1
fi
if [[ -z "${TUNARR_BASIC_AUTH_USER:-}" ]]; then
  read -r -p 'XBest username: ' TUNARR_BASIC_AUTH_USER
fi
if [[ -z "${TUNARR_BASIC_AUTH_PASSWORD:-}" ]]; then
  read -r -s -p 'XBest password: ' TUNARR_BASIC_AUTH_PASSWORD
  echo
fi
if [[ -z "$TUNARR_BASIC_AUTH_USER" || -z "$TUNARR_BASIC_AUTH_PASSWORD" || "$TUNARR_BASIC_AUTH_USER" == *:* ]]; then
  echo 'A username (without a colon) and password are required.' >&2
  exit 1
fi
export TUNARR_BASIC_AUTH_USER TUNARR_BASIC_AUTH_PASSWORD
exec "$@"
