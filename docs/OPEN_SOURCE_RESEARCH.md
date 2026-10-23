# 开源项目调研报告

调研时间：2026-10-22　调研方式：GitHub REST API 检索 + codeload 拉取真实仓库源码逐文件检查

> 环境限制说明（如实记录）：本机 `git clone` 走 HTTPS 被代理拦截（`CONNECT tunnel failed, response 502`），
> 因此改用 `codeload.github.com` 下载 tarball 解压检查源码；`api.github.com` 与 `codeload` 均可用。
> 下载失败的仓库不作源码级判断，只标注"仅核验元数据"。

---

## 一、检索范围与命中的真实仓库

| 方向 | 检索词 | 代表性命中 |
| --- | --- | --- |
| AI 学习助手 / 自适应教学 | `AI tutor adaptive learning` | `zijinz456/OpenTutor`(148★)、`A-R007/Multi-Agent-Study-Assistant`(64★)、`rizukirr/no-vibe`(43★) |
| AI 对话 / Agent 应用框架 | `AI chat nextjs streaming` | `vercel/chatbot`(21k★)、`lobehub/lobehub`(83k★)、`LibreChat-AI/LibreChat`(46k★)、`mckaywrigley/chatbot-ui`(33k★)、`assistant-ui/assistant-ui`(12.6k★) |
| 动态交互教材 / 可视化 | `interactive math visualization react` | `stevenpetryk/mafs`(3.4k★)、`mathigon/textbooks`(395★)、`jsxgraph/jsxgraph`(1.5k★) |
| 练习与评价系统 | `quiz engine question types react` | 命中质量差（多为 0★ 模板），未采用 |
| 学习档案 / 间隔重复 | `spaced repetition knowledge graph` | `mayankjndl/vidyamind`(4★)、`moaaz-ae/plcourse`(10★)、`Sudhanshukumar0007/CognitiveSB`(4★) |
| 前端聊天组件 | 同"AI 对话" | `assistant-ui`、`chatbot-ui` |

> 结论性观察：中文/教育垂直领域的"AI 导师"仓库普遍 star 很低，工程质量参差；
> 真正的成熟工程集中在通用聊天应用，而它们的数据模型里没有"学习证据"这一层。

---

## 二、逐个仓库的源码级检查

### 1. `zijinz456/OpenTutor` — MIT · 148★ · Python + TypeScript · 2026-10-20 活跃

**已下载并解压源码（3.0 MB，723 个 py/ts/tsx 文件）**，检查内容：

- 结构：`apps/api`（FastAPI）+ `apps/web`（Next.js 16.2.2）+ `tests/` + `docker-compose`
- 数据库：`apps/api/database.py` 明确 **SQLite-only local mode**（aiosqlite + WAL pragma），alembic 迁移
- 数据模型（`apps/api/models/`）：`course` / `chat_session` / `chat_message` / `knowledge_graph` /
  `mastery_snapshot` / `practice` / `progress`(含 FSRS 字段) / `study_plan` / `cognitive_baseline` / `notification` 等 26 个模型
- 掌握度：`apps/api/services/learning_science/knowledge_tracer.py`（197 行，简化 BKT，Corbett & Anderson 1994）
  + `bkt_trainer.py`（296 行）；`models/progress.py` 有 `fsrs_difficulty/stability/reps/lapses/state`
- 前端：`apps/web/src/lib/block-system/registry.ts` 是"块注册表"模式（12 种 BlockType，lazy 加载），
  `components/blocks/` 下有 quiz / flashcards / knowledge_graph / wrong_answers 等块
- LLM 接入：`services/llm/{openai_client,anthropic_client,mock_client,circuit_breaker,router}.py` 多供应商适配
- 依赖：`requirements-core.txt` 含 langgraph、tiktoken、pypdf、python-docx、trafilatura、anthropic、openai

**判断：架构最接近目标产品，但不宜整体 fork。** 原因：

