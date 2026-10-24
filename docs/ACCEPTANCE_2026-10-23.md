# Lumina 项目验收报告 · 2026-10-23

> 验收对象：`C:\Users\16621\项目`（Lumina · AI 动态学习工作台）
> 验收范围：教学效果、板块联动、代码质量、死代码、构建/测试/安全/文档
> 方法：静态代码审查 + 独立实例运行 + 自动化测试 + 5 次真实模型教学抽样
> 结论：**83/100（B+）· 自用可过；对外分发前先修 P1/P2**

---

## 0. 一页结论

**一句话**：这是一个「教学闭环设计明显高于普通 AI 聊天套壳」的本地学习工作台——真实流式教学、8 个结构化工具、服务端判题、BKT 掌握度、证据审计、FSRS 启发式复习、材料引用与联网查证都能跑通；但**证据可信度与复习/重做状态闭环仍有 4 个必须先修的缺陷**，且「AI 生成的题目答案是否正确」目前没有独立校验。

**最值得肯定的三件事**

1. 教学不是「模型自由发挥」：模型只能通过白名单工具产出组件，答案与评分规则留在服务端，判题后写证据，掌握度由 BKT 推导，删除证据会按剩余证据重放——这是完整闭环，不是演示。
2. 真实模型抽样（5 次）全部成功，讲解质量、举例能力、错误概念纠正和「先测后讲」的复习约束都达到可用水平；一次回答能准确诊断「把成本等同于现金支出」的误解，并换用生活例子 + 反事实问法。
3. 工程态度诚实：模型未配置不假装教学；解析失败不伪造内容；检索失败明确说「未核实」；答案提交前不下发；删除会话默认保留长期证据。

**最需要先修的四件事（P1）**

| # | 问题 | 后果 |
| --- | --- | --- |
| P1-1 | 填空/分步骤的「子串包含」判定过宽，实测「成本」会被判对「机会成本」 | 假阳性证据进入 BKT，直接污染核心卖点 |
| P1-2 | 「再做一次」不重置提示标记与幂等键 | 重做仍被判为「用提示」；同答案重做被当重复提交，不产生新证据 |
| P1-3 | 「查看解析后作答」不增加证据，却仍推进复习调度、删除复习条 | 复习计划被无效作答推动，用户看到「不用复习了」的错觉 |
| P1-4 | 复习条的「忽略 / 标记已复习」下一次刷新立即重新出现 | 复习队列无法被用户真正管理，按钮语义失效 |

**评分卡（本次自定义权重）**

| 维度 | 权重 | 得分 | 简评 |
| --- | --- | ---: | --- |
| 教学设计与真实模型效果 | 25 | 21 | 提示词、上下文、工具约束扎实；但无教学质量评测集，答案键不校验 |
| 教学闭环完整性 | 20 | 19 | 讲解→练习→判题→证据→复习→计划→材料/引用均存在 |
| 学习证据与掌握度正确性 | 20 | 14 | BKT/审计/重算很强；被 4 个 P1 和若干规则问题拖累 |
| 板块联动 | 15 | 12 | 主链路通；档案练习、计划步骤、工作区存在断点 |
| 工程质量 | 10 | 8 | strict TS、结构清晰；repo 2035 行、死代码、Webpack 构建脆弱 |
| 安全与健壮性 | 5 | 4 | 答案隔离、SSRF、CSP、令牌都不错；错误信息外泄、本地明文 Key、无 CSRF/限流 |
| 测试与文档 | 5 | 5 | 80 单测 + 72 冒烟 + 48 浏览器断言，覆盖罕见地好；但无教学质量评测、README 漂移 |
| **合计** | **100** | **83** | **B+ · 有条件通过** |

> 分数是本次审查的判断，不是考试分数。上一份外部验收为 87/100；本次更严格地探了「证据真实性」和「状态闭环」，因此不是项目退步，而是发现了之前没测到的问题。

---

## 1. 验收方法与范围

### 1.1 实际执行

| 项目 | 命令/方式 | 结果 |
| --- | --- | --- |
| 类型检查 | `tsc --noEmit` | **0 错误** |
| 单元/集成 | `vitest run` | **80/80 通过**（5 个文件） |
| 端到端冒烟 | `node tests/smoke.mjs`（独立 3212 实例 + mock LLM/Web） | **72/72 通过** |
| 浏览器交互 | `node tests/ui-check.mjs`（Edge headless，桌面 + 移动端） | **47/48 通过**；唯一失败是测试断言写错，删除实际成功 |
| 生产构建 | 默认脚本 `next build`（Turbopack） | 通过（`build.log`，06:18 的构建） |
| 构建可移植性 | 隔离副本 `next build --webpack` | **失败**：`attempts/route.ts` 多导出 `AiError`；删掉该行后通过 |
| 真实模型教学 | 火山方舟 `deepseek-v4-1-flash-261017`，5 次调用 | **5/5 成功**，见第 3 节 |
| 代码审查 | 33 个 API 路由、核心 `src/lib`、页面/组件、29 张表 | 完成 |

### 1.2 环境与数据安全

- 环境：Windows 10.0.26200、Node 22.22.2、Next 16.2.2、React 19.2.4、Edge headless。
- 所有运行验证在 **独立端口 3212 + 独立 `DATA_DIR=./data/audit-qa`** 进行；**没有读写你的主库 `data/lumina.db`**（只读取过表计数与模型配置用于评估）。
- 真实模型调用使用你已保存在本机的火山方舟配置；Prompt 为通用教学场景，未发送个人材料/对话；共 5 次，输入 18,803 tokens、输出 9,181 tokens（约 2.8 万 tokens）。
- 验收产生的临时库、临时构建目录、探针脚本已清理；隔离服务已停止。
- **未做**：真实用户纵向学习效果实验、真实学习增益测量、OCR 扫描件、PPTX/.doc、`npm audit`、公网渗透测试。

### 1.3 限制

1. 主库在交付时被重置为干净库：0 条消息、0 次作答、0 条证据，只有 2 个空会话、1 个模型配置和 21 条历史 `usage_log`。**因此无法用真实学习历史评估「教学效果」或「掌握度准确性」**，只能用代码、测试和 5 次真实模型抽样。
2. 5 次调用是质量抽样，不是教学效果实验；真正的学习效果需要 2–4 周真实使用与前后测。
3. 本次未修改任何业务代码；本报告只列问题与建议。

