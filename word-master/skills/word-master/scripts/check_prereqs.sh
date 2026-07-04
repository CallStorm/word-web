#!/usr/bin/env bash
# Check OfficeCLI is installed and optionally word-master Python deps.
set -euo pipefail

MIN_VERSION="1.0.90"

if ! command -v officecli &>/dev/null; then
  echo "ERROR: officecli not found."
  echo "Install: curl -fsSL https://d.officecli.ai/install.sh | bash"
  exit 1
fi

VER=$(officecli --version 2>/dev/null | head -1 | tr -d '[:space:]')
echo "officecli version: ${VER}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQ="${SCRIPT_DIR}/../requirements.txt"
if [ -f "$REQ" ]; then
  pip install -q -r "$REQ" 2>/dev/null || python3 -m pip install -q -r "$REQ" 2>/dev/null || true
fi

echo "Prerequisites OK"
