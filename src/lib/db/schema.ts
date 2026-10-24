/**
 * 数据库结构定义（SQLite）
 *
 * 设计原则：
 * 1. 学习证据（evidence / attempts）与 UI 状态（blocks.state）严格分离——
 *    用户拖动滑块、临时调参不会写入长期学习档案。
 * 2. 会话（sessions）与长期档案（concepts / evidence）解耦，
 *    删除会话默认保留证据（可显式连带删除）。
 * 3. 所有掌握度变更都留审计（concept_events / mastery_snapshots），可回溯依据。
 */
export const SCHEMA_SQL = `
create table if not exists schema_migrations (
  id text primary key,
  applied_at integer not null
);

create table if not exists users (
  id text primary key,
  name text not null default '学习者',
  created_at integer not null
);

-- 多模型配置：每条是一套完整的端点 + Key + 模型名
create table if not exists ai_models (
  id text primary key,
  label text not null,
  provider text not null default 'openai',
  base_url text not null,
  model text not null,
  api_key text not null default '',
  temperature real not null default 0.6,
  is_default integer not null default 0,
  last_ok_at integer,
  last_test_ms integer,
  last_error text,
  created_at integer not null,
  updated_at integer not null
);
create index if not exists ix_ai_models_default on ai_models(is_default desc, updated_at desc);

create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at integer not null
);

-- ── 知识主题 / 知识点 ─────────────────────────────────────────────
create table if not exists topics (
  id text primary key,
  name text not null,
  description text,
  canonical_key text not null,
  archived integer not null default 0,
  created_at integer not null,
  updated_at integer not null
);
create unique index if not exists ux_topics_key on topics(canonical_key);

create table if not exists concepts (
  id text primary key,
  topic_id text not null references topics(id) on delete cascade,
  -- 唯一所属课程（plan_items 即课程/学习单元）；为空表示待整理
  course_id text,
  name text not null,
  definition text,
  canonical_key text not null,
  status text not null default 'untouched',
  p_mastery real not null default 0.1,
  evidence_count integer not null default 0,
  independent_correct integer not null default 0,
  hint_uses integer not null default 0,
  wrong_streak integer not null default 0,
  distinct_exercises integer not null default 0,
  stability real not null default 0,
  difficulty real not null default 5,
  reps integer not null default 0,
  lapses integer not null default 0,
  next_review_at integer,
  last_studied_at integer,
  -- 是否已经讲解/出题接触过（不等于有作答证据；用于区分“没讲过”和“讲过但没测”）
  introduced_at integer,
  created_at integer not null,
  updated_at integer not null
);
create unique index if not exists ux_concepts_topic_key on concepts(topic_id, canonical_key);
create index if not exists ix_concepts_topic on concepts(topic_id);
-- course_id 的索引由迁移创建：旧库必须先加列，不能在建表阶段直接建索引
create index if not exists ix_concepts_due on concepts(next_review_at);

create table if not exists concept_edges (
  from_id text not null references concepts(id) on delete cascade,
  to_id text not null references concepts(id) on delete cascade,
  kind text not null default 'prereq',
  created_at integer not null,
  primary key (from_id, to_id, kind)
);

create table if not exists concept_events (
  id text primary key,
  concept_id text not null references concepts(id) on delete cascade,
  from_status text,
  to_status text,
  from_p real,
  to_p real,
  reason text not null,
  detail text,
  actor text not null default 'system',
  created_at integer not null
);
create index if not exists ix_concept_events_concept on concept_events(concept_id, created_at);

create table if not exists mastery_snapshots (
  id text primary key,
  concept_id text not null references concepts(id) on delete cascade,
  p_mastery real not null,
  status text not null,
  recorded_at integer not null
);
create index if not exists ix_snapshots_concept on mastery_snapshots(concept_id, recorded_at);

-- ── 会话 ────────────────────────────────────────────────────────
create table if not exists sessions (
  id text primary key,
  title text not null default '新的学习',
  mode text not null default 'infinite',
  goal_id text,
  -- 归属的学习计划（计划即“目标”）；为空表示未归类
  plan_id text,
  -- 结构化复习（A2）：会话绑定的知识点与复习条目
  focus_concept_id text,
  review_item_id text,
  -- 从计划页/「下一步」进入时绑定的具体计划步骤；为空表示未绑定
  plan_item_id text,
  -- 本会话使用的模型配置（多模型）：为空表示跟随默认模型
  model_id text,
  summary text,
  resume_hint text,
  message_count integer not null default 0,
  archived integer not null default 0,
  created_at integer not null,
  updated_at integer not null
);
create index if not exists ix_sessions_updated on sessions(updated_at desc);

create table if not exists session_topics (
  session_id text not null references sessions(id) on delete cascade,
  topic_id text not null references topics(id) on delete cascade,
  confidence real not null default 0.5,
  primary key (session_id, topic_id)
);

create table if not exists messages (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  role text not null,
  content text not null default '',
  parts text,
  status text not null default 'done',
  model text,
  error text,
  seq integer not null,
  created_at integer not null
);
create index if not exists ix_messages_session on messages(session_id, seq);

-- 每条助手消息引用的来源（材料 / 网络），与消息同生命周期
-- 注意：只存元数据与 ≤600 字摘录，不存整页正文
create table if not exists message_sources (
  id text primary key,
  message_id text not null references messages(id) on delete cascade,
  ordinal integer not null,
  kind text not null,              -- 'material' | 'web'
  ref_id text,                     -- chunk id 或 canonical URL
  title text not null,
  url text,
  domain text,
  published_at integer,
  retrieved_at integer not null,
  snippet text,
  stale integer not null default 0,
  meta text,
  created_at integer not null
);
create index if not exists ix_message_sources_msg on message_sources(message_id, ordinal);

-- 搜索结果缓存：只存规范化结果，不存整页 HTML
create table if not exists web_cache (
  id text primary key,
  query_hash text not null unique,
  query text not null,
  provider text not null,
  results text not null,
  fetched_at integer not null,
  expires_at integer not null
);
create index if not exists ix_web_cache_exp on web_cache(expires_at);

-- 搜索日志：成本、延迟、缓存命中率（只记 hash，不记完整 query）
create table if not exists web_search_log (
  id text primary key,
  session_id text,
  message_id text,
  query_hash text not null,
  provider text not null,
  cache_hit integer not null default 0,
  result_count integer not null default 0,
  latency_ms integer,
  ok integer not null default 1,
  error text,
  created_at integer not null
);
create index if not exists ix_web_log_session on web_search_log(session_id, created_at);

-- 来源质量反馈
create table if not exists source_feedback (
  id text primary key,
  source_id text,
  url text,
  domain text,
  kind text not null,              -- 'irrelevant' | 'outdated' | 'paywall' | 'wrong'
  note text,
  created_at integer not null
);

-- ── 教学组件 ────────────────────────────────────────────────────
create table if not exists blocks (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  message_id text,
  kind text not null,
  title text,
  payload text not null,
  state text,
  status text not null default 'ready',
  created_at integer not null,
  updated_at integer not null
);
create index if not exists ix_blocks_session on blocks(session_id, created_at);
create index if not exists ix_blocks_message on blocks(message_id);

-- ── 练习与作答 ──────────────────────────────────────────────────
-- 注意：exercises 不设 session 级联删除。
-- 学习档案必须独立于会话：删除一段聊天不等于抹掉它留下的作答明细。
create table if not exists exercises (
  id text primary key,
  session_id text not null,
  block_id text,
  concept_id text,
  type text not null,
  prompt text not null,
  options text,
  answer text not null,
  rubric text,
  explanation text,
  difficulty integer not null default 2,
  version integer not null default 1,
  -- 服务端记录"看过解析/用过提示"，不信任客户端自报
  solution_viewed_at integer,
  hint_used_at integer,
  hint_count integer not null default 0,
  -- 出题二次校验：passed / ambiguous / unverified
  verification text not null default 'unverified',
  verification_note text,
  created_at integer not null
);
create index if not exists ix_exercises_session on exercises(session_id);
create index if not exists ix_exercises_concept on exercises(concept_id);

create table if not exists attempts (
  id text primary key,
  exercise_id text not null references exercises(id) on delete cascade,
  session_id text not null,
  concept_id text,
  user_answer text not null,
  is_correct integer,
  score real,
  max_score real not null default 1,
  feedback text,
  used_hint integer not null default 0,
  viewed_solution integer not null default 0,
  independent integer not null default 1,
  -- 错因（A1）：只用于"怎么教"，不参与掌握度计算
  error_type text,
  attempt_no integer not null default 1,
  duration_ms integer,
  idempotency_key text,
  created_at integer not null
);
create unique index if not exists ux_attempt_idem on attempts(exercise_id, idempotency_key);
create index if not exists ix_attempts_exercise on attempts(exercise_id, created_at);
create index if not exists ix_attempts_concept on attempts(concept_id, created_at);

create table if not exists evidence (
  id text primary key,
  session_id text,
  concept_id text not null references concepts(id) on delete cascade,
  kind text not null,
  ref_id text,
  correct integer,
  score real,
  independent integer not null default 1,
  hint_used integer not null default 0,
  weight real not null default 1,
  note text,
  -- 软作废（A3）：保留审计，不参与掌握度与调度
  voided integer not null default 0,
  void_reason text,
  voided_at integer,
  created_at integer not null
);
create index if not exists ix_evidence_concept on evidence(concept_id, created_at);

-- ── 目标 / 计划 ─────────────────────────────────────────────────
create table if not exists goals (
  id text primary key,
  title text not null,
  target_level text,
  baseline text,
  minutes_per_day integer,
  deadline integer,
  status text not null default 'active',
  created_at integer not null,
  updated_at integer not null
);

create table if not exists plans (
  id text primary key,
  goal_id text references goals(id) on delete cascade,
  title text not null,
  note text,
  -- draft=待确认，active=正式学习，paused=暂停
  status text not null default 'draft',
  created_at integer not null,
  updated_at integer not null
);

create table if not exists plan_items (
  id text primary key,
  plan_id text not null references plans(id) on delete cascade,
  concept_id text,
  title text not null,
  rationale text,
  order_index integer not null,
  status text not null default 'pending',
  created_at integer not null,
  updated_at integer not null
);
create index if not exists ix_plan_items_plan on plan_items(plan_id, order_index);

-- ── 学习材料 ────────────────────────────────────────────────────
create table if not exists materials (
  id text primary key,
  name text not null,
  mime text,
  size integer not null default 0,
  path text,
  status text not null default 'parsed',
  text_chars integer not null default 0,
  error text,
  -- 归属的学习计划；为空表示未归类
  plan_id text,
  created_at integer not null
);

create table if not exists material_chunks (
  id text primary key,
  material_id text not null references materials(id) on delete cascade,
  idx integer not null,
  page integer,
  heading text,
  text text not null
);
create index if not exists ix_chunks_material on material_chunks(material_id, idx);

-- ── 复习 ────────────────────────────────────────────────────────
create table if not exists review_items (
  id text primary key,
  concept_id text not null references concepts(id) on delete cascade,
  -- 生成该条复习时概念最近一次学习所在计划；为空表示未归类
  plan_id text,
  reason text not null,
  priority integer not null default 2,
  due_at integer,
  status text not null default 'open',
  created_at integer not null,
  acted_at integer
);
create index if not exists ix_review_status on review_items(status, priority);

-- ── 小结 / 用量 ─────────────────────────────────────────────────
create table if not exists summaries (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  data text not null,
  created_at integer not null
);
create index if not exists ix_summaries_session on summaries(session_id, created_at);

create table if not exists exercise_feedback (
  id text primary key,
  exercise_id text not null,
  session_id text,
  vote text not null,
  note text,
  created_at integer not null
);
create index if not exists ix_feedback_exercise on exercise_feedback(exercise_id, created_at);

create table if not exists usage_log (
  id text primary key,
  session_id text,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  ok integer not null default 1,
  error text,
  created_at integer not null
);
`;