---

## 2. 实测结果

### 2.1 构建

- 默认 `npm run build`（Turbopack）通过，14 个静态页 + 33 个 API 路由，`build.log` 无警告。
- **Webpack 构建失败**，唯一原因是 `src/app/api/attempts/route.ts:161` 的 `export { AiError };`：Next 的 route 类型检查不允许路由文件导出 HTTP 方法/配置之外的符号。删除该行后 Webpack 构建通过。
- 这说明当前的 Turbopack 构建路径没有生成/检查该路由的 `.next/types`；一旦切换到 Webpack 或 Next 收紧路由类型检查，构建会断。**这是死代码导致的可移植性缺陷，不是理论风险，已实际复现。**

### 2.2 测试

- 80 个单元/集成测试覆盖判题、BKT、调度、表达式、检索、repo 事务、聚合重算；全部通过。
- 72 个冒烟断言覆盖：配置→建会话→流式→工具→判题→证据→幂等→删除语义→材料引用→联网 off/manual/缓存/超时/隔离→多模型→复习复用；全部通过。
- 48 个浏览器断言覆盖桌面/移动端、练习、模拟器状态恢复、档案弹窗、计划删除、LaTeX 崩溃、引用卡片、联网开关；47 通过。
- **唯一失败是测试本身的问题**：`tests/ui-check.mjs:258-268` 用 `text=四周搞定导数` 的出现次数当「计划数量」，删除后 3→0，断言 `after === before - 1` 必然失败。API/数据库确认计划删除成功（`plans=[]`）。建议把断言改成计划卡片数量或 API 断言。
- 测试会覆盖 `research/shots/` 下固定文件名的旧截图（如 `session_answered.png`、`sources_ui.png`）；建议写到临时目录。

### 2.3 真实模型教学抽样（5 次）

| 场景 | 耗时 | 工具 | 观察 | 评分 |
| --- | ---: | --- | --- | --- |
| A 诊断与讲解：用户说「机会成本就是花掉的钱」 | 13.7s | save_concepts + present_exercise | 准确诊断「把成本等同于现金流出」，给出「被放弃的最优替代方案」定义、周末打工例子，控制篇幅后出题 | 5/5 |
| B 错误概念纠正：用户坚持「机会成本=100 元」 | 24.0s | present_exercise | 直接指出错在「付出的钱 vs 放弃的收益」，用补课 120 元的例子讲清，并区分显性成本/总经济成本 | 5/5 |
| C 出题检验 | 8.3s | present_exercise | **正文为空**，只下题；题目质量好（演唱会 200 元 + 加班 150 元），但「200 元可存起来」让答案口径有歧义 | 3/5（工具专属回合） |
| D 基于真实错答的补救 | 9.6s | 无 | 不直接给答案，用「反事实问句」检查选项，给出可执行的判断动作 | 5/5 |
| E 结构化复习 | 13.1s | present_exercise ×2 | 遵守「先测后讲」，同一知识点出同型单选 + 变式多选，正文只有一句过渡 | 5/5 |

**结论**：在这套提示词与工具约束下，一个中端模型已经能表现出「会诊断、会换讲法、会先测后讲」的教师行为；教学设计的骨架是有效的。风险不在「模型不会教」，而在「模型生成的题目/答案键没有被独立校验」以及「系统状态会污染证据」。

### 2.4 真实数据

- 主库：2 个空会话、0 消息、0 练习、0 作答、0 证据；`usage_log` 21 条真实调用记录（历史测试）。
- 没有可分析的真实学习轨迹，无法计算提示依赖率、看解析率、复习完成率、学习增益。
- **建议把「每周独立正确知识点数」作为北极星指标，从下一次真实使用开始记录**；当前 `usage_log` 只记 token/延迟，未暴露这些教学指标。

---

## 3. AI 教师教学效果评估

### 3.1 总评

**教学设计与单次教学质量：4.2 / 5。** 在本项目的提示词、上下文注入和工具约束下，模型的表现明显优于裸聊：会先判断学生卡点、用具体例子换表征、用练习验证、复习时先测后讲。真实抽样中 A/B/D/E 四个场景都达到了「一个耐心的私人导师」的水平。

**可持续教学效果：2.5 / 5。** 目前缺少三样东西：
1. **对题目与答案键的独立验证**（模型出题，模型给答案，没有第二道校验）；
2. **教学质量的离线评测集**（测试全是 mock，无法回归「讲得好不好」）；
3. **真实学习增益的度量**（没有前后测、没有周维度指标）。

### 3.2 做得好的地方（有代码依据）

| 能力 | 实现 | 评价 |
| --- | --- | --- |
| 先判断再教 | `SYSTEM_PROMPT` 明确「解决眼前问题 / 系统学一块」「概念没建立 / 混淆 / 计算失误」「直接答 / 换讲法 / 举例 / 图表 / 出题 / 提示 / 推进」 | 真实 A/B 场景中生效 |
| 个性化上下文 | `buildLearnerContext` 注入相关知识点状态、p、证据数、独立正确、提示次数、连错、错因画像、最近作答、薄弱点、计划、材料 | 真实 A 场景引用了已有作答记录 |
| 不直接给答案 | 工具答案只落服务端；`present_exercise` 描述明确「答案只给系统」 | 冒烟测试确认响应不含答案 |
| 一回合只做一件事 | 提示词要求「只做当前最有用的那一件事」「不超过 3 个工具」 | 真实 A/B/E 都遵守；C 出现工具专属空正文 |
| 复习先测后讲 | review 模式注入强约束：必须先 `present_exercise`（同型 1 + 变式 1） | 真实 E 完全遵守，出了单选 + 多选 |
| 失败诚实 | 未配置、超时、限流、格式错误、截断、检索失败都有明确提示；保留已生成内容 | 冒烟覆盖 |
| 材料/网络可溯源 | 引用 id 白名单；伪造引用剥离；来源卡片可回原文 | 冒烟 + 浏览器测试通过 |
| 证据可解释 | 状态阈值写在 `deriveStatus`；每次变更写审计；可人工更正/作废 | 档案页可查看 |
| 反作弊 | 服务端记录提示/解析；幂等键；答案不随组件下发 | 冒烟覆盖，但「再做一次」有状态残留 |

