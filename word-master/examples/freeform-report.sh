#!/usr/bin/env bash
# Example: freeform report generation
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

PROJECT=examples/freeform-report
mkdir -p "$PROJECT/sources" "$PROJECT/exports"

cat > "$PROJECT/outline.md" <<'EOF'
# Q2 Sales Report

## Background
Q2 revenue grew 25% year-over-year.

## Key Findings
- North region: +30%
- South region: +18%

## Recommendations
Continue investment in north region channels.
EOF

officecli create "$PROJECT/exports/report.docx"
officecli add "$PROJECT/exports/report.docx" /body --type paragraph \
  --prop text="Q2 Sales Report" --prop style=Title
officecli add "$PROJECT/exports/report.docx" /body --type paragraph \
  --prop text="Background" --prop style=Heading1
officecli add "$PROJECT/exports/report.docx" /body --type paragraph \
  --prop text="Q2 revenue grew 25% year-over-year." --prop style=Normal
officecli close "$PROJECT/exports/report.docx"

echo "Created: $PROJECT/exports/report.docx"
officecli view "$PROJECT/exports/report.docx" outline
