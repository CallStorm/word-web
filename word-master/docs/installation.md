# Installation Guide

## Requirements

- [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI) >= 1.0.90
- Python 3.10+ (for helper scripts)
- Claude Code CLI (for plugin usage)

## Step 1: Install OfficeCLI

```bash
curl -fsSL https://d.officecli.ai/install.sh | bash
officecli --version
```

## Step 2: Install word-master Plugin

### Option A: Claude Code Marketplace

```
/plugin marketplace add CallStorm/word-master
/plugin install word-master
```

### Option B: Local Install

```bash
git clone https://github.com/CallStorm/word-master.git
cd word-master
claude plugin install ./skills
```

## Step 3: Python Dependencies

```bash
pip install -r skills/word-master/requirements.txt
```

## Step 4: Verify

```bash
bash skills/word-master/scripts/check_prereqs.sh
```

## word-web Docker Install

word-web bundles word-master as a submodule in `word-runner` Docker image.
See [word-web](https://github.com/callstorm/word-web) for full deployment.
