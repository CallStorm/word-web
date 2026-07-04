# word-master

This repository is a Claude Code plugin for Word document generation.

## For Agents

1. Read `skills/word-master/SKILL.md` before any document work
2. Run `skills/word-master/scripts/check_prereqs.sh` to verify OfficeCLI
3. Delegate DOM operations to `officecli` — use `officecli help` when unsure
4. Final output must be in `exports/*.docx`

## Key Paths

- Skill entry: `skills/word-master/SKILL.md`
- Workflows: `skills/word-master/workflows/`
- Templates: `skills/word-master/templates/`
- Web mode: `skills/word-master/references/web-mode.md`
