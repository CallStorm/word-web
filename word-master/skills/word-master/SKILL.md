---
name: word-master
description: Generate Word documents via word-web or standalone; thin orchestration over officecli-docx. Use for reports, memos, letters, and general .docx generation.
---

# word-master

Thin orchestration for Word (.docx) generation. **Does not replace** bundled skills — routes to them and adds web paths only.

| Skill | Role |
|-------|------|
| `skills/officecli-docx/SKILL.md` | **Authoritative** build workflow + Delivery Gate |
| `skills/officecli/SKILL.md` | docx CLI reference (help-first, resident mode) |
| This file | Paths, pipeline, preview contract |

## 0. Prerequisites

```bash
bash skills/word-master/scripts/check_prereqs.sh
```

If `officecli` is missing: `curl -fsSL https://d.officecli.ai/install.sh | bash`

## 1. Load skills (mandatory order)

1. Read `skills/officecli-docx/SKILL.md` — follow **Common Workflow** (open → orient → build → close → QA).
2. When CLI syntax is uncertain: `officecli help docx <element>` — never guess.
3. Load scene skill once per document:
   - `scenario=academic` in `JOB_OPTIONS_JSON` → `officecli load_skill academic-paper`
   - otherwise → `officecli load_skill word`

**Build discipline:**
- `officecli open "$FILE"` at start; `officecli close "$FILE"` before QA **and before host reads the file** (preview, Delivery Gate).
- Run commands **incrementally**; check exit codes after each step.
- Prefer `add`/`set` with `--after` anchors (`@paraId=`).

## 2. Paths

| Mode | Detection |
|------|-----------|
| **Web** | `JOB_ID` set → see `references/web-mode.md` |
| **Standalone** | No `JOB_ID` → `./projects/<name>/` |

```
WORK_ROOT  = $WORK_ROOT or ./projects/<project_name>/
UPLOADS    = $UPLOADS_DIR or ./uploads/
EXPORTS    = $WORK_ROOT/exports/
SOURCES    = $WORK_ROOT/sources/
```

Create `WORK_ROOT`, `exports/`, `sources/` if missing.

## 3. Pipeline

1. **Parse uploads** (if any):
   ```bash
   python3 skills/word-master/scripts/source_to_md.py "$UPLOADS" -o "$WORK_ROOT/sources/summary.md"
   ```
2. **Outline** — write `$WORK_ROOT/outline.md` (title, section headings, key points) before building.
3. **Create + open**:
   ```bash
   FILE="$WORK_ROOT/exports/output.docx"
   officecli create "$FILE"
   officecli open "$FILE"
   ```
4. **Build incrementally** — follow officecli-docx Common Workflow:
   - Chapter titles: `style=Heading1`; subsections: `style=Heading2`
   - Each item in `outline.md` or `JOB_OPTIONS_JSON.outline` → one **Heading1**
   - Cover, TOC, tables, figures: **only when user prompt asks** — no defaults
5. **Close + Delivery Gate** — see officecli-docx § QA; fix all REJECT gates.
6. **Handoff (web)** — report `exports/*.docx` path via `find_docx.py`. **Do not** run preview scripts; the host generates cover PNG + HTML + outline after finalize.

## 4. Structure minimum (word-web)

Before handoff, run `officecli view "$FILE" outline` and confirm:

- Heading1 / Heading2 hierarchy (not Normal+bold for chapter titles)
- If outline was provided, each outline item appears as a Heading1

## 5. Project layout

```
<WORK_ROOT>/
├── sources/summary.md
├── outline.md
├── .preview/page-*.png   # host-generated
└── exports/output.docx
```

## References

- `references/web-mode.md` — word-web env vars
- `skills/officecli-docx/SKILL.md` — build + Delivery Gate
