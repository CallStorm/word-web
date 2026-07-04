#!/usr/bin/env bash
# word-runner entrypoint: runs claude CLI with word-master plugin
set -euo pipefail

PROMPT="${PROMPT:-}"
JOB_ID="${JOB_ID:-}"
EXTRA="${CLAUDE_EXTRA_ARGS:-}"
RESUME_SESSION="${RESUME_SESSION:-0}"
RESUME_SESSION_ID="${RESUME_SESSION_ID:-}"

echo "[word-runner] job=${JOB_ID:-?} resume=${RESUME_SESSION:-0}" >&2

if [ -z "$PROMPT" ]; then
  echo "ERROR: PROMPT env var is required" >&2
  exit 1
fi

ARGS=( --print )
if [ "${RESUME_SESSION}" = "1" ] && [ -n "${RESUME_SESSION_ID}" ]; then
  ARGS=(--resume "${RESUME_SESSION_ID}" "${ARGS[@]}")
fi

if [ -n "$EXTRA" ]; then
  # shellcheck disable=SC2206
  EXTRA_ARR=( $EXTRA )
  ARGS+=( "${EXTRA_ARR[@]}" )
fi

cd /opt/word-master
echo "[word-runner] exec: claude ${ARGS[*]}" >&2
exec claude "${ARGS[@]}" -p "${PROMPT}"
