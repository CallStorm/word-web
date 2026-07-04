# Template Merge Workflow

Fast, deterministic generation using `{{key}}` placeholders in a `.docx` template.

## When to Use

- Template contains `{{key}}` markers (scan with `analyze_template.py`)
- Fixed layout documents: contracts, invoices, notices, form letters

## Pipeline

1. **Analyze template**:
   ```bash
   python3 skills/word-master/scripts/analyze_template.py <template.docx>
   ```

2. **Extract field values** from user prompt + `sources/summary.md` → write `data.json`:
   ```json
   {
     "title": "2026年度工作报告",
     "author": "张三",
     "date": "2026-07-04",
     "background": "...",
     "content": "...",
     "conclusion": "..."
   }
   ```

3. **Merge**:
   ```bash
   officecli merge <template.docx> exports/output.docx --data data.json
   ```

4. **Check unresolved** — Merge output lists remaining `{{...}}` placeholders.
   - Fill missing fields from prompt or mark as `[待补充]`
   - Re-run merge if data.json was updated

5. **Post-merge fixes** — Only use `set` with `find`/`replace` for minor corrections.
   Do NOT restructure the document.

6. **Verify** — `officecli view issues`, `officecli validate`

## Builtin Template Keys

| Template | Keys |
|----------|------|
| `report-zh.docx` | title, author, date, background, content, conclusion |
| `memo-zh.docx` | subject, datetime, attendees, minutes, decisions |
| `contract-zh.docx` | contract_title, party_a, party_b, sign_date, contract_body, payment_terms |
| `letter-zh.docx` | recipient, greeting, body, closing, sender |
| `application-zh.docx` | application_title, applicant, reason, details |

## Template Path Resolution

- Web mode: `$TEMPLATE_PATH`
- Standalone: user-provided path or `skills/word-master/templates/<name>.docx`
