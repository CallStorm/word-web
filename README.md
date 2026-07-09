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

封面、HTML 预览、左侧导航大纲与页缩略图依赖 **officecli**。若宿主机未安装 officecli，后端会在生成预览时自动通过 `word-runner` Docker 镜像回退执行（需 Docker 可用且已构建镜像）。

**CentOS 7 等旧系统**（宿主机 `officecli` 因 GLIBCXX 无法运行）建议强制 Docker 回退，在 `.env` 或 systemd 服务中设置：

```bash
OFFICECLI_USE_DOCKER=1
```

无需在宿主机安装或修复 officecli；确保 `docker info` 正常且已执行 `bash docker/word-runner/build.sh` 即可。

## 生成模式

- **自由生成** — 根据文本/附件从零创建 Word
- **模板生成** — 基于 `{{key}}` 模板 merge 或 guided 替换

## 相关仓库

- [word-master](https://github.com/CallStorm/word-master) — Claude Code 插件
- [ppt-web](https://github.com/callstorm/ppt-web) — 架构参考

## License

MIT