### 3.3 限制教学效果的根因（按影响排序）

#### A. 题目答案键没有独立校验（最高风险）

模型自己出题、自己给 `answer`；服务端只验证格式（下标在范围内、答案可解析），不验证**语义正确性**，也不验证选项是否唯一/互斥、题干是否泄题、提示是否泄答案。真实 C 题的「200 元可存起来」就制造了口径歧义：模型解释按「200 元是显性支出，机会成本=150」判对，但学生完全可能按「放弃 200 元 + 150 元收入」选 350。对教育产品来说，**错答案键比不回答更伤害信任**。

#### B. 判题规则会产生假阳性/假阴性

- 填空/分步骤：`u === c || (c.length >= 3 && (u.includes(c) || c.includes(u)))`。实测「成本」被判对「机会成本」；这是 BKT 假阳性的直接入口。
- `accept` 字段在 zod schema 和工具描述里都存在，但 `buildAnswerSpec` 完全没使用；模型给出的等价写法不生效。
- 单选/判断的错因推断几乎总是「概念混淆」，不区分计算、审题、知识缺口；该错因又会注入下一轮提示词，可能把模型带偏。
- 分步骤题只要一步错就整体 `correct=false`，得分 0.75 也按全错进 BKT，惩罚过重。

#### C. 教学反馈是「模板先说话」

答错时用户先看到的是模板文案（例如「这个选项混淆了关键条件」），随后才是模型写的解析。模板反馈对任何错误都套同一套解释，真正的针对性反馈要靠用户再点「和 AI 讨论这道题」。更好的做法是：**确定性判题负责对错，模型负责反馈**，并在同一回合把针对性反馈显示出来。

#### D. 复习/重做状态污染证据

- 「再做一次」保留 `usedHint=true` 和提示文案；下一次作答继续被当作「借助提示」，独立正确数不增加。
- 同一页面内同答案重做复用旧幂等键，服务端返回 `duplicate=true`，不写新证据。
- 「查看解析」后作答不增加证据，但仍会 `scheduleNext`、删除 open 复习条；等于「无效作答推动复习计划」。
- 复习条被忽略/标记已复习后，下一次刷新立即重建。

这些不是「体验小瑕疵」，而是会直接改变 p 值、状态、复习队列的**证据污染**。

#### E. 概念会被拆成多个档案

`ensureConcept` 只在 `topic_id + canonical_key` 内去重；`present_exercise` 的 topic 是可选参数，缺省写「未分类」。同一个「机会成本」在「经济学基础」「微观经济学」「未分类」下会变成三个 concept，各自 p=0.1，掌握度、错因画像、复习条目全部分裂。`findConceptByName` 已实现但从未使用。

#### F. 没有「学完没有」的课程状态

计划步骤与知识点不绑定，`save_plan` 把 `conceptId` 一律写 null；「学这一步」只把标题拼进自然语言；完成步骤靠手动勾选。于是系统不知道「这一步学会了没有」，无法自动推进课程，也无法判断计划是否真的完成。

#### G. 上下文会随轮次丢失组件细节

`buildHistory` 只保留文本和 `[已展示练习]` 占位；最近 6 条作答记录只有题干预览。多轮之后，模型可能不记得图表的 x/y 数据、表格内容、某道题的选项。工作区有 block payload，但普通会话没有。

#### H. 提示不是「渐进」的，且可能泄答案

README 写「渐进提示」，实际 `/hint` 只有一条：模型预生成的 `hint` 或现场生成一条 60 字提示。没有一级/二级/三级，也没有「提示后是否泄露答案」的检查。

### 3.4 如果只做三件提升教学效果的事

1. **两层出题校验**：第一层模型出题；第二层用另一个模型（或同一模型低温 + 严格 rubric）只做「答案键/选项唯一性/题干自洽性/是否泄题」审查，不通过就重生成或降级为文字题。对歧义题明确标注「本题口径可能有争议」，不写入证据。
2. **建立 30–50 条教学场景评测集**：每条含学生画像、初始误解、期望动作（诊断/换讲法/出题/提示/先测后讲）、禁止行为（直接给答案、堆工具、编造引用）。用真实模型跑回归，人工 1–5 分；没有这套东西，「教学效果」只能靠感觉。
3. **把「证据」做成真正可信的**：修 P1；空白/分步严格匹配；答案键校验；review item 生命周期；概念合并；汇总只允许引用真实证据。教学产品的护城河不是「能聊」，而是「记录可信」。

---

## 4. 板块联动评估

### 4.1 联动矩阵

| 从 → 到 | 触发 | 数据 | 状态 |
| --- | --- | --- | --- |
| 首页 → 会话 | 输入框 / 今日卡 / 继续上次 | mode、planId、q、minutes | ✅ |
| 首页 → 今日复习 → 会话 | 今日卡「开始」 | focusConceptId、reviewItemId、planId | ✅ |
| 首页 → 待巩固 → 档案 | `?c=conceptId` | 打开知识点详情 | ✅ |
| 首页 → 复习建议卡片 | 仅展示 | 无跳转 | ⚠️ 看得见、点不了 |
| 会话 → 练习 → 证据 | ExerciseBlock → `/api/attempts` | answer、hint、solution、idem | ✅ 主链路 |
| 会话 → 复习队列 | 答对 | `completeReviewForSession` | ✅ |
| 会话 → 档案 | 顶部书签图标 | 全局档案 | ✅ |
| 会话 → 材料 | 回形针 | `returnTo` + plan | ✅ |
| 会话 → 计划 | 头部归属下拉 | PATCH planId | ✅ |
| 档案 → 练一练 | 详情按钮 | **新建 free 会话，仅自然语言** | ❌ 丢 plan/focus/结构化复习 |
| 档案 → 清理空壳 | 顶部按钮 | evidenceCount=0 计数 | ⚠️ 计数与后端可删数不一致 |
| 复习 → 练一练 | 条目按钮 | mode=review + focus + reviewItem + plan | ✅ |
| 复习 → 忽略/已复习 | PATCH review | 只改当前条 | ❌ 下次刷新重建 |
| 计划 → 学这一步 | 步骤按钮 | mode=goal + planId，自然语言步骤 | ⚠️ 无 focusConcept/planItem 绑定 |
| 计划 → 历史/材料/复习 | 计数链接 `?plan=` | 各页独立预选 | ✅ |
| 材料 → 会话引用 | 上传后聊天 | 同 plan 切片 → m1.. | ✅ |
| 来源卡片 → 材料原文 | `/materials?chunk=` | `/api/chunks/[id]` | ✅ |
| 历史 → 会话 | 点击标题 | 打开会话 | ✅ |
| 历史 → 删除 | 垃圾桶 | 默认保留证据/可勾选连带 | ✅ |
| 工作区 → 会话 | 提问 | 写回同一会话 | ⚠️ 默认模型/重复消息/无引用校验 |
| 删除计划 → 关联项 | — | sessions/materials/reviews plan_id=null | ✅ |
| 删除知识点 → 会话题目 | — | concept_id 置空，题目保留 | ✅ |