1. 双栈（Python + Node）意味着用户要同时维护两个运行时、两套依赖、两个启动命令；
2. 它的 IA 是"课程 + 块网格看板"（`/course`、`/analytics`、`/onboarding`），
   而本产品要的是 **chat-first + 工作区**；改 IA 等于重写 184 个 tsx 的路由与数据获取；
3. 它的块由用户手动添加/模板化，本产品要求由模型按教学需要即时生成，两者生成路径不同；
4. 全量依赖安装（langgraph 等）+ alembic 迁移，本机验证成本高，**无法在本次交付窗口内证明其可运行**。

**但它的算法与模式值得直接复用 → 采用方案 C（抽取模块）**：
把 `knowledge_tracer.py` 的 BKT 迁移为 TypeScript（`src/lib/learning/mastery.ts`），
并沿用其 `mastery_snapshot`（掌握度时间序列）与 `fsrs_*` 字段设计。

### 2. `vercel/chatbot`（原 `vercel/ai-chatbot`）— 许可证 **NOASSERTION** · 21k★

元数据核验：仓库已改名，license 字段为 NOASSERTION（非标准许可证）。
架构常识 + 仓库体量（6.3 MB）表明它绑定 Postgres/Neon、NextAuth、Vercel Blob。
**不采用（E）**：许可证不明确 → 商业分发与二次许可存在风险；且其多用户 SaaS 基础设施
（鉴权、额度、分享）对本产品是纯负担。

### 3. `lobehub/lobehub`（LobeChat）— 许可证 **NOASSERTION** · 83k★ · 仓库 1.0 GB

**不采用（E）**：仓库体量过大（含大量插件/主题资源），许可证非标准，定位是通用 Agent 平台，
学习档案能力需要从零加。

### 4. `LibreChat-AI/LibreChat` — MIT · 46k★ · 仓库 283 MB

需要 MongoDB + Meilisearch，多用户/多租户，部署依赖重。
**不采用（E）**：为"本地单用户学习工具"引入 Mongo 属于反向优化；其对话体验虽成熟，但数据模型无知识点/证据概念。

### 5. `mckaywrigley/chatbot-ui` — MIT · 33k★ · **最后提交 2024-08**

**不采用（E）**：已近两年未维护，绑定 Supabase，Next 版本落后，安全与依赖风险高。

### 6. `assistant-ui/assistant-ui` — MIT · 12.6k★ · 189 MB

React 聊天原语（消息列表、输入、运行时适配器）。**未作为依赖引入**，原因：
它自带 runtime/thread 状态模型，与本产品"消息 parts = 文本 + 工具组件"的自定义协议冲突，
强行接入要么被它的状态机约束，要么写适配层抵消收益。**仅参考其消息分组与流式渲染思路**。

### 7. `stevenpetryk/mafs` — MIT · 3.4k★

交互式数学可视化组件（坐标系、函数图像、可拖点）。评估结论：
本产品的模拟器必须由 **模型输出的声明式配置**（参数 + 表达式）驱动，而 mafs 是命令式 React 组合，
动态生成需要模型写 JSX —— 违反"不执行模型生成的代码"这一硬约束。
**不采用（D→自研）**：改为"参数 schema + 白名单表达式求值器 + SVG 绘制"（`expr.ts` / `SimulatorBlock.tsx`）。

### 8. `mathigon/textbooks` — **无许可证** · 395★ · 672 MB

**不采用（E）**：GitHub license 字段为空 → 无授权即不可复制源码。

### 9. `jsxgraph/jsxgraph` — **LGPL-3.0** · 1.5k★

**不采用（E）**：LGPL 对动态链接/分发有额外义务，为一个图表需求引入不必要的合规负担。

### 10. 小型间隔重复项目（vidyamind / plcourse / CognitiveSB 等）

