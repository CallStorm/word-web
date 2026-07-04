---
name: word-master
description: Generate editable Word documents (.docx) from user text, attachments, or templates using OfficeCLI. Use when the user wants reports, memos, contracts, letters, or template-based document generation.
---

# word-master

End-to-end Word document generation orchestration, powered by [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI).

**This skill orchestrates the pipeline.** For DOM-level `.docx` operations, delegate to OfficeCLI (`officecli help docx`). For scene-specific writing rules, run `officecli load_skill word` or `academic-paper`.

## Step 0 — Prerequisites

```bash
bash skills/word-master/scripts/check_prereqs.sh
```

If `officecli` is missing, install:

```bash
curl -fsSL https://d.officecli.ai/install.sh | bash
```

When unsure about OfficeCLI syntax, run `officecli help docx <element>` — never guess property names.

## Step 1 — Detect Run Mode

| Mode | Detection |
|------|-----------|
| **Web** | `JOB_ID` env var is set → read `references/web-mode.md` |
| **Standalone** | No `JOB_ID` → use current working directory |

Resolve paths:

```
WORK_ROOT  = $WORK_ROOT or ./projects/<project_name>/
UPLOADS    = $UPLOADS_DIR or ./uploads/
EXPORTS    = $WORK_ROOT/exports/
SOURCES    = $WORK_ROOT/sources/
```

Create `WORK_ROOT`, `exports/`, `sources/` if missing.

## Step 2 — Parse Sources

If uploads exist:

```bash
python3 skills/word-master/scripts/source_to_md.py "$UPLOADS" -o "$WORK_ROOT/sources/summary.md"
```

Also read user prompt and any inline attachments. Write `outline.md` before building the document.

## Step 3 — Route Generation Mode

Read `generation_mode` from user request or `JOB_OPTIONS_JSON`:

| Mode | Workflow |
|------|----------|
| `freeform` | `workflows/freeform.md` |
| `template` + `{{key}}` placeholders | `workflows/template-merge.md` |
| `template` + no placeholders | `workflows/template-guided.md` |

Load OfficeCLI sub-skill by scenario:

| scenario | sub-skill |
|----------|-----------|
| `academic` | `officecli load_skill academic-paper` |
| default | `officecli load_skill word` |

## Step 4 — Build Document

Follow the selected workflow. General rules:

- Final `.docx` must land in `exports/`
- Use `officecli batch` for multi-step writes (one save cycle)
- Use `officecli open` / `officecli close` for long editing sessions
- Prefer stable `@paraId=` paths from `officecli get --json` over positional indices

## Step 5 — Quality Gate (mandatory)

Before delivery:

```bash
officecli view <doc.docx> issues --json
officecli validate <doc.docx>
```

Fix all **Error**-severity issues. Warnings should be addressed when feasible.

## Step 6 — Deliver

```bash
python3 skills/word-master/scripts/find_docx.py "$WORK_ROOT"
```

Report the `exports/*.docx` path to the user. In web mode, ensure the file is under `exports/`.

## Template Hard Constraints

When using a user template (merge or guided), read `references/template-rules.md` and **never** modify:

- `/styles`, `/theme`, `/numbering`, `/settings`
- Section page layout unless explicitly requested

## Builtin Templates

Shipped under `skills/word-master/templates/`:

| File | Use case |
|------|----------|
| `report-zh.docx` | 工作报告 |
| `memo-zh.docx` | 会议纪要 |
| `contract-zh.docx` | 合同 |
| `letter-zh.docx` | 公函/信件 |
| `application-zh.docx` | 申请书 |

Analyze placeholders: `python3 skills/word-master/scripts/analyze_template.py <template.docx>`

## Project Layout

```
<WORK_ROOT>/
├── sources/
│   └── summary.md
├── outline.md
├── content_map.json      # template-guided only
├── data.json             # template-merge only
└── exports/
    └── output.docx
```

## References

- `references/web-mode.md` — word-web environment variables
- `references/template-rules.md` — template preservation rules
- `references/officecli-bridge.md` — OfficeCLI collaboration
- `references/scenarios/` — per-scenario writing guides