### 4.2 断点详解

1. **档案的「针对它练一练」不是结构化复习**（`src/app/library/page.tsx:160-170`）。它只创建 `mode:"free"` 会话，把概念名和主题拼成一句话，既不传 `focusConceptId`，也不带 `planId`。结果：同一个概念从档案进入练习时，复习模式约束失效、计划归属丢失、材料检索落到「未归类」。应改为 `mode:"review"` + `focusConceptId`，或新增 `mode:"practice"` 并明确 plan。
2. **计划步骤没有概念绑定**（`src/lib/ai/tools.ts:477-487`）。`save_plan` 把 `conceptId` 全部写成 null，`planInputSchema.items.concept` 被忽略；`src/app/plan/page.tsx:56-70` 的「学这一步」只传 `planId` 和自然语言。结果：步骤完成与掌握度证据完全脱节，计划页的进度只是手动勾选。
3. **工作区没有跟随会话模型**（`src/app/api/workspace/[blockId]/route.ts:37`）。聊天、判题、提示、换题都用 `resolveAiConfigForSession`，工作区用 `resolveAiConfig()`（全局默认）；并且它在 `addMessage(user)` 后调用 `buildTeachingMessages` 没传 `excludeMessageId`，当前提问会在历史里重复一次。工作区也不做引用校验/来源落库、不写 `usage_log`、不标注模型。
4. **复习条不可管理**。`refreshReviewQueue` 的 `existing` 只包含 `status='open'`；`dismissed`/`done` 下一次刷新会被当作不存在而重建。实测：dismiss 后立即出现新 id 的同一条建议。应把 acted 条目纳入冷却/排除，或只在证据变化后重建。
5. **首页复习建议不可操作**。`src/app/page.tsx:315-333` 的「其他复习」只渲染文本，没有按钮；用户必须去 `/review` 才能开始。
6. **今日「巩固」卡片不带计划**。`/api/home` 的 `kind:"weak"` 分支没有 `planId`（只有 review 分支有）；从今日卡进入的 weak 复习会话会落到「未归类」，材料检索也随之改变。
7. **计划进度忽略 skipped**：`getPlan.progress.total = items.length`，`done` 只数 done；跳过的步骤永远让进度差一截。建议 `total` 排除 skipped，或显示 done/total/skipped。
8. **概念档案是全局的，不按计划过滤**。这符合「证据跨会话」的设计，但当用户同时学多个计划时，档案、薄弱点、错因画像会混在一起；计划页只能筛会话/材料/复习，不能筛知识点。可以考虑在档案页加一个「按计划（最近证据归属）」的只读筛选，而不是改全局数据模型。

---

## 5. 死代码与未使用资产

> 判定方法：`tsc --noUnusedLocals --noUnusedParameters`、导出符号引用扫描、路由/DB/组件交叉搜索、实际构建。以下均为**当前代码中没有任何产品调用方**的项（测试专用或明确保留的兼容入口单独标注）。

### 5.1 未使用的导入/局部变量（编译期可清理）

`src/app/api/concepts/route.ts`：`getConcept`、`getConceptHistory`、`updateConceptStatusManually`、`fail`、`readJson`、`z` 均未使用。
`src/app/api/plans/route.ts`：`getPlan`、`fail` 未使用。
`src/app/api/sessions/[id]/route.ts`：`createSession` 未使用。
`src/app/page.tsx`：`EmptyState` 未使用。
`src/app/settings/page.tsx`：`XCircle` 未使用。
`src/components/layout/AppShell.tsx`：`BookOpen` 未使用。
`src/lib/ai/citations.ts:65`：`match` 参数未使用。
`src/lib/learning/exercise.ts:134`、`:312`：`type` 参数未使用（`inferErrorType` 的题型参数实际没参与推断）。

> 建议开启 `noUnusedLocals`/`noUnusedParameters` 或补 ESLint，否则会持续累积。

### 5.2 未使用的导出/组件/函数

| 项 | 位置 | 说明 |
| --- | --- | --- |
| `Stat` | `src/components/ui/kit.tsx:271` | 无任何页面使用 |
| `formatDay` | `src/lib/utils.ts:25` | 无调用 |
| `tx` | `src/lib/db/index.ts:175` | 无调用 |
| `requireString` | `src/lib/api/helpers.ts:21` | 无调用 |
| `checkAccess` | `src/lib/api/helpers.ts:47` | 无调用；鉴权实际在 `proxy.ts` |
| `findConceptByName` | `src/lib/db/repo.ts:882` | 无调用；正是解决概念分裂需要的能力 |
| `countCorrectAttempts` | `src/lib/db/repo.ts:1581` | 无调用 |
| `createGoal` / `listGoals` | `src/lib/db/repo.ts:1878/1893` | 无 API/UI；`goals` 表未使用 |
| `stalenessDays` | `src/lib/learning/mastery.ts:191` | 无调用；长期未复习不降级 |
| `TITLE_PROMPT` | `src/lib/ai/prompt.ts:295` | 无调用；标题用 `fallbackTitle` 截断 |
| `LessonSummary` | `src/lib/blocks/schema.ts:193` | 未使用 |
| `KIND_LABEL` | `src/lib/blocks/schema.ts:204` | 未使用 |
| `renderCitationsForExport` | `src/lib/ai/citations.ts:63` | 仅单测；无导出入口 |
| `hasCitationToken` | `src/lib/ai/citations.ts:80` | 仅单测；产品未用 |
| `Stat`、`ProbeResult` 等类型 | 各自文件 | 类型本身不算运行时死代码，可保留 |