star < 15，工程完整度不足，代码质量无法支撑作为基础工程。
**不采用（E），但采纳其算法概念**：SM-2 / FSRS / BKT 属于公开学术方法，按论文思路自行实现（可解释、可测试）。

---

## 三、候选对比清单

| 项目 | 定位 | 技术栈 | 可复用 | 需改造 | 适配度 | 许可证 | 是否下载验证 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenTutor | 本地自适应学习平台 | FastAPI+Next16+SQLite | BKT、实体设计、块注册思路 | IA、双栈、生成路径 | 高 | MIT | ✅ 源码全检 |
| vercel/chatbot | SaaS 聊天模板 | Next+Postgres+Auth | 流式对话思路 | 全部数据层 | 中 | NOASSERTION | 仅元数据 |
| lobehub | Agent 平台 | Next+Monorepo | 无 | 过重 | 低 | NOASSERTION | 仅元数据 |
| LibreChat | 多用户聊天 | Node+Mongo | 无 | 基础设施冲突 | 低 | MIT | 仅元数据 |
| chatbot-ui | 聊天 UI 模板 | Next+Supabase | 无 | 已停更 | 低 | MIT | 仅元数据 |
| assistant-ui | 聊天原语库 | React | 渲染思路 | 状态模型冲突 | 中 | MIT | 仅元数据 |
| mafs | 数学可视化 | React | 无（范式不合） | — | 低 | MIT | 仅元数据 |
| mathigon/textbooks | 交互教材 | TS | 无（无许可证） | — | — | 无 | 仅元数据 |
| jsxgraph | 几何绘图 | JS | 无（合规负担） | — | 低 | LGPL-3.0 | 仅元数据 |

---

## 四、最终方案

**基础工程：自建 Next.js 16 单体（与 OpenTutor web 同栈），而非 fork 任何一个仓库。**

理由（对应任务书的判断标准）：

- 架构适配：本产品需要"消息 parts → 组件协议 → 证据"这条定制数据流，任何现成聊天壳都要改造其消息模型；
- 部署平台：本地单进程 + SQLite，不引入 Postgres/Mongo/对象存储；
- 长期学习数据：知识点/证据/审计表是核心，现成项目都没有；
- 可维护：21 张表、单栈、无隐式魔法，用户能读懂并改。

**复用的东西（真实复用，不是"参考"）**

| 来源 | 许可 | 复用什么 | 落地位置 |
| --- | --- | --- | --- |
| OpenTutor `knowledge_tracer.py` | MIT | BKT 后验/学习转移公式与题型 guess 率 | `src/lib/learning/mastery.ts`（TS 移植 + 增加提示/独立完成权重） |
| OpenTutor `models/mastery_snapshot.py`、`progress.py` | MIT | 掌握度时间序列、FSRS 四字段的建模方式 | `mastery_snapshots` 表、`concepts` 表 |
| OpenTutor `block-system/registry.ts` | MIT | "块类型 → 组件"注册表模式 | `BlockRenderer` / `BlockKind` |
| better-sqlite3 / Next.js / KaTeX / react-markdown / Recharts / lucide / sonner / zod | MIT/ISC/Apache | 基础设施与渲染 | 见 `THIRD_PARTY_NOTICES.md` |

**自研的部分**：教学工具协议、判题引擎、证据与状态规则、会话/工作区/档案 IA、模拟器表达式求值、
材料解析管线、全部 UI。

---

## 五、为什么没有"先写一大坨代码再补调研"

调研先行的实际影响：

1. 否掉了 3 个 NOASSERTION 许可证的仓库作为基础（否则交付物带着许可风险）；
2. 否掉了 mafs 方案，改为声明式模拟器 + 白名单求值，避免执行模型生成的代码；
3. 从 OpenTutor 抄来了 BKT 而不是自己拍脑袋写"掌握度 = 答对率"；
4. 明确了"删除会话 vs 保留证据"的实体边界（现成项目普遍没处理），
   并在实测中发现级联删除会吞掉作答明细，改为解除级联。
