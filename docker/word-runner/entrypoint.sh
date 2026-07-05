#!/usr/bin/env bash
# word-runner entrypoint: runs claude CLI with word-master plugin bundle
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

SKILLS_ROOT="/opt/word-master/skills"
for skill_dir in officecli officecli-docx word-master; do
  if [ ! -f "${SKILLS_ROOT}/${skill_dir}/SKILL.md" ]; then
    echo "ERROR: missing bundled skill ${SKILLS_ROOT}/${skill_dir}/SKILL.md" >&2
    exit 1
  fi
done
echo "[word-runner] bundled skills OK: officecli, officecli-docx, word-master" >&2

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