### 5.3 死路由/兼容入口

| 路由 | 现状 | 建议 |
| --- | --- | --- |
| `POST /api/sessions/[id]`（`action:"exercise"`） | 无 UI/测试调用，注释写「预留」 | 删除，或补产品入口 |
| `POST /api/ai/test` | 仅 `tests/smoke.mjs` 使用；设置页已改用 `/api/models/[id]/test` | 标注 test-only，或删除 |
| `PUT /api/settings/ai` | UI 不调用，仅旧版兼容 | 若无需兼容旧客户端，删除；保留 GET 即可 |
| `export { AiError }` | `attempts/route.ts:161`；不是路由导出 | **立即删除**；它是 Webpack 构建失败的唯一原因 |

### 5.4 未被产品使用的数据/字段

| 资产 | 位置 | 现状 |
| --- | --- | --- |
| `users` 表 | `schema.ts:17-21` | 从未写入/读取 |
| `goals` 表、`sessions.goal_id`、`plans.goal_id` | `schema.ts:117-134/304-314` | 产品已确定「计划=目标」，goals 是旧模型；无 API/UI |
| `source_feedback` 读取侧 | `schema.ts:208-216`；仅 `source-feedback/route.ts` 写入 | 来源排序没有任何读取；UI 的「降低同类来源权重」未实现 |
| `usage_log` 读取侧 | `schema.ts:398-408`；`repo.logUsage` 只写 | 没有用量/成本面板（D1 未做） |
| `concepts.prerequisites` / `concept_edges` | `concept_edges`、`getConcept` 返回 | 档案页/提示词均未使用；前置关系只写不读 |
| `plan_items.concept_id` | `tools.ts:save_plan` 写 null | 计划步骤与知识点未绑定 |
| `exercises.version` | `schema.ts:249` | 无读写 |
| `sessions.archived` / `topics.archived` | `schema.ts:53/132` | 有查询过滤，但没有任何写入 1 的入口 |
| `attempts.max_score` | `schema.ts:267` | 永远 1；无多分值题型 |
| `blocks.status` | `schema.ts:227` | 永远 ready；无错误组件状态 |
| `ExerciseInput.accept` | `schema.ts:34` / `tools.ts:118` | 判题完全忽略 |
| `ExerciseInput.blanks` | `schema.ts:28` | 由 answer 推导，字段未用 |
| `chatBody.goal` | `chat/route.ts:35` / `prompt.ts` | 前端从不发送；目标文本实际上就是用户消息 |
| `BlockKind.fallback` | `types.ts:70` | 没有任何工具创建该类型 |
| `sessions.goal_id` | `repo.createSession` | UI 不传 goalId |

### 5.5 代码里的无效表达式

- `src/components/chat/SessionView.tsx:690`：`{error && messages.length === 0 ? null : null}` —— 恒为 null 的死表达式。
- `src/components/chat/SessionView.tsx:820,869`：`textParts` 只参与一个恒为 null 的三元表达式；删除即可。
- `src/lib/db/repo.ts:215`：`/** 会话绑定模型；传 null 表示跟随默认 */` 注释挂在了 `findOpenReviewSession` 上方，注释与函数不符。

### 5.6 测试/仓库卫生

- `tests/_ui_tmp.mjs`、`tests/_ux1.mjs`、`tests/_ux6.mjs`、`tests/_ux7.mjs`：临时脚本，未被 npm script/CI 引用；`_ui_tmp.mjs` 是 `ui-check.mjs` 的旧副本。建议删除或移到 `scripts/` 并注明用途。
- `build.log`、`tsconfig.tsbuildinfo`、`research/` 下的重复截图与旧报告：不属于运行时代码，但让仓库变重。
- `data/verify*`、`data/token-test` 等测试库：已被 `.gitignore` 忽略，但本机占用空间；可归档或清理。
- 没有 `.git`、没有 CI、没有 ESLint 配置、没有 `engines` 字段；`package.json` 只有 test/build/start，没有 lint/typecheck 脚本。

---

## 6. 缺陷清单（按优先级）

> P0 = 数据丢失/未授权访问；P1 = 直接破坏核心卖点或必须修；P2 = 明显功能/体验缺口；P3 = 卫生/维护性问题。本次**未发现 P0**。

### P1 · 必须先修

| ID | 位置 | 现象/证据 | 修复方向 |
| --- | --- | --- | --- |
| P1-1 | `src/lib/learning/exercise.ts:190-214,266-293` | 填空/分步骤用「包含」匹配；探针实测「成本」判对「机会成本」 | 短答案必须归一化后完全相等；长答案才允许包含，且要求最小长度/相似度；补回归测试 |
| P1-2 | `src/components/chat/ExerciseBlock.tsx:73-74,164-186,440-459` | 「再做一次」不清 `usedHint`/`hint`/`idemRef`；实测第二次正确提交仍 `usedHint=true`，第三次同答案 `duplicate=true` | 重做时重置 `usedHint=false`、`hint=null`、`idemRef=null`、`startedAt=Date.now()`；补浏览器回归 |
| P1-3 | `src/lib/db/repo.ts:1241-1271,1328` | `independent=false` 时 `applyEvidence` 不变，但 `scheduleNext` 仍执行并删 open 复习条；实测证据数不变、`next_review_at` 被重写、review item id 变化 | 仅在 `outcome.countedForMastery` 时更新调度/删除复习条；`lastStudiedAt` 也不要更新；补集成测试 |
| P1-4 | `src/lib/db/repo.ts:1898-1948,1979-1981`；`src/app/review/page.tsx:179-196` | dismiss/done 下一次 `refreshReviewQueue` 立即重建同 concept 的条目（实测 dismiss 后立刻出现新 id） | `existing` 纳入 recently acted 条目；或只在证据变化/到期后重建；补 API 回归 |

### P2 · 对外分发前应修

