# OfficeCLI Bridge

word-master delegates all `.docx` DOM operations to OfficeCLI. Do not reimplement document manipulation.

## Layering

```
word-master (orchestration)
  → officecli load_skill word | academic-paper (scene rules)
  → officecli create|add|set|merge|dump|view|batch (DOM ops)
```

## When to Consult OfficeCLI Help

```bash
officecli help                    # all commands
officecli help docx               # Word elements
officecli help docx paragraph     # paragraph schema
officecli help docx set paragraph # settable props
```

## Common Commands (quick ref)

| Task | Command |
|------|---------|
| Create blank doc | `officecli create file.docx` |
| Add paragraph | `officecli add file.docx /body --type paragraph --prop text="..." --prop style=Heading1` |
| Replace text | `officecli set file.docx / --prop find=old --prop replace=new` |
| Template merge | `officecli merge template.docx output.docx --data data.json` |
| View structure | `officecli view file.docx outline` |
| Quality check | `officecli view file.docx issues` |
| Batch ops | `officecli batch file.docx --input ops.json` |

## Sub-skill Loading

Load exactly **one** sub-skill per document:

```bash
officecli load_skill word           # reports, memos, letters
officecli load_skill academic-paper # papers, thesis (APA/IEEE/MLA)
```

Do not stack multiple sub-skills. Loaded rules persist for the session.

## Resident Mode

For multi-step editing:

```bash
officecli open report.docx
# ... multiple add/set commands ...
officecli close report.docx
```

Auto-resident starts on first access (60s idle). Explicit open/close recommended for 10+ operations.
