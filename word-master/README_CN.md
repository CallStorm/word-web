# word-master

Claude Code 插件 — 基于 OfficeCLI 生成可编辑 Word 文档（`.docx`）。

## 安装

```bash
# 1. 安装 OfficeCLI
curl -fsSL https://d.officecli.ai/install.sh | bash

# 2. 安装插件
/plugin marketplace add CallStorm/word-master
/plugin install word-master
```

## 使用

在 Claude Code 中直接对话：

> 根据这份 PDF 写一份工作报告

> 用会议纪要模板，主题是产品评审会，参会人张三、李四...

## 生成模式

| 模式 | 说明 |
|------|------|
| 自由生成 | 从零创建文档 |
| 模板合并 | `{{key}}` 占位符填充（快速、确定性） |
| 模板引导 | 保持版式，定向替换内容 |

## 内置模板

- `report-zh.docx` — 工作报告
- `memo-zh.docx` — 会议纪要
- `contract-zh.docx` — 合同
- `letter-zh.docx` — 公函/信件
- `application-zh.docx` — 申请书

## 与 word-web 的关系

本插件也可被 [word-web](https://github.com/callstorm/word-web) 作为 git submodule 引用，在 Docker 中自动加载。

## License

MIT
