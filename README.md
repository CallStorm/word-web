# word-web

基于 Claude Code + OfficeCLI + [word-master](https://github.com/CallStorm/word-master) 的 Word 文档生成 Web 应用。

## 架构

- **L0**: [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI) — `.docx` 引擎
- **L1**: [word-master](./word-master/) — Claude Code 插件（编排 Skill）
- **L2**: word-web — FastAPI + React + Docker 执行器

## 快速开始

```bash
# 1. 构建 word-runner 镜像
bash docker/word-runner/build.sh

# 2. 配置环境
cp .env.example .env

# 3. 启动开发环境
bash scripts/dev-web.sh
```

## 生成模式

- **自由生成** — 根据文本/附件从零创建 Word
- **模板生成** — 基于 `{{key}}` 模板 merge 或 guided 替换

## 相关仓库

- [word-master](https://github.com/CallStorm/word-master) — Claude Code 插件
- [ppt-web](https://github.com/callstorm/ppt-web) — 架构参考

## License

MIT
