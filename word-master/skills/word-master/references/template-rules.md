# Template Preservation Rules

When operating in **template** mode (merge or guided), these rules are mandatory.

## Immutable Parts

Never modify these document parts:

- `/styles` — style definitions
- `/theme` — theme colors/fonts
- `/numbering` — list/numbering definitions
- `/settings` — document settings
- Section page size, margins, columns (unless user explicitly requests layout change)

## Allowed Operations

| Operation | merge path | guided path |
|-----------|------------|-------------|
| Replace `{{key}}` placeholders | Yes (via merge) | N/A |
| `set / --prop find=X --prop replace=Y` | Post-merge fixes only | Primary method |
| Table cell text replacement | Yes | Yes |
| Header/footer text | Yes | Yes |
| Add new body paragraphs | No | Only after anchor points |
| Change fonts/colors | **No** | **No** |
| Add/remove sections | **No** | Only if outline requires |

## Validation

After template operations, verify structure is preserved:

```bash
officecli view output.docx outline --json
officecli view output.docx stats --json
```

Compare paragraph/table counts with the original template. Significant structural drift = failure.

## Error Recovery

If merge leaves unresolved placeholders:

1. List them from merge output
2. Update `data.json` with best-effort values
3. Re-run merge
4. If still unresolved, use `set find={{key}} replace=<value>` as fallback
