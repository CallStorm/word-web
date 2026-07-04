# Freeform Generation Workflow

Generate a Word document from scratch based on user prompt and optional attachments.

## Pipeline

1. **Summarize** — Write `outline.md` with:
   - Document title
   - Section headings (Heading1 level)
   - Key points per section
   - Tables/images needed (if any)

2. **Load sub-skill** — `officecli load_skill word` (or `academic-paper` for academic scenario)

3. **Create document**:
   ```bash
   officecli create exports/<name>.docx
   ```

4. **Build sections** — For each section in `outline.md`:
   ```bash
   # Document title (once, at the top)
   officecli add exports/<name>.docx /body --type paragraph \
     --prop text="<document title>" --prop style=Title
   # Section headings
   officecli add exports/<name>.docx /body --type paragraph \
     --prop text="<heading>" --prop style=Heading1
   # Optional subsections
   officecli add exports/<name>.docx /body --type paragraph \
     --prop text="<subheading>" --prop style=Heading2
   # Body paragraphs
   officecli add exports/<name>.docx /body --type paragraph \
     --prop text="<body text>" --prop style=Normal
   ```

   **Never** use `Normal` + manual bold for titles. Map `outline.md` hierarchy to Word styles.

5. **Optional TOC** — If `include_toc` is true:
   ```bash
   officecli add exports/<name>.docx /body --type toc
   officecli refresh exports/<name>.docx
   ```

6. **Tables** — When outline specifies tabular data:
   ```bash
   officecli add exports/<name>.docx /body --type table \
     --prop rows=N --prop cols=M
   ```

7. **Images** — When attachments include images to embed:
   ```bash
   officecli add exports/<name>.docx /body --type image --prop src=<path>
   ```

8. **Batch optimization** — For documents with 10+ operations, collect into JSON and run:
   ```bash
   officecli batch exports/<name>.docx --input batch.json
   ```

9. **Verify** — `officecli view issues`, `officecli validate`, `officecli view outline` (Title → Heading1 → Normal), fix errors

10. **Preview** — `bash skills/word-master/scripts/generate_preview.sh "$WORK_ROOT"`

11. **Close** — `officecli close exports/<name>.docx`

## Long Document Strategy

- Write one chapter at a time, checkpoint after each Heading1 section
- Use `officecli open` at start, `officecli close` at end
- Keep paragraphs concise; split long blocks into multiple paragraphs
