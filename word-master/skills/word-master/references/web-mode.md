# Web Mode Environment Variables

When `word-web` dispatches a job, these environment variables are injected into the Docker container.

| Variable | Required | Description |
|----------|----------|-------------|
| `JOB_ID` | Yes | Unique job identifier |
| `WORK_ROOT` | Yes | Project workspace, e.g. `/work/projects/<job_id>/` |
| `UPLOADS_DIR` | No | Upload staging dir, default `/work/uploads/<job_id>/` |
| `TEMPLATE_PATH` | Template mode | Absolute path to `.docx` template |
| `JOB_OPTIONS_JSON` | No | JSON blob with JobOptions fields |
| `PROMPT` | Yes | User prompt (also passed via claude `-p`) |

## JOB_OPTIONS_JSON Fields

```json
{
  "generation_mode": "freeform | template",
  "template_id": "uuid or null",
  "language": "zh | en",
  "scenario": "report | contract | letter | memo | academic",
  "tone": "formal | casual | technical",
  "audience": "general",
  "include_toc": true,
  "include_cover": true,
  "page_size": "A4 | Letter",
  "citation_style": "APA | IEEE | MLA | null"
}
```

## Path Convention

```
/work/                              # User data root (Docker volume)
├── uploads/<job_id>/               # Raw uploads
├── templates/<template_id>/        # User templates
│   └── template.docx
└── projects/<job_id>/              # Agent workspace (= WORK_ROOT)
    ├── sources/summary.md
    ├── outline.md
    ├── .preview/                   # PNG page screenshots for web UI
    │   ├── page-1.png              # Dashboard cover thumbnail
    │   └── page-2.png              # Additional pages (preview modal)
    └── exports/output.docx         # Final artifact
```

Generate previews before delivery:

```bash
bash skills/word-master/scripts/generate_preview.sh "$WORK_ROOT"
```

## Web vs Standalone

| Aspect | Web | Standalone |
|--------|-----|------------|
| Work root | `$WORK_ROOT` | `./projects/<name>/` |
| Template | `$TEMPLATE_PATH` | User-provided path |
| Options | `$JOB_OPTIONS_JSON` | Parsed from conversation |
| Output scan | Backend finds `exports/*.docx` | Agent reports path |
