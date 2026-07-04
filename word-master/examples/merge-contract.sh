#!/usr/bin/env bash
# Example: template merge for contract
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

TEMPLATE=skills/word-master/templates/contract-zh.docx
OUTPUT=examples/merge-contract/output.docx
mkdir -p examples/merge-contract

cat > examples/merge-contract/data.json <<'EOF'
{
  "contract_title": "软件开发服务合同",
  "party_a": "甲方科技有限公司",
  "party_b": "乙方信息技术有限公司",
  "sign_date": "2026-07-04",
  "contract_body": "乙方为甲方提供企业管理系统开发服务，包括需求分析、系统设计、开发测试与上线部署。",
  "payment_terms": "合同签订后支付30%预付款，验收通过后支付剩余70%。"
}
EOF

officecli merge "$TEMPLATE" "$OUTPUT" --data examples/merge-contract/data.json
echo "Created: $OUTPUT"
officecli view "$OUTPUT" text
