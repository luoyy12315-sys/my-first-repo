# 第三方组件与源码许可声明

本项目以 MIT 许可发布（见 `LICENSE`）。以下为实际使用的第三方组件，
以及被移植/改写的开源源码。分发本项目的衍生作品时，请保留本文件与下列声明。

## 一、被移植的源码

### OpenTutor

- 仓库：https://github.com/zijinz456/OpenTutor
- 许可证：MIT
- 版权：Copyright (c) 2026 Zijin Zhang
- 移植位置：`src/lib/learning/mastery.ts`
- 原始文件：`apps/api/services/learning_science/knowledge_tracer.py`
- 说明：BKT（Bayesian Knowledge Tracing）的观测后验与学习转移公式、按题型设定 guess 概率的思路
  由该文件移植为 TypeScript；本项目在此基础上增加了"提示依赖 / 独立完成 / 查看解析"三类证据的差异化
  权重、状态推导规则与原因文本。原实现基于 Corbett & Anderson (1994)
  "Knowledge tracing: Modeling the acquisition of procedural knowledge"。

同时参考了其数据建模方式（`models/mastery_snapshot.py`、`models/progress.py` 的 FSRS 字段）
与前端块注册表模式（`apps/web/src/lib/block-system/registry.ts`）。

MIT 许可证原文：

```
MIT License

Copyright (c) 2026 Zijin Zhang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 二、运行时依赖（npm）

| 包 | 许可证 | 用途 |
| --- | --- | --- |
| next, react, react-dom | MIT | 应用框架 |
| better-sqlite3 | MIT | 本地 SQLite 持久化 |
| zod | MIT | 模型输出与请求体校验 |
| react-markdown, remark-gfm, remark-math, rehype-katex | MIT | Markdown / 公式渲染 |
| katex | MIT | LaTeX 渲染 |
| recharts | MIT | 图表 |
| lucide-react | ISC | 图标 |
| sonner | MIT | 轻提示 |
| clsx, tailwind-merge | MIT | 样式工具 |
| tailwindcss | MIT | 样式系统 |
| pdf-parse | MIT | PDF 文本提取 |
| mammoth | BSD-2-Clause | DOCX 文本提取 |
| vitest | MIT | 单元测试 |
| playwright-core | Apache-2.0 | 浏览器交互验证（仅开发测试，驱动本机已安装的 Edge/Chrome，不下载浏览器内核） |

## 三、明确未使用的候选项目及原因

- `vercel/chatbot`、`lobehub/lobehub`：许可证为 NOASSERTION（非标准），为避免分发风险未使用其源码。
- `mathigon/textbooks`：仓库未声明许可证，未复制任何源码。
- `jsxgraph`：LGPL-3.0，未引入。
- `stevenpetryk/mafs`：MIT，但命令式组件范式与"模型生成声明式配置"的约束不兼容，未引入。

详情见 `docs/OPEN_SOURCE_RESEARCH.md`。
