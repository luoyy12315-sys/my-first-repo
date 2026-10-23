# 验收缺陷修复记录

对应《Lumina 验收报告》（2026-10-22，87/100，有条件通过）的逐条处理。
每条都注明：改了什么、改了哪里、怎么验证的。

---

## P1（放行条件）· 删除会话连带证据后，知识点聚合不重算

**问题**：`deleteSession(id, {withEvidence:true})` 只删 `attempts / exercises / evidence`，
`concepts` 上的 `evidence_count / p_mastery / status / wrong_streak / next_review_at` 仍是旧值，
档案里留下"证据已不存在却仍显示已作答 N 次"的幽灵记录，复习条目也指向不存在的证据。

**修复**

- 新增 `recomputeConceptAggregates(conceptId)`（`src/lib/db/repo.ts`）：
  不是"减一"，而是按剩余证据从初始状态**重放** BKT 与调度，再回写聚合字段；
  重放使用真实题目 id，保证"不同题目数"语义与实时路径一致。
- 同一函数内清理该知识点的 open 复习条目，状态变化写 `concept_events` 审计 + `mastery_snapshots` 快照。
- `deleteSession` 先收集受影响知识点，删完后逐个重算（在事务外，避免嵌套事务）。

**验证**

- 单元/集成：`tests/unit/repo-integration.test.ts › P1`（2 例）
  - 证据删光 → `evidenceCount=0`、`pMastery=0.1`、`status=untouched`、`nextReviewAt=null`、open 复习条目清零
  - 只删一个会话 → 按剩余证据重放，`distinctExercises` 正确回落
- 真实 HTTP：两轮作答后 证据 6 / 不同题目 3 / p=0.973 / mastered；
  删掉其中一个会话并连带证据后 → 证据 5 / 不同题目 2 / p=0.888 / **状态回落为"有初步掌握证据"**

---

## P2-1 · 复习调度的 difficulty / lapses 被写死

**问题**：调用 `scheduleNext()` 时传 `difficulty: 5, lapses: 0, reps: evidenceCount`，
难度永远在 5 附近抖动，遗忘次数每轮清零，调度退化成"只看 stability"。

**修复**：改传 `concept.difficulty / concept.lapses / concept.reps`（`recordAttemptEvidence`）。

**验证**：`P2-2 · 调度参数` 用例——连续两次答错后 `lapses ≥ 2`、`difficulty > 5`。

---

## P2-2 · 提示词重复注入当前用户消息 + 空助手占位

**问题**：用户消息先落库，`buildHistory()` 又把它读进历史，`buildTeachingMessages()` 末尾再追加一次；
中间刚创建的空 `streaming` 助手消息被渲染成「（空）」，模型看到"用户连说两遍 + 一条空回复"。

**修复**

- `buildHistory(sessionId, { excludeMessageId })` 排除本轮刚落库的用户消息；
- 跳过 `content` 为空且 `status=streaming` 的助手占位；
- chat 路由把 `userMessage.id` 传下去。

**验证**：`P2-3 · 提示词` 用例——同一文本在整段提示词中只出现 1 次、不含「（空）」、末尾为本轮输入。

---

## P2-3 · 「看过解析 / 用过提示」依赖前端自报

**问题**：`/solution` 不留任何服务端状态，提交时 `viewedSolution` / `usedHint` 由请求体决定。
先看解析、再以 `viewedSolution:false` 提交，就能把这次作答算成"独立完成"。

**修复**

- `exercises` 增加三列：`solution_viewed_at`、`hint_used_at`、`hint_count`（含容错迁移，老库自动补列）。
- `/api/exercises/[id]/solution` 调 `markSolutionViewed()`；`/hint` 调 `markHintUsed()`。
- `/api/attempts` 以 `服务端标记 || 客户端传值` 为准。

**验证**

- 集成：`P2-4 · 解析与提示由服务端留痕`。
- 真实 HTTP：调过 `/solution` 后提交（故意传 `viewedSolution:false`）→ 判对但**证据数不变**（未计入）；
  调过 `/hint` 后提交（传 `usedHint:false`）→ 服务端返回 `usedHint: true`。

---

## P2-4 · 幂等键每次点击都新生成

**问题**：`idempotencyKey: uuid()` 在 `submit()` 内生成，连点/网络重试必然得到不同键，
服务端去重覆盖不到真正的重复提交。

**修复**：`ExerciseBlock` 按「作答内容签名」缓存键（`idemRef`），同一份作答复用同一个键，
作答内容变化才生成新键。

---

## P2-5 · 默认监听全网、无鉴权、信息暴露

**修复**

| 项 | 处理 |
| --- | --- |
| 监听范围 | `dev` / `start` 默认 `-H 127.0.0.1`；局域网用 `dev:lan` / `start:lan`（README 已注明需配 `APP_ACCESS_TOKEN`） |
| 安全响应头 | CSP、`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Permissions-Policy` |
| `/api/system` | 只返回相对路径（`data/lumina.db`），移除平台信息 |
| `/api/ai/test` | 不再回显模型返回内容；错误 detail 截断 120 字并抹掉 URL |

**验证**：`netstat` 显示 `127.0.0.1:3210`；`curl -I` 可见全部安全头；`/api/system` 返回相对路径；
浏览器回归 32 项无控制台报错（CSP 未破坏 KaTeX/图表/内联样式）。

---

## P3 · 体验与资源

| 项 | 处理 |
| --- | --- |
| 模拟器 Y 轴刻度被裁切/与轴标题重叠 | 刻度改紧凑记法（1.97 万），轴标题移到左上角，左内边距 46 |
| 解析失败的材料仍落盘 | 只有 `status=parsed` 才写文件；失败/不支持格式不占磁盘 |
| 空壳清理误伤"练过但看了解析"的知识点 | 清理条件排除存在 `attempts` 的知识点；确认弹窗补说明 |
| 材料检索全表搬运 | 先用 SQL `LIKE` 粗筛（命中任一词，limit 400）再打分排序 |
| 表数量表述漂移 | README 改为 23 张表（含 `schema_migrations` / `users`） |
| 构建 NFT 追踪告警 | `dataDir()` 不再用 `path.resolve(process.cwd(), 动态env)`，改为字符串拼接 → 构建 **0 警告** |

---

## 未处理（明确保留）

- API 层单元测试与覆盖率度量：目前是"集成测试 + 端到端 + 浏览器"三层，没有按路由做单测与覆盖率数字。
- `repo.ts` 体量偏大（数据访问函数集中在一个文件）：按领域拆分属于重构，不影响正确性，留作后续。
- 材料检索仍是关键词方案，未上 FTS5/向量检索。

---

## 本轮回归结果

| 项目 | 结果 |
| --- | --- |
| `tsc --noEmit` | 通过 |
| `npm run build` | 通过，**0 警告** |
| 单元 + 集成 `npm test` | **37/37**（新增 6 项针对 P1 / 调度 / 提示词 / 服务端标记 / 清理边界） |
| 端到端 `tests/smoke.mjs` | **28/28** |
| 浏览器 `tests/ui-check.mjs` | **32/32**，零控制台错误 |
