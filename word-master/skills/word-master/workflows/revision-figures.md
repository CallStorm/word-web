# Revision: Insert Figures and Architecture Diagrams

Use this workflow when a user asks to add figures, flowcharts, or architecture diagrams during document revision.

## Rules

1. **Caption and image must be adjacent** — caption paragraph immediately above the diagram/image.
2. **Never** use bare `officecli add <docx> /body` without `--after` (appends to document end).
3. Use **Caption** or **Normal** style for figure titles; do not use Heading styles as figure captions.

## Steps

1. Locate the anchor paragraph:

   ```bash
   officecli view exports/<name>.docx annotated
   ```

   Note the `paraId` or `[段落 /body/p[N]]` where the figure should appear.

2. Insert caption, then diagram/image right after it:

   ```bash
   officecli add exports/<name>.docx /body --type paragraph \
     --prop text="图2-1：AI数字人核心技术架构图" --prop style=Caption \
     --after '/body/p[@paraId=XXXXXXXX]'

   officecli add exports/<name>.docx /body --type diagram \
     --after '/body/p[@paraId=<caption-paraId>]'
   ```

   For raster images:

   ```bash
   officecli add exports/<name>.docx /body --type image \
     --prop src=path/to/image.png \
     --after '/body/p[@paraId=<caption-paraId>]'
   ```

3. Self-check:

   ```bash
   officecli view exports/<name>.docx annotated | grep -A2 '图2-1'
   ```

   The next 1–2 lines must contain `[Image:` or a diagram marker. If the image appears at the document end while the caption is elsewhere, delete the misplaced image and re-insert with `--after`.

4. Regenerate previews:

   ```bash
   bash skills/word-master/scripts/generate_preview.sh <project_dir>
   ```
