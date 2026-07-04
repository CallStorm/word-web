# word-master

Claude Code plugin for generating editable Word documents (`.docx`) from text, attachments, or templates — powered by [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI).

## Install

### Prerequisites

```bash
curl -fsSL https://d.officecli.ai/install.sh | bash
```

### Claude Code Plugin

```bash
# Marketplace
/plugin marketplace add CallStorm/word-master
/plugin install word-master

# Or local clone
git clone https://github.com/CallStorm/word-master.git
cd word-master && claude plugin install ./skills
```

### Python deps (for source parsing scripts)

```bash
pip install -r skills/word-master/requirements.txt
```

## Usage

In Claude Code, simply ask:

> 帮我写一份关于 Q2 销售情况的工作报告

Or with a template:

> 用 contract-zh 模板，根据以下信息生成合同：甲方=A公司，乙方=B公司...

## Generation Modes

| Mode | Description |
|------|-------------|
| **freeform** | Create document from scratch via `officecli add/set` |
| **template-merge** | Fill `{{key}}` placeholders via `officecli merge` |
| **template-guided** | Preserve template layout, replace content via find/replace |

## Builtin Templates

| Template | Scenario |
|----------|----------|
| `report-zh.docx` | 工作报告 |
| `memo-zh.docx` | 会议纪要 |
| `contract-zh.docx` | 合同 |
| `letter-zh.docx` | 公函/信件 |
| `application-zh.docx` | 申请书 |

## Project Structure

```
word-master/
├── .claude-plugin/marketplace.json
├── skills/
│   ├── .claude-plugin/plugin.json
│   └── word-master/
│       ├── SKILL.md              # Main orchestration skill
│       ├── templates/            # Builtin .docx templates
│       ├── workflows/            # Mode-specific pipelines
│       ├── scripts/              # Helper scripts
│       └── references/           # Rules and guides
└── examples/
```

## word-web Integration

Used as a git submodule by [word-web](https://github.com/callstorm/word-web):

```bash
git submodule add https://github.com/CallStorm/word-master.git word-master
```

## License

MIT
