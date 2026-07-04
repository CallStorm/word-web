# Template Guided Workflow

Preserve template structure while replacing content — for templates **without** `{{key}}` placeholders.

## When to Use

- User uploads a styled corporate template with fixed layout
- `analyze_template.py` returns zero placeholders
- User explicitly requests structure preservation

## Pipeline

1. **Analyze structure**:
   ```bash
   officecli view <template.docx> outline --json
   officecli dump <template.docx> / -o template.batch.json
   ```

2. **Copy template** as working file:
   ```bash
   cp <template.docx> exports/output.docx
   officecli open exports/output.docx
   ```

3. **Map content** — Write `content_map.json`:
   ```json
   [
     {"find": "旧标题文字", "replace": "新标题"},
     {"find": "旧正文段落", "replace": "新正文内容"}
   ]
   ```

   Derive `find` values from `officecli view <template.docx> annotated`.

4. **Replace content** — Use find/replace (whole document scope):
   ```bash
   officecli set exports/output.docx / --prop find="旧文字" --prop replace="新文字"
   ```

   Or batch:
   ```bash
   officecli batch exports/output.docx --input replacements.json
   ```

5. **Insert new sections** — Only if outline requires additional content:
   ```bash
   officecli add exports/output.docx '/body/p[N]' --type paragraph \
     --after "find:锚点文字" --prop text="新段落" --prop style=Normal
   ```

## Hard Constraints

Read `references/template-rules.md`. Summary:

- **Allowed**: body text replacement, table cell content, header/footer text
- **Forbidden**: modifying `/styles`, `/theme`, `/numbering`, page margins, fonts

## Fallback

If guided replacement cannot map more than 30% of content fields, inform the user and suggest:
1. Adding `{{key}}` placeholders to the template (merge path), or
2. Switching to freeform generation using the template styles as reference