| ID | 位置 | 现象/风险 | 修复方向 |
| --- | --- | --- | --- |
| P2-1 | 出题链路 `tools.ts:present_exercise` + `schema.ts` | 答案键无独立校验；选项可重复；题干/提示可能泄答案；真实 C 题口径有歧义 | 二次校验（答案键/唯一性/自洽/泄题/歧义）；不通过降级或标注 |
| P2-2 | `src/lib/db/repo.ts:809-834`；`tools.ts:364-369` | 概念按 topic 去重，`present_exercise` topic 可缺省为「未分类」；同一概念会分裂 | 全局规范化 + 合并/迁移；`findConceptByName` 已有实现可复用；topic 必填或从概念反查 |
| P2-3 | `src/app/library/page.tsx:160-170` | 「针对它练一练」新建 free 会话，丢计划/结构化复习 | 改为 review 模式 + focusConceptId + 可带 planId |
| P2-4 | `src/lib/ai/tools.ts:477-487`；`src/app/plan/page.tsx:56-70` | 计划步骤不绑定概念；步骤完成不自动推进 | plan_item 写入 conceptId；完成条件由证据/手动共同决定 |
| P2-5 | `src/app/api/workspace/[blockId]/route.ts:37-53` | 工作区用全局默认模型；用户消息重复；无引用/来源/usage | 用 session 模型；传 excludeMessageId；走 citations/saveMessageSources/logUsage；支持流式或明确说明 |
| P2-6 | `src/lib/materials/parse.ts:10,39-45` | `.html` 永远走原始文本分支，`stripHtml` 不可达；材料没有「数据非指令」防注入声明 | 调整分支顺序；HTML 去脚本/样式；在材料上下文加防注入规则 |
| P2-7 | `src/lib/web/retrieve.ts:148-154`；`prompt.ts:219-232` | enrich 抓到的正文写进 meta.excerpt，但 prompt 只读 snippet；正文浪费 | prompt 使用 excerpt（截断）或删除 enrich；补测试 |
| P2-8 | `SourceCards.tsx:45`；`source_feedback` 表 | 用户反馈「已记录，后续会降低同类来源权重」，但没有任何读取逻辑 | 要么在 rankAndDedupe 读取反馈降权，要么删掉这句承诺/入口 |
| P2-9 | `src/lib/db/repo.ts:1117-1126`；`review_items` | 答错也会删 open review；复习会话与 review item 脱节；答错后再点会新开会话 | 复习条目改为 in_progress/完成才 done；保留会话绑定；`findOpenReviewSession` 以「未完成」为准 |
| P2-10 | `src/lib/ai/tools.ts:503-515`；`StaticBlocks.tsx:144` | `write_summary` 的 progress 无证据校验，UI 却写「有证据的进展」 | 服务端按证据生成/校验 summary；或 UI 改为「模型自述」 |
| P2-11 | `src/app/page.tsx:75`；`repo.ts:943-951,975-984` | 档案页 `emptyCount` 用 `evidenceCount===0`，后端清理排除有 attempts 的概念；显示数与实际删除数可能不一致 | UI 使用 `/api/concepts/cleanup` GET 的 `empty`，或同一 SQL 条件 |
| P2-12 | `attempts/route.ts:161` | `export { AiError }` 导致 Webpack 构建类型检查失败（已实测） | 删除该行；补 `next build --webpack` 或类型检查 CI |
| P2-13 | `src/lib/learning/exercise.ts:312-338` | `inferErrorType` 不用题型参数；单选/判断永远「概念混淆」；错因再注入提示词 | 按选项内容/差距/题型细分；不确定时返回 null，不要硬猜 |
| P2-14 | `src/lib/ai/prompt.ts:245-293`；`SessionView` | 历史只保留文本和 block 占位，多轮后丢失图表/表格/练习细节；`availableMinutes` 每轮重复注入 | history 加 block 摘要（标题/类型/关键数据）；分钟数只对首轮或会话级生效 |

### P3 · 维护性/体验/文档

| ID | 问题 | 位置/证据 | 建议 |
| --- | --- | --- | --- |
| P3-1 | `handleError` 把内部错误原文拼进 500 响应 | `src/lib/api/helpers.ts:37-44` | 公网前改为通用文案，详情只进日志 |
| P3-2 | Modal 无焦点陷阱/初始焦点/关闭后焦点恢复 | `src/components/ui/kit.tsx:190-246` | 加 focus trap + `aria-labelledby` |
| P3-3 | `start.bat` 只要 `.next` 存在就跳过构建 | `start.bat:58-62` | 比较源码 mtime 与 BUILD_ID，或提供「重新构建」入口 |
| P3-4 | README 漂移：写「24 张表」（实际 29）、「暂不支持删除单条证据行」（已有 DELETE）、「页码」（page 恒 null）、「渐进提示」（只有一条）；重复「诊断与行动」段落与重复的改进落地行 | `README.md:68-73,78,104,126,135-137` | 同步文档；删重复段落 |
| P3-5 | 测试写死 `research/shots/` 固定文件名，会覆盖旧截图 | `tests/ui-check.mjs` | 写到临时目录或带时间戳 |
| P3-6 | UI 测试的计划删除断言用文本出现次数 | `tests/ui-check.mjs:258-268` | 改计划卡片/API 数量断言 |
| P3-7 | 无 git/CI/lint/engines；没有覆盖率 | 仓库根 | 建 git + CI（typecheck/test/build）+ ESLint + coverage |
| P3-8 | N+1 查询：`listConcepts` 每个 concept 查一次 prerequisites；`listSessions` 每个 session 查 topics；复习刷新每个 concept 查 plan | `repo.ts:846-871,316-341,1898-1948` | 批量查询/缓存；数据量大时再加分页 |
| P3-9 | 无分页：sessions 40、concepts 500、review 30、materials 全量、messages 200 | 各 route/repo | 增加游标分页 |
| P3-10 | 删除会话连带证据不清理 `exercise_feedback`；删除材料后来源卡片指向已删切片（有提示） | `repo.deleteSession`、`materials` | 清理孤儿或保留并标注；已有提示可接受 |
| P3-11 | API Key 明文存 SQLite；本地可接受 | `ai_models.api_key` | 多用户/云部署前加密或改用系统密钥环 |
| P3-12 | 无 CSRF token/限流；默认本地保护 | `proxy.ts` | 局域网/公网前补 |
| P3-13 | `source_feedback` / `usage_log` 只写不读；`goals`/`users` 死表；`concept_edges` 只写不读 | 见第 5 节 | 清理或补产品入口 |
| P3-14 | 测试无教学质量/提示词评测；全 mock 只能证明链路 | `tests/*` | 加 30–50 条教学场景评测集与真实模型回归 |

