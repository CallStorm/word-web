# word-master

Claude Code plugin for generating editable Word documents (`.docx`) — powered by [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI).

## Install

```bash
curl -fsSL https://d.officecli.ai/install.sh | bash
pip install -r skills/word-master/requirements.txt
```

## Usage

In Claude Code:

> 帮我写一份关于 Q2 销售情况的工作报告

## Bundled Skills

| Skill | Role |
|-------|------|
| `officecli-docx` | Build workflow + Delivery Gate (synced from OfficeCLI) |
| `officecli` | CLI reference (synced from OfficeCLI) |
| `word-master` | Web/standalone path orchestration |

## Project Structure

```
word-master/
├── skills/
│   ├── officecli/SKILL.md
│   ├── officecli-docx/SKILL.md
│   └── word-master/
│       ├── SKILL.md
│       ├── references/web-mode.md
│       └── scripts/
└── .claude-plugin/
```

## word-web Integration

Used as a git submodule by word-web. Docker image bakes skills at `/opt/word-master/skills/`.

Set `WORD_WEB_MOUNT_SKILLS=1` in dev to hot-mount host `skills/`.

## License

MIT
