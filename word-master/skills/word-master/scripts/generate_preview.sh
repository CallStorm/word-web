#!/usr/bin/env bash
# Generate .preview/page-*.png screenshots for word-web cover + preview modal.
# Usage: bash skills/word-master/scripts/generate_preview.sh [WORK_ROOT_or_docx_path]
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"

MAX_PAGES="${MAX_PREVIEW_PAGES:-20}"
INPUT="${1:-${WORK_ROOT:-.}}"

if ! command -v officecli &>/dev/null; then
  echo "ERROR: officecli not found" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_docx() {
  local root="$1"
  if [[ -f "$root" && "$root" == *.docx ]]; then
    echo "$root"
    return 0
  fi
  python3 "$SCRIPT_DIR/find_docx.py" "$root" 2>/dev/null || true
}

DOCX="$(resolve_docx "$INPUT")"
if [[ -z "$DOCX" || ! -f "$DOCX" ]]; then
  echo "ERROR: no .docx found under $INPUT" >&2
  exit 1
fi

if [[ -f "$INPUT" && "$INPUT" == *.docx ]]; then
  PREVIEW_DIR="$(dirname "$INPUT")/../.preview"
else
  PREVIEW_DIR="$INPUT/.preview"
fi
mkdir -p "$PREVIEW_DIR"

generated=0
for page in $(seq 1 "$MAX_PAGES"); do
  out="$PREVIEW_DIR/page-${page}.png"
  if ! officecli view "$DOCX" screenshot --page "$page" --render html -o "$out" >/dev/null 2>&1; then
    if [[ "$page" -eq 1 ]]; then
      echo "ERROR: failed to render preview page 1" >&2
      exit 1
    fi
    rm -f "$out"
    break
  fi
  if [[ ! -s "$out" ]]; then
    rm -f "$out"
    if [[ "$page" -eq 1 ]]; then
      echo "ERROR: preview page 1 is empty" >&2
      exit 1
    fi
    break
  fi
  generated=$((generated + 1))
done

if [[ "$generated" -eq 0 ]]; then
  echo "ERROR: no preview pages generated" >&2
  exit 1
fi

echo "Generated $generated preview page(s) in $PREVIEW_DIR"