---

## 7. 改进建议（按投入产出排序）

### 批次 0：马上做（0–3 天，先恢复信任）

1. **修 4 个 P1**，每个补一条回归测试：
   - 填空/分步严格匹配 + `accept` 支持；
   - 重做重置 `usedHint/hint/idemRef/startedAt`；
   - `weight=0` 不调度、不删复习条、不更新 `lastStudiedAt`；
   - review item 的 dismissed/done 纳入冷却，不在下次刷新重建。
2. **删掉 `export { AiError }`**，跑一次 `next build --webpack`；顺手清理 15 个未使用导入。
3. **修 UI 测试的计划删除断言**，把 48/48 变绿；测试截图写到临时目录。
4. **同步 README**（表数、证据删除、页码、渐进提示、重复段落）。

**验收标准**：新增 4 条单元/集成 + 2 条浏览器断言；`npm test`、`smoke`、`ui-check` 全绿；Webpack/Turbopack 都能构建。

### 批次 1：两周内（把教学闭环补完整）

1. **题目质量门**：二次校验答案键、选项唯一性、题干自洽、是否泄题、提示是否泄答案；歧义题标注并不计证据。
2. **概念去重/合并**：全局 canonical name 或合并 UI；`present_exercise` 缺 topic 时按概念名反查已有 topic；提供「合并到…」操作。
3. **结构化入口统一**：档案练一练 → review 模式；计划步骤 → 绑定 concept/plan item；首页复习建议可直接开始；weak 今日卡带 planId。
4. **复习生命周期**：review item 与 session 绑定；答错不删除；完成才 done；忽略有冷却；复习会话可继续。
5. **工作区对齐**：session 模型、excludeMessageId、引用校验/来源、usage_log、模型标注；要么支持流式，要么明确「一次性返回」。
6. **材料安全与兑现**：HTML 去脚本；材料上下文加「数据非指令」；要么解析 PDF 页码，要么删掉「页码」承诺。
7. **清理死代码/死表/死字段**：至少删 `users`/`goals` 或标 deprecated；`source_feedback`/`usage_log` 要么接产品，要么删。
8. **空壳清理计数**统一 UI 与后端。

**验收标准**：每个入口都能说清「属于哪个计划、聚焦哪个概念、完成条件是什么」；档案/计划/复习/工作区不再有丢 plan 或默认模型的路径。

### 批次 2：1–2 个月（把「教学效果」做成可证明的）

1. **教学场景评测集**（30–50 条）：诊断、换讲法、出题、提示、先测后讲、错误纠正、不泄答案、不编造引用；人工 1–5 分 + 自动工具/引用断言。
2. **学习增益实验**：同一知识点前测/后测；每周独立正确知识点数；提示依赖率；看解析率；复习完成率；7 日留存。
3. **反馈质量**：确定性判题 + 模型生成针对性反馈；反馈中必须指出「你选了哪个选项/哪一步错」；错因不确定时不要硬分类。
4. **渐进提示**：3 级提示，逐级解锁；提示后仍要求独立作答；提示不泄答案校验。
5. **掌握度校准**：A4 校准视图（预测 p vs 实际正确率）；难度/遗忘参数按知识点校准；长期未复习的 staleness 进入队列；考虑部分分进入 BKT。
6. **课程状态**：计划步骤 ↔ 概念 ↔ 证据；自动建议下一步；完成条件可解释。
7. **用量/成本面板**：usage_log 聚合；按模型/会话/天；预算提醒。
8. **工程化**：git/CI/ESLint/coverage/engines；分页与 N+1 优化；公网安全（CSRF/限流/密钥加密/错误脱敏/CSP nonce）。

### 明确不建议做（与产品方向一致）

- 排行榜/积分/社区/数字人；
- 一上来接向量库；
- 多租户 SaaS；
- 继续堆更多工具类型；
- 全局计划切换器（保持各页局部下拉）。

---

## 8. 放行结论

| 场景 | 结论 |
| --- | --- |
| 本机自用 / 个人学习 | **可以继续用**。主链路真实可用，真实模型抽样质量好；建议先修 P1，否则掌握度与复习建议会失真。 |
| 给朋友/小范围试用 | **有条件放行**：P1 全修 + P2-1（答案键校验）+ P2-3/4/5（入口联动）+ P2-6（材料防注入）+ README 同步。 |
| 公开分发 / 多用户 / 公网 | **暂不放行**：还需 CSRF/限流、密钥加密、错误脱敏、真实学习效果数据、完整的教学评测集。 |

**最终评价**：Lumina 的「教学设计 + 证据系统」是真正的差异化，不是套壳；它已经跨过了「能跑」和「有闭环」两道门槛。下一步最该做的不是加更多功能，而是把**证据可信度**和**教学效果度量**做实——这两件事决定它是「一个聪明的 AI 学习工具」还是「一个可信的私人导师」。

---

## 附录 A：本次验收命令

```bash
# 类型检查
node node_modules/typescript/bin/tsc --noEmit

# 单元/集成
node node_modules/vitest/vitest.mjs run

# 独立实例（不影响 3210）
DATA_DIR=./data/audit-qa node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3212

# 测试替身
node tests/mock-llm-server.mjs   # 4318
node tests/mock-web-server.mjs   # 4319

# 端到端 / 浏览器
BASE_URL=http://127.0.0.1:3212 node tests/smoke.mjs
BASE_URL=http://127.0.0.1:3212 node tests/ui-check.mjs

# 构建可移植性（隔离副本）
next build --webpack
```

## 附录 B：真实模型抽样记录说明

- 模型：火山方舟 `deepseek-v4-1-flash-261017`（你本机已配置）。
- 5 次调用：A 诊断讲解、B 错误概念纠正、C 出题、D 基于错答补救、E 结构化复习。
- 全部 HTTP 成功；无超时/限流；延迟 8.3–24.0s；输入 18,803 / 输出 9,181 tokens。
- 抽样库中已有此前 mock 测试生成的「机会成本」证据与材料，因此 A 场景中模型说「根据你已有的作答记录」并引用 `[[m1]]` 是上下文真实生效，不代表你的真实主库；主库仍是干净库。
- 抽样只用于判断「这套提示词/工具链在真实模型下的教学行为」，不构成学习效果实验。

## 附录 C：与上一份外部验收（87/100）的关系

- 上一份报告指出的 P1（删会话不重算）与多数 P2（调度参数、历史重复、证据自报、幂等键、默认监听、安全头）已在代码中修复，并有测试覆盖。
- 本次新发现的问题不是「旧问题复发」，而是更深入地检查了**证据判定规则、重做状态机、复习条目生命周期、真实模型出题质量**后暴露的新问题。
- 因此本次 83 分不是项目退步，而是验收标准更严格；两套分数不可直接相减。

## 附录 D：追加变更（2026-10-23 晚）

- 用户反馈「教完知识点、答完题后应该有选项，不用一直说然后呢」；已新增 `NextActions`：教学后「出题检验 / 换个讲法 / 继续检验（x/3）」，答对后「继续检验 / 进入 Day Y / 讲讲这道题 / 看知识点」；答错/未评阅不提供离开本步。
- 计划步骤完成改为证据判定：本步至少 3 个不同知识点独立答对（未看解析/未用提示/未作废）时自动完成；未达标只显示 `继续检验（x/3）`，不再让用户手动判断完成。
- `sessions` 新增 `plan_item_id`；计划页「学这一步」和下一步按钮都会绑定具体步骤；计划页显示 `验证 x/3` 和已验证知识点，手动完成仅作为覆盖入口。
- 计划步骤只绑定档案里已存在的概念；未命中的步骤显示「未绑定概念」并支持「改绑」，不再为未来课程预建空壳。
- 知识点新增 `introduced_at`：讲解/出题登记后显示「已讲解 · 待验证」，不再与「尚未接触」混淆；空壳清理只清「从未讲解且零证据」的概念，并排除计划步骤引用。
- 新增手动合并（近义词/叫法不同）与单概念删除保护：合并会转移证据/题目/复习/计划引用并重算；计划引用的知识点禁止直接删除。
- 历史上下文不再用 `[已展示…]` 占位符，落库前也会清理模型复述的占位符；摘要区改为「模型总结的进展」并注明以证据为准；联网 enrich 正文进入提示词；来源反馈不再承诺未实现的降权。
- 新增第一版多题小测（`present_quiz` + `QuizBlock`）：2–5 道确定性题统一提交，返回「答对 x/n 题」、平均分和逐题反馈；每题仍过二次校验，答案不下发，全部答对且计入证据才提供继续下一步。
- 支持多知识点混合小测：整套有默认 concept/topic，每题可覆盖；服务端按每题自己的知识点写证据，覆盖本步 3 个不同知识点的混合小测可直接推进计划步骤；实测 3 题覆盖 3 个知识点后计划从 0/4 → 1/4，并出现「进入下一步」。
- 回归：106 单测/集成、浏览器回归 55/55（含多知识点混合小测）、专项交互/证据完成/合并改绑/混合小测推进计划探针通过；Turbopack 与 Webpack 构建通过，3210 已重建重启。
- 测试数据已按上述规则整理：保留 6 个实际知识点（1 个有证据），合并 2 组近义词，删除 7 个计划空壳，Day 1 改绑「中心化记账」并显示 1/3；操作前备份在 `data/backup/pre-fix-20261023/lumina.db`。

## 附录 E：双模式与计划 → 课程 → 知识点重构（2026-10-23）

> 本附录取代附录 D 中「本步至少 3 个不同知识点独立答对才完成」的旧规则。

- **模式**：`free` 改名为无限学习（内部 `infinite`）；目标学习保留 `goal`，复习保留 `review`。首页提供两个独立入口，无限学习不需要计划，目标学习先生成计划草稿。
- **无限学习隔离**：`save_concepts` 在无限学习不写正式档案；`present_exercise/present_quiz` 创建 `concept_id=null` 的练习，不写 evidence、不推进课程、不生成复习；历史页单独分组。
- **目标学习结构**：计划 → 课程（`plan_items`）→ 知识点（`concepts.course_id`）。知识点只归属一门课程；没有归属的在档案中标「待整理」，不自动猜测。
- **计划确认**：`save_plan` 只生成 `draft`，不绑定会话、不开始教学；用户可在计划页编辑课程/知识点/顺序，确认后才生效。同名正式计划不会被重复创建。
- **进度口径**：学习进度按知识点状态加权（已掌握 1 / 学习中 0.4 / 待复习 0.2 / 待学习 0），课程完成严格要求全部知识点已掌握；未配置知识点的课程不计入完成率。首页、计划、课程、档案共用 `src/lib/learning/progress.ts`。
- **迁移**：新增 `concepts.course_id`；旧 `free` → `infinite`，明确绑定计划的旧 free 会话 → `goal`；旧 `plan_items.concept_id` 与有会话步骤证据的概念补回课程；无法确认的保持待整理。计划删除/课程删除只解除归属，不删除知识点、作答或证据。
- **页面**：新增 `/plan/[id]` 计划详情/编辑页和 `/plan/[id]/course/[courseId]` 课程页；档案按计划/课程分组，p 值/证据次数收进详情；历史区分无限学习与目标计划；复习条目显示计划/课程并可回到知识点。
- **测试与构建**：单元/集成 **112/112**；API 冒烟 **81/81**（隔离测试库）；浏览器回归 **69/69**（含计划确认、课程页、学习后课程/计划进度更新、移动端课程页、历史分组）；`tsc --noEmit` 通过；生产构建通过；3210 已重建重启。桌面与 390px 移动端页面无横向溢出。
- **数据**：迁移前备份 `data/backup/pre-dual-mode-20261023-113325.db`。主库旧 Day 1 的三个已学概念已补回课程；其余旧计划课程未配置知识点，界面明确标为「未配置」，没有用已有知识点倒推完成率。
- **已知边界**：已属于其他课程的知识点不会自动复制进新计划，草稿会提示冲突；需要用户先在档案中合并/移除。课程编辑不提供拖拽排序（上/下移）；无限学习的“整理到已确认计划”目前通过生成计划草稿实现，而不是把历史会话直接改绑到已有计划。
