import { getDb, jsonParse, now, uid } from "./index";
import { normalizeText } from "@/lib/blocks/schema";
import { applyEvidence, type ConceptState } from "@/lib/learning/mastery";
import { reviewGradeFromAttempt, scheduleNext, type ScheduleResult } from "@/lib/learning/scheduler";
import {
  conceptDisplayStatus,
  courseProgressOf,
  courseStatusOf,
  planProgressOf,
  type ConceptLike,
} from "@/lib/learning/progress";
import type {
  BlockDTO,
  BlockKind,
  ConceptDTO,
  ConceptStatus,
  CourseConceptDTO,
  CourseStatus,
  ExercisePublic,
  ExerciseType,
  LearningMode,
  MaterialDTO,
  MessageDTO,
  MessagePart,
  PlanDTO,
  PlanItemDTO,
  PlanStatus,
  ReviewItemDTO,
  SessionSummary,
  EvidenceDTO,
  SourceDTO,
} from "@/lib/types";

// ────────────────────────────── settings ──────────────────────────────
export function getSetting(key: string): string | null {
  const row = getDb().prepare("select value from settings where key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      "insert into settings (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at",
    )
    .run(key, value, now());
}

export function getJsonSetting<T>(key: string): T | null {
  const raw = getSetting(key);
  if (!raw) return null;
  return jsonParse<T | null>(raw, null);
}

export function setJsonSetting(key: string, value: unknown) {
  setSetting(key, JSON.stringify(value));
}

// ────────────────────────────── 多模型配置 ──────────────────────────────
/**
 * 一条模型配置的完整存储形态（含明文 Key，只在服务端使用）。
 * 对外接口一律走 publicAiModel() 脱敏，绝不能直接序列化这个结构。
 */
export interface AiModelRow {
  id: string;
  label: string;
  provider: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  isDefault: boolean;
  lastOkAt: number | null;
  lastTestMs: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

function mapAiModel(r: Record<string, unknown>): AiModelRow {
  return {
    id: String(r.id),
    label: String(r.label),
    provider: (r.provider as AiModelRow["provider"]) ?? "openai",
    baseUrl: String(r.base_url ?? ""),
    model: String(r.model ?? ""),
    apiKey: String(r.api_key ?? ""),
    temperature: Number(r.temperature ?? 0.6),
    isDefault: Number(r.is_default) === 1,
    lastOkAt: r.last_ok_at == null ? null : Number(r.last_ok_at),
    lastTestMs: r.last_test_ms == null ? null : Number(r.last_test_ms),
    lastError: (r.last_error as string) ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function listAiModels(): AiModelRow[] {
  const rows = getDb()
    .prepare("select * from ai_models order by is_default desc, updated_at desc")
    .all() as Record<string, unknown>[];
  return rows.map(mapAiModel);
}

export function getAiModel(id: string): AiModelRow | null {
  const row = getDb().prepare("select * from ai_models where id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapAiModel(row) : null;
}

export function getDefaultAiModel(): AiModelRow | null {
  const row = getDb()
    .prepare("select * from ai_models order by is_default desc, updated_at desc limit 1")
    .get() as Record<string, unknown> | undefined;
  return row ? mapAiModel(row) : null;
}

export function createAiModel(opts: {
  label: string;
  provider: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature?: number;
  isDefault?: boolean;
}): AiModelRow {
  const db = getDb();
  const id = uid("am_");
  const t = now();
  const hasAny = (db.prepare("select count(*) as n from ai_models").get() as { n: number }).n > 0;
  // 第一条自动成为默认，否则按调用方要求
  const makeDefault = opts.isDefault ?? !hasAny;
  db.transaction(() => {
    if (makeDefault) db.prepare("update ai_models set is_default = 0").run();
    db.prepare(
      `insert into ai_models (id, label, provider, base_url, model, api_key, temperature, is_default, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      opts.label.slice(0, 60),
      opts.provider,
      opts.baseUrl.replace(/\/+$/, ""),
      opts.model,
      opts.apiKey,
      opts.temperature ?? 0.6,
      makeDefault ? 1 : 0,
      t,
      t,
    );
  })();
  return getAiModel(id)!;
}

export function updateAiModel(
  id: string,
  patch: {
    label?: string;
    provider?: "openai" | "anthropic";
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    temperature?: number;
    isDefault?: boolean;
  },
): AiModelRow | null {
  const prev = getAiModel(id);
  if (!prev) return null;
  const db = getDb();
  // 至少保留一个默认：唯一一条配置不允许被取消默认，否则 aiStatus 会误报"未配置"
  const siblings = (
    db.prepare("select count(*) as n from ai_models where id <> ?").get(id) as { n: number }
  ).n;
  const keepDefault = patch.isDefault === false && prev.isDefault && siblings === 0;
  db.transaction(() => {
    if (patch.isDefault) db.prepare("update ai_models set is_default = 0").run();
    db.prepare(
      `update ai_models set label = ?, provider = ?, base_url = ?, model = ?, api_key = ?,
         temperature = ?, is_default = ?, updated_at = ? where id = ?`,
    ).run(
      (patch.label ?? prev.label).slice(0, 60),
      patch.provider ?? prev.provider,
      (patch.baseUrl ?? prev.baseUrl).replace(/\/+$/, ""),
      patch.model ?? prev.model,
      patch.apiKey === undefined ? prev.apiKey : patch.apiKey,
      patch.temperature ?? prev.temperature,
      keepDefault ? 1 : patch.isDefault ? 1 : patch.isDefault === false ? 0 : prev.isDefault ? 1 : 0,
      now(),
      id,
    );
  })();
  return getAiModel(id);
}

/** 删除模型配置。若删的是默认项，把最近更新的另一条提升为默认，避免"突然全都没了"。 */
export function deleteAiModel(id: string): { deleted: boolean; promotedId: string | null } {
  const db = getDb();
  const prev = getAiModel(id);
  if (!prev) return { deleted: false, promotedId: null };
  let promotedId: string | null = null;
  db.transaction(() => {
    db.prepare("delete from ai_models where id = ?").run(id);
    // 会话不再指向已删除的配置
    db.prepare("update sessions set model_id = null where model_id = ?").run(id);
    if (prev.isDefault) {
      const next = db
        .prepare("select id from ai_models order by updated_at desc limit 1")
        .get() as { id: string } | undefined;
      if (next) {
        db.prepare("update ai_models set is_default = 1 where id = ?").run(next.id);
        promotedId = next.id;
      }
    }
  })();
  return { deleted: true, promotedId };
}

export function recordAiModelTest(id: string, ok: boolean, ms: number, error?: string | null) {
  // 失败时保留上一次成功的时间与耗时：否则「上次什么时候还能用」会被一次失败抹掉。
  getDb()
    .prepare(
      `update ai_models set
         last_ok_at = case when ? = 1 then ? else last_ok_at end,
         last_test_ms = case when ? = 1 then ? else last_test_ms end,
         last_error = ?,
         updated_at = updated_at
       where id = ?`,
    )
    .run(ok ? 1 : 0, now(), ok ? 1 : 0, ms, ok ? null : (error ?? "连接失败").slice(0, 300), id);
}

/** 会话绑定模型；传 null 表示跟随默认 */
/** 找一条"还没作答过"的复习会话，用于「练一练」复用，避免每次点击都新开一个 */
export function findOpenReviewSession(reviewItemId: string): { id: string; title: string } | null {
  const row = getDb()
    .prepare(
      `select s.id, s.title from sessions s
        where s.review_item_id = ?
          and s.archived = 0
          -- 只要还没产生作答就算"进行中"：刚建好、消息还在路上的会话也该复用
          and not exists (select 1 from attempts a where a.session_id = s.id)
        order by s.updated_at desc limit 1`,
    )
    .get(reviewItemId) as { id: string; title: string } | undefined;
  return row ?? null;
}

export function setSessionModel(sessionId: string, modelId: string | null) {
  getDb().prepare("update sessions set model_id = ?, updated_at = ? where id = ?").run(
    modelId,
    now(),
    sessionId,
  );
}

export function getSessionModelId(sessionId: string): string | null {
  const row = getDb().prepare("select model_id from sessions where id = ?").get(sessionId) as
    | { model_id: string | null }
    | undefined;
  return row?.model_id ?? null;
}

// ────────────────────────────── sessions ──────────────────────────────
export function createSession(
  opts: {
    title?: string;
    mode?: LearningMode;
    goalId?: string;
    planId?: string | null;
    planItemId?: string | null;
    focusConceptId?: string;
    reviewItemId?: string;
    modelId?: string | null;
  } = {},
) {
  const db = getDb();
  const id = uid("s_");
  const t = now();
  db.prepare(
    `insert into sessions (id, title, mode, goal_id, plan_id, plan_item_id, focus_concept_id, review_item_id, model_id, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    opts.title ?? (opts.mode === "review" ? "复习" : "新的学习"),
    opts.mode ?? "infinite",
    opts.goalId ?? null,
    opts.planId ?? null,
    opts.planItemId ?? null,
    opts.focusConceptId ?? null,
    opts.reviewItemId ?? null,
    opts.modelId ?? null,
    t,
    t,
  );
  return getSession(id)!;
}

export function getSession(id: string) {
  const row = getDb().prepare("select * from sessions where id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const topics = getDb()
    .prepare(
      "select t.id, t.name from session_topics st join topics t on t.id = st.topic_id where st.session_id = ?",
    )
    .all(id) as { id: string; name: string }[];
  const focusConceptId = (row.focus_concept_id as string) ?? null;
  const focusConcept = focusConceptId ? getConcept(focusConceptId) : null;
  const planId = (row.plan_id as string) ?? null;
  const planTitle = planId
    ? (getDb().prepare("select title from plans where id = ?").get(planId) as { title: string } | undefined)?.title ?? null
    : null;
  const planItemId = (row.plan_item_id as string) ?? null;
  const courseTitle = planItemId
    ? (getDb().prepare("select title from plan_items where id = ?").get(planItemId) as { title: string } | undefined)?.title ?? null
    : null;
  return {
    id: String(row.id),
    title: String(row.title),
    mode: row.mode as LearningMode,
    goalId: (row.goal_id as string) ?? null,
    planId,
    planTitle,
    planItemId,
    courseTitle,
    focusConceptId,
    reviewItemId: (row.review_item_id as string) ?? null,
    focusConceptName: focusConcept?.name ?? null,
    modelId: (row.model_id as string) ?? null,
    modelLabel: (row.model_id as string) ? (getAiModel(String(row.model_id))?.label ?? null) : null,
    summary: (row.summary as string) ?? null,
    resumeHint: (row.resume_hint as string) ?? null,
    messageCount: Number(row.message_count ?? 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    topics,
  };
}

export function listSessions(limit = 30): SessionSummary[] {
  const rows = getDb()
    .prepare(
      `select s.*, p.title as plan_title, pi.title as course_title from sessions s
         left join plans p on p.id = s.plan_id
         left join plan_items pi on pi.id = s.plan_item_id
        where s.archived = 0
        order by datetime(s.updated_at/1000,'unixepoch') desc limit ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    mode: r.mode as LearningMode,
    modelId: (r.model_id as string) ?? null,
    planId: (r.plan_id as string) ?? null,
    planTitle: (r.plan_title as string) ?? null,
    planItemId: (r.plan_item_id as string) ?? null,
    courseTitle: (r.course_title as string) ?? null,
    updatedAt: Number(r.updated_at),
    messageCount: Number(r.message_count ?? 0),
    summary: (r.summary as string) ?? null,
    resumeHint: (r.resume_hint as string) ?? null,
    focusConceptId: (r.focus_concept_id as string) ?? null,
    focusConceptName: (r.focus_concept_id as string)
      ? (getConcept(String(r.focus_concept_id))?.name ?? null)
      : null,
    reviewItemId: (r.review_item_id as string) ?? null,
    topics: getDb()
      .prepare(
        "select t.id, t.name from session_topics st join topics t on t.id = st.topic_id where st.session_id = ?",
      )
      .all(String(r.id)) as { id: string; name: string }[],
  }));
}

/** 把会话归到某个计划；null 表示移出计划（未归类） */
export function setSessionPlan(sessionId: string, planId: string | null) {
  const db = getDb();
  db.transaction(() => {
    db.prepare("update sessions set plan_id = ?, plan_item_id = null, updated_at = ? where id = ?").run(
      planId,
      now(),
      sessionId,
    );
    // 这段会话里学过的概念，复习条目归属要跟着重新推导
    db.prepare(
      `update review_items set plan_id = (
         select s.plan_id from evidence e join sessions s on s.id = e.session_id
          where e.concept_id = review_items.concept_id
            and e.voided = 0 and s.plan_id is not null
          order by e.created_at desc limit 1
       )
       where concept_id in (
         select distinct concept_id from evidence where session_id = ? and concept_id is not null
       )`,
    ).run(sessionId);
  })();
}

export function setSessionPlanItem(sessionId: string, planItemId: string | null) {
  getDb()
    .prepare("update sessions set plan_item_id = ?, updated_at = ? where id = ?")
    .run(planItemId, now(), sessionId);
}

export function touchSession(id: string, patch: { title?: string; resumeHint?: string | null; summary?: string | null} = {}) {
  const fields: string[] = ["updated_at = ?", "message_count = (select count(*) from messages where session_id = ?)"];
  const args: unknown[] = [now(), id];
  if (patch.title !== undefined) {
    fields.push("title = ?");
    args.push(patch.title);
  }
  if (patch.resumeHint !== undefined) {
    fields.push("resume_hint = ?");
    args.push(patch.resumeHint);
  }
  if (patch.summary !== undefined) {
    fields.push("summary = ?");
    args.push(patch.summary);
  }
  args.push(id);
  getDb().prepare(`update sessions set ${fields.join(", ")} where id = ?`).run(...args);
}

/**
 * 重算某个知识点的全部聚合值（证据被删除后必须调用）。
 *
 * 做法不是"减一"，而是按剩余证据从初始状态重放 BKT 与调度：
 * 只有重放才能保证 p_mastery / 状态 / 难度 / 遗忘次数与现存证据严格一致，
 * 否则档案里会出现"证据已删、掌握度还在"的幽灵记录。
 */
export function recomputeConceptAggregates(conceptId: string): ConceptDTO | null {
  const db = getDb();
  const concept = getConcept(conceptId);
  if (!concept) return null;

  const rows = db
    .prepare(
      `select e.correct, e.score, e.independent, e.hint_used, e.weight, e.created_at,
              a.duration_ms, x.type, x.difficulty, x.id as exercise_id
         from evidence e
         left join attempts a on a.id = e.ref_id
         left join exercises x on x.id = a.exercise_id
        where e.concept_id = ? and e.voided = 0
        order by e.created_at asc`,
    )
    .all(conceptId) as {
    correct: number | null;
    score: number | null;
    independent: number;
    hint_used: number;
    weight: number;
    created_at: number;
    duration_ms: number | null;
    type: string | null;
    difficulty: number | null;
    exercise_id: string | null;
  }[];

  let state: ConceptState = {
    status: "untouched",
    pMastery: 0.1,
    evidenceCount: 0,
    independentCorrect: 0,
    hintUses: 0,
    wrongStreak: 0,
    distinctExercises: 0,
    lastStudiedAt: null,
  };
  let sched: ScheduleResult = {
    stability: 0,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    intervalDays: 0,
    nextReviewAt: 0,
  };
  const seen = new Set<string>();
  let lastAt: number | null = null;

  rows.forEach((r, i) => {
    if (r.weight <= 0) return; // 看过解析的作答不计入，也不参与调度
    const t = r.created_at;
    // 用真实题目 id，保证"不同题目"的语义与实时路径一致
    const exerciseKey = r.exercise_id ?? `${conceptId}#${i}`;
    const correct = r.correct === 1;
    const usedHint = r.hint_used === 1;
    const independent = r.independent === 1;
    state = applyEvidence(
      state,
      {
        correct,
        score: r.score ?? 0,
        independent,
        hintUsed: usedHint,
        exerciseId: exerciseKey,
        type: (r.type as ExerciseType) ?? "single",
        difficulty: r.difficulty ?? 2,
      },
      t,
      seen,
    ).next;
    if (correct && independent && !usedHint) seen.add(exerciseKey);
    sched = scheduleNext(
      sched,
      reviewGradeFromAttempt({ correct, usedHint, durationMs: r.duration_ms }),
      t,
    );
    lastAt = t;
  });

  const nextReviewAt = state.evidenceCount > 0 ? sched.nextReviewAt : null;
  db.transaction(() => {
    db.prepare(
      `update concepts set status = ?, p_mastery = ?, evidence_count = ?, independent_correct = ?,
        hint_uses = ?, wrong_streak = ?, distinct_exercises = ?, stability = ?, difficulty = ?,
        reps = ?, lapses = ?, next_review_at = ?, last_studied_at = ?, updated_at = ? where id = ?`,
    ).run(
      state.status,
      state.pMastery,
      state.evidenceCount,
      state.independentCorrect,
      state.hintUses,
      state.wrongStreak,
      state.distinctExercises,
      sched.stability,
      sched.difficulty,
      sched.reps,
      sched.lapses,
      nextReviewAt,
      lastAt,
      now(),
      conceptId,
    );
    // 依据已不存在的复习条目必须清掉
    db.prepare("delete from review_items where concept_id = ? and status = 'open'").run(conceptId);
    if (state.status !== concept.status) {
      db.prepare(
        "insert into concept_events (id, concept_id, from_status, to_status, from_p, to_p, reason, actor, created_at) values (?, ?, ?, ?, ?, ?, ?, 'system', ?)",
      ).run(
        uid("ce_"),
        conceptId,
        concept.status,
        state.status,
        concept.pMastery,
        state.pMastery,
        "证据被删除后按剩余证据重算",
        now(),
      );
    }
    db.prepare(
      "insert into mastery_snapshots (id, concept_id, p_mastery, status, recorded_at) values (?, ?, ?, ?, ?)",
    ).run(uid("ms_"), conceptId, state.pMastery, state.status, now());
  })();

  return getConcept(conceptId);
}

/** 删除会话。默认保留长期学习证据（证据是独立实体），可选择连带清理本会话产生的证据。 */
export function deleteSession(id: string, opts: { withEvidence?: boolean } = {}) {
  const db = getDb();
  let affected: string[] = [];
  db.transaction(() => {
    if (opts.withEvidence) {
      // 先记下受影响的知识点，删除后按剩余证据重算
      affected = (
        db
          .prepare(
            "select distinct concept_id from evidence where session_id = ? and concept_id is not null",
          )
          .all(id) as { concept_id: string }[]
      ).map((r) => r.concept_id);
      // 只删除"本会话产生的"证据、作答与题目；其他会话的数据与知识点本身保留
      db.prepare("delete from attempts where session_id = ?").run(id);
      db.prepare("delete from exercises where session_id = ?").run(id);
      db.prepare("delete from evidence where session_id = ?").run(id);
    }
    db.prepare("delete from sessions where id = ?").run(id);
  })();
  // 事务外重算（内部自带事务），保证聚合与现存证据一致
  for (const cid of affected) recomputeConceptAggregates(cid);
}

export function linkSessionTopic(sessionId: string, topicId: string, confidence = 0.6) {
  getDb()
    .prepare(
      "insert into session_topics (session_id, topic_id, confidence) values (?, ?, ?) on conflict(session_id, topic_id) do update set confidence = max(confidence, excluded.confidence)",
    )
    .run(sessionId, topicId, confidence);
}

// ────────────────────────────── messages ──────────────────────────────
export function addMessage(opts: {
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts?: MessagePart[];
  status?: "streaming" | "done" | "error";
  model?: string;
  error?: string;
}): MessageDTO {
  const db = getDb();
  const seq = Number(
    (db.prepare("select coalesce(max(seq), 0) + 1 as s from messages where session_id = ?").get(
      opts.sessionId,
    ) as { s: number }).s,
  );
  const id = uid("m_");
  db.prepare(
    "insert into messages (id, session_id, role, content, parts, status, model, error, seq, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    opts.sessionId,
    opts.role,
    opts.content ?? "",
    JSON.stringify(opts.parts ?? []),
    opts.status ?? "done",
    opts.model ?? null,
    opts.error ?? null,
    seq,
    now(),
  );
  return {
    id,
    sessionId: opts.sessionId,
    role: opts.role,
    content: opts.content ?? "",
    parts: opts.parts ?? [],
    status: opts.status ?? "done",
    error: opts.error ?? null,
    createdAt: now(),
    seq,
  };
}

export function updateMessage(
  id: string,
  patch: {
    content?: string;
    parts?: MessagePart[];
    status?: string;
    error?: string | null;
    model?: string | null;
  },
) {
  const fields: string[] = [];
  const args: unknown[] = [];
  if (patch.content !== undefined) {
    fields.push("content = ?");
    args.push(patch.content);
  }
  if (patch.parts !== undefined) {
    fields.push("parts = ?");
    args.push(JSON.stringify(patch.parts));
  }
  if (patch.status !== undefined) {
    fields.push("status = ?");
    args.push(patch.status);
  }
  if (patch.error !== undefined) {
    fields.push("error = ?");
    args.push(patch.error);
  }
  if (patch.model !== undefined) {
    fields.push("model = ?");
    args.push(patch.model);
  }
  if (!fields.length) return;
  args.push(id);
  getDb().prepare(`update messages set ${fields.join(", ")} where id = ?`).run(...args);
}

/** 保存一条回答引用的来源（先删后插，支持重新生成时覆盖） */
export function saveMessageSources(messageId: string, sources: SourceDTO[]) {
  const db = getDb();
  db.transaction(() => {
    db.prepare("delete from message_sources where message_id = ?").run(messageId);
    const stmt = db.prepare(
      `insert into message_sources (id, message_id, ordinal, kind, ref_id, title, url, domain,
        published_at, retrieved_at, snippet, stale, meta, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    sources.forEach((s, i) => {
      stmt.run(
        uid("src_"),
        messageId,
        i,
        s.kind,
        s.kind === "material" ? (s.meta?.chunkId as string | undefined) ?? null : (s.url ?? null),
        s.title,
        s.url ?? null,
        s.domain ?? null,
        s.publishedAt ?? null,
        s.retrievedAt,
        s.snippet ? s.snippet.slice(0, 600) : null,
        s.stale ? 1 : 0,
        s.meta ? JSON.stringify(s.meta) : null,
        now(),
      );
    });
  })();
}

/** 一次性取多条消息的来源，避免逐条查询 */
export function listSourcesByMessages(messageIds: string[]): Record<string, SourceDTO[]> {
  if (!messageIds.length) return {};
  const db = getDb();
  const holes = messageIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `select * from message_sources where message_id in (${holes}) order by message_id, ordinal asc`,
    )
    .all(...messageIds) as Record<string, unknown>[];
  const out: Record<string, SourceDTO[]> = {};
  for (const r of rows) {
    const mid = String(r.message_id);
    const prefix = r.kind === "web" ? "w" : "m";
    const src: SourceDTO = {
      id: `${prefix}${Number(r.ordinal) + 1}`,
      kind: r.kind as SourceDTO["kind"],
      title: String(r.title ?? ""),
      url: (r.url as string) ?? null,
      domain: (r.domain as string) ?? null,
      publishedAt: r.published_at == null ? null : Number(r.published_at),
      retrievedAt: Number(r.retrieved_at),
      snippet: (r.snippet as string) ?? null,
      stale: Number(r.stale) === 1,
      meta: jsonParse<Record<string, unknown> | null>(r.meta, null),
    };
    (out[mid] ??= []).push(src);
  }
  return out;
}

/** 按 chunk id 取回材料片段及其所属材料（来源卡片跳转用） */
export function getMaterialChunk(chunkId: string) {
  const row = getDb()
    .prepare(
      `select c.id, c.text, c.page, c.heading, c.material_id, m.name as material
         from material_chunks c join materials m on m.id = c.material_id
        where c.id = ?`,
    )
    .get(chunkId) as
    | { id: string; text: string; page: number | null; heading: string | null; material_id: string; material: string }
    | undefined;
  return row ?? null;
}

/**
 * 读取会话消息，按 seq 升序返回，但取的是**最新** limit 条。
 *
 * 旧实现是 `order by seq asc limit 200`，取到的是最旧的 200 条：
 * 会话超过 200 条后，新消息在界面上"消失"，模型历史也永远停在第 187–200 条。
 * beforeSeq 用于向前翻页（取 seq 小于它的一批）。
 */
export function listMessages(
  sessionId: string,
  limit = 200,
  opts: { beforeSeq?: number } = {},
): MessageDTO[] {
  const rows = (
    opts.beforeSeq == null
      ? getDb()
          .prepare("select * from messages where session_id = ? order by seq desc limit ?")
          .all(sessionId, limit)
      : getDb()
          .prepare("select * from messages where session_id = ? and seq < ? order by seq desc limit ?")
          .all(sessionId, opts.beforeSeq, limit)
  ) as Record<string, unknown>[];
  rows.reverse();
  const sources = listSourcesByMessages(rows.map((r) => String(r.id)));
  return rows.map((r) => ({
    id: String(r.id),
    sessionId: String(r.session_id),
    role: r.role as MessageDTO["role"],
    content: String(r.content ?? ""),
    parts: jsonParse<MessagePart[]>(r.parts, []),
    status: (r.status as MessageDTO["status"]) ?? "done",
    error: (r.error as string) ?? null,
    model: (r.model as string) ?? null,
    sources: sources[String(r.id)] ?? [],
    createdAt: Number(r.created_at),
    seq: Number(r.seq),
  }));
}

// ────────────────────────────── blocks ──────────────────────────────
export function createBlock(opts: {
  sessionId: string;
  messageId?: string | null;
  kind: BlockKind;
  title?: string;
  payload: unknown;
  state?: unknown;
}): BlockDTO {
  const id = uid("b_");
  const t = now();
  getDb()
    .prepare(
      "insert into blocks (id, session_id, message_id, kind, title, payload, state, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)",
    )
    .run(
      id,
      opts.sessionId,
      opts.messageId ?? null,
      opts.kind,
      opts.title ?? null,
      JSON.stringify(opts.payload),
      JSON.stringify(opts.state ?? {}),
      t,
      t,
    );
  return getBlock(id)!;
}

export function getBlock(id: string): BlockDTO | null {
  const r = getDb().prepare("select * from blocks where id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    messageId: (r.message_id as string) ?? null,
    kind: r.kind as BlockKind,
    title: (r.title as string) ?? null,
    payload: jsonParse<Record<string, unknown>>(r.payload, {}),
    state: jsonParse<Record<string, unknown>>(r.state, {}),
    status: (r.status as BlockDTO["status"]) ?? "ready",
    createdAt: Number(r.created_at),
  };
}

export function updateBlockState(id: string, state: Record<string, unknown>) {
  getDb()
    .prepare("update blocks set state = ?, updated_at = ? where id = ?")
    .run(JSON.stringify(state), now(), id);
}

export function updateBlockPayload(id: string, payload: Record<string, unknown>) {
  getDb()
    .prepare("update blocks set payload = ?, updated_at = ? where id = ?")
    .run(JSON.stringify(payload), now(), id);
}

export function listBlocks(sessionId: string): BlockDTO[] {
  const rows = getDb()
    .prepare("select id from blocks where session_id = ? order by created_at asc")
    .all(sessionId) as { id: string }[];
  return rows.map((r) => getBlock(r.id)!).filter(Boolean);
}

// ────────────────────────────── topics / concepts ──────────────────────────────
export function ensureTopic(name: string, description?: string) {
  const db = getDb();
  const key = normalizeText(name);
  const existing = db
    .prepare("select * from topics where canonical_key = ?")
    .get(key) as Record<string, unknown> | undefined;
  if (existing) return { id: String(existing.id), name: String(existing.name) };
  const id = uid("t_");
  const t = now();
  db.prepare(
    "insert into topics (id, name, description, canonical_key, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
  ).run(id, name, description ?? null, key, t, t);
  return { id, name };
}

export function ensureConcept(opts: {
  topicId: string;
  name: string;
  definition?: string;
  /** 唯一所属课程；已有归属时不会被另一门课程悄悄抢走 */
  courseId?: string | null;
  /** 由讲解/出题登记：标记为已接触，避免被当成“从未学习”的空壳清理 */
  introduced?: boolean;
}): {
  id: string;
  created: boolean;
  topicId: string;
  courseId: string | null;
  courseConflict: boolean;
} {
  const db = getDb();
  const key = normalizeText(opts.name);
  // 全局按 canonical_key 去重：同一个概念换一个主题再出现时，复用原档案，
  // 避免「机会成本」在「经济学基础」和「未分类」各建一份、掌握度分裂。
  const existing = db
    .prepare(
      "select id, topic_id, course_id from concepts where canonical_key = ? order by evidence_count desc, created_at asc limit 1",
    )
    .get(key) as { id: string; topic_id: string; course_id: string | null } | undefined;
  if (existing) {
    let courseConflict = false;
    if (opts.courseId) {
      if (!existing.course_id) {
        db.prepare("update concepts set course_id = ?, updated_at = ? where id = ?").run(
          opts.courseId,
          now(),
          existing.id,
        );
        existing.course_id = opts.courseId;
      } else if (existing.course_id !== opts.courseId) {
        courseConflict = true;
      }
    }
    if (opts.definition) {
      db.prepare("update concepts set definition = coalesce(nullif(definition,''), ?), updated_at = ? where id = ?").run(
        opts.definition,
        now(),
        existing.id,
      );
    }
    if (opts.introduced) {
      db.prepare(
        "update concepts set introduced_at = coalesce(introduced_at, ?), updated_at = ? where id = ?",
      ).run(now(), now(), existing.id);
    }
    return {
      id: existing.id,
      created: false,
      topicId: existing.topic_id,
      courseId: existing.course_id,
      courseConflict,
    };
  }
  const id = uid("c_");
  const t = now();
  db.prepare(
    "insert into concepts (id, topic_id, course_id, name, definition, canonical_key, introduced_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    opts.topicId,
    opts.courseId ?? null,
    opts.name,
    opts.definition ?? null,
    key,
    opts.introduced ? t : null,
    t,
    t,
  );
  return {
    id,
    created: true,
    topicId: opts.topicId,
    courseId: opts.courseId ?? null,
    courseConflict: false,
  };
}

export function addConceptEdge(fromId: string, toId: string, kind: "prereq" | "related" = "prereq") {
  if (fromId === toId) return;
  getDb()
    .prepare(
      "insert into concept_edges (from_id, to_id, kind, created_at) values (?, ?, ?, ?) on conflict do nothing",
    )
    .run(fromId, toId, kind, now());
}

function conceptRowToDTO(r: Record<string, unknown>): ConceptDTO {
  const prereqs = getDb()
    .prepare(
      "select c.id, c.name, c.status from concept_edges e join concepts c on c.id = e.from_id where e.to_id = ?",
    )
    .all(String(r.id)) as { id: string; name: string; status: ConceptStatus }[];
  const introducedAt = (r.introduced_at as number) ?? null;
  const concept = {
    id: String(r.id),
    topicId: String(r.topic_id),
    topicName: String(r.topic_name ?? ""),
    name: String(r.name),
    definition: (r.definition as string) ?? null,
    status: r.status as ConceptStatus,
    pMastery: Number(r.p_mastery),
    evidenceCount: Number(r.evidence_count),
    independentCorrect: Number(r.independent_correct),
    hintUses: Number(r.hint_uses),
    wrongStreak: Number(r.wrong_streak),
    distinctExercises: Number(r.distinct_exercises),
    stability: Number(r.stability),
    difficulty: Number(r.difficulty ?? 5),
    reps: Number(r.reps ?? 0),
    lapses: Number(r.lapses ?? 0),
    nextReviewAt: (r.next_review_at as number) ?? null,
    lastStudiedAt: (r.last_studied_at as number) ?? null,
    introducedAt,
  } satisfies ConceptLike & Omit<ConceptDTO, "displayStatus" | "courseId" | "courseTitle" | "planId" | "planTitle" | "prerequisites">;
  return {
    ...concept,
    displayStatus: conceptDisplayStatus(concept),
    courseId: (r.course_id as string) ?? null,
    courseTitle: (r.course_title as string) ?? null,
    planId: (r.plan_id as string) ?? null,
    planTitle: (r.plan_title as string) ?? null,
    prerequisites: prereqs,
  };
}

export function getConcept(id: string): ConceptDTO | null {
  const r = getDb()
    .prepare(
      `select c.*, t.name as topic_name, pi.title as course_title, p.id as plan_id, p.title as plan_title
         from concepts c
         join topics t on t.id = c.topic_id
         left join plan_items pi on pi.id = c.course_id
         left join plans p on p.id = pi.plan_id
        where c.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  return r ? conceptRowToDTO(r) : null;
}

export function findConceptByName(name: string, topicId?: string): ConceptDTO | null {  const key = normalizeText(name);
  const db = getDb();
  const base = `select c.*, t.name as topic_name, pi.title as course_title, p.id as plan_id, p.title as plan_title
    from concepts c
    join topics t on t.id = c.topic_id
    left join plan_items pi on pi.id = c.course_id
    left join plans p on p.id = pi.plan_id`;
  const r = (topicId
    ? db
        .prepare(`${base} where t.id = ? and c.canonical_key = ?`)
        .get(topicId, key)
    : db
        .prepare(`${base} where c.canonical_key = ? order by c.evidence_count desc, c.created_at asc limit 1`)
        .get(key)) as Record<string, unknown> | undefined;
  return r ? conceptRowToDTO(r) : null;
}

export interface DuplicateConceptGroup {
  key: string;
  count: number;
  concepts: { id: string; name: string; topicName: string; evidenceCount: number }[];
}

/** 同名（canonical_key 相同）但分散在不同主题下的知识点 */
export function listDuplicateConceptGroups(): DuplicateConceptGroup[] {
  const db = getDb();
  const keys = db
    .prepare(
      "select canonical_key as key, count(*) as n from concepts group by canonical_key having count(*) > 1 order by n desc",
    )
    .all() as { key: string; n: number }[];
  return keys.map(({ key, n }) => {
    const rows = db
      .prepare(
        `select c.id, c.name, t.name as topic_name, c.evidence_count
           from concepts c join topics t on t.id = c.topic_id
          where c.canonical_key = ?
          order by c.evidence_count desc, c.created_at asc`,
      )
      .all(key) as { id: string; name: string; topic_name: string; evidence_count: number }[];
    return {
      key,
      count: n,
      concepts: rows.map((c) => ({
        id: c.id,
        name: c.name,
        topicName: c.topic_name,
        evidenceCount: Number(c.evidence_count),
      })),
    };
  });
}

/**
 * 把若干知识点合并到 survivor：转移证据/作答/题目/复习条目/计划步骤/会话聚焦，
 * 前置关系去重后一并转移，然后按合并后的全部证据重算。
 * 只应在用户明确确认后调用。
 */
export function mergeConceptsInto(survivorId: string, duplicateIds: string[]): { merged: number } {
  const db = getDb();
  if (!getConcept(survivorId)) return { merged: 0 };
  const ids = [...new Set(duplicateIds)].filter((id) => id !== survivorId);
  let merged = 0;

  db.transaction(() => {
    for (const dupId of ids) {
      const dup = db.prepare("select id, definition, course_id from concepts where id = ?").get(dupId) as
        | { id: string; definition: string | null; course_id: string | null }
        | undefined;
      if (!dup) continue;

      // 保留 survivor 的定义；它没有定义时接住 duplicate 的定义
      if (dup.definition) {
        db.prepare(
          "update concepts set definition = coalesce(nullif(definition, ''), ?), updated_at = ? where id = ?",
        ).run(dup.definition, now(), survivorId);
      }
      // survivor 尚未归属课程时，继承 duplicate 的唯一课程归属
      if (dup.course_id) {
        db.prepare(
          "update concepts set course_id = coalesce(course_id, ?), updated_at = ? where id = ?",
        ).run(dup.course_id, now(), survivorId);
      }

      // 未处理的复习条目丢弃，已处理的历史保留冷却
      db.prepare("delete from review_items where status = 'open' and concept_id in (?, ?)").run(
        survivorId,
        dupId,
      );
      for (const sql of [
        "update review_items set concept_id = ? where concept_id = ?",
        "update evidence set concept_id = ? where concept_id = ?",
        "update exercises set concept_id = ? where concept_id = ?",
        "update attempts set concept_id = ? where concept_id = ?",
        "update plan_items set concept_id = ? where concept_id = ?",
        "update sessions set focus_concept_id = ? where focus_concept_id = ?",
      ]) {
        db.prepare(sql).run(survivorId, dupId);
      }

      // 前置关系去重后转移，避免复合主键冲突
      const edges = db
        .prepare("select from_id, to_id, kind, created_at from concept_edges where from_id = ? or to_id = ?")
        .all(dupId, dupId) as { from_id: string; to_id: string; kind: string; created_at: number }[];
      for (const e of edges) {
        const from = e.from_id === dupId ? survivorId : e.from_id;
        const to = e.to_id === dupId ? survivorId : e.to_id;
        if (from === to) continue;
        db.prepare(
          "insert or ignore into concept_edges (from_id, to_id, kind, created_at) values (?, ?, ?, ?)",
        ).run(from, to, e.kind, e.created_at);
      }
      db.prepare("delete from concept_edges where from_id = ? or to_id = ?").run(dupId, dupId);

      // 旧概念的状态事件/快照随概念级联删除，合并后按证据重算
      db.prepare("delete from concepts where id = ?").run(dupId);
      merged++;
    }
  })();

  if (merged) recomputeConceptAggregates(survivorId);
  return { merged };
}

/** 合并同名旧概念：每组保留证据最多的一个 */
export function mergeDuplicateConcepts(): { groups: number; merged: number } {
  let groups = 0;
  let merged = 0;
  for (const group of listDuplicateConceptGroups()) {
    if (group.concepts.length < 2) continue;
    const survivor = group.concepts[0].id;
    const result = mergeConceptsInto(
      survivor,
      group.concepts.slice(1).map((c) => c.id),
    );
    if (result.merged > 0) {
      groups++;
      merged += result.merged;
    }
  }
  return { groups, merged };
}

export function listConcepts(opts: { topicId?: string; limit?: number } = {}): ConceptDTO[] {
  const base = `select c.*, t.name as topic_name, pi.title as course_title, p.id as plan_id, p.title as plan_title
      from concepts c
      join topics t on t.id = c.topic_id
      left join plan_items pi on pi.id = c.course_id
      left join plans p on p.id = pi.plan_id`;
  const rows = (opts.topicId
    ? getDb()
        .prepare(`${base} where c.topic_id = ? order by c.updated_at desc`)
        .all(opts.topicId)
    : getDb()
        .prepare(`${base} order by c.updated_at desc limit ?`)
        .all(opts.limit ?? 200)) as Record<string, unknown>[];
  return rows.map(conceptRowToDTO);
}

export function listTopics() {
  return getDb()
    .prepare(
      "select t.id, t.name, t.description, count(c.id) as concept_count, sum(case when c.status in ('initial','mastered') then 1 else 0 end) as solid_count from topics t join concepts c on c.topic_id = t.id where t.archived = 0 group by t.id order by t.updated_at desc",
    )
    .all() as { id: string; name: string; description: string | null; concept_count: number; solid_count: number }[];
}

/**
 * 删除一个知识点。
 * 会一并删除：证据、掌握度快照、状态变更记录、复习条目、前置关系（FK 级联）。
 * 不会删除：会话与消息；历史题目/作答仅解除与知识点的关联，保留在会话里。
 */
export function countPlanItemsForConcept(conceptId: string): number {
  const r = getDb()
    .prepare(
      `select
         (select count(*) from concepts where id = ? and course_id is not null) +
         (select count(*) from plan_items where concept_id = ?) as n`,
    )
    .get(conceptId, conceptId) as { n: number };
  return Number(r.n);
}

export function deleteConcept(id: string): boolean {
  const db = getDb();
  const row = db.prepare("select id, topic_id, course_id from concepts where id = ?").get(id) as
    | { id: string; topic_id: string; course_id: string | null }
    | undefined;
  if (!row) return false;
  // 被课程引用的知识点不能直接删除；先从课程移除或合并，否则课程结构会指向不存在的数据
  if (row.course_id || countPlanItemsForConcept(id) > 0) return false;
  db.transaction(() => {
    db.prepare("update exercises set concept_id = null where concept_id = ?").run(id);
    db.prepare("update attempts set concept_id = null where concept_id = ?").run(id);
    db.prepare("delete from concepts where id = ?").run(id);
    cleanupTopicIfEmpty(row.topic_id);
  })();
  return true;
}

/** 批量清理"从未归属课程、也从未被学过"的知识点：通常是旧版登记留下的空壳 */
export function deleteEmptyConcepts(): number {
  const db = getDb();
  const rows = db
    .prepare(
      `select id, topic_id from concepts
        where evidence_count = 0
          and introduced_at is null
          and course_id is null
          and id not in (select concept_id from attempts where concept_id is not null)
          and id not in (select concept_id from plan_items where concept_id is not null)`,
    )
    .all() as { id: string; topic_id: string }[];
  if (!rows.length) return 0;
  db.transaction(() => {
    const unlinkEx = db.prepare("update exercises set concept_id = null where concept_id = ?");
    const unlinkAt = db.prepare("update attempts set concept_id = null where concept_id = ?");
    const del = db.prepare("delete from concepts where id = ?");
    for (const r of rows) {
      unlinkEx.run(r.id);
      unlinkAt.run(r.id);
      del.run(r.id);
      cleanupTopicIfEmpty(r.topic_id);
    }
  })();
  return rows.length;
}

function cleanupTopicIfEmpty(topicId: string) {
  const db = getDb();
  const left = db.prepare("select count(*) as n from concepts where topic_id = ?").get(topicId) as {
    n: number;
  };
  if (left.n === 0) db.prepare("delete from topics where id = ?").run(topicId);
}

export function countEmptyConcepts(): number {
  const r = getDb()
    .prepare(
      `select count(*) as n from concepts
        where evidence_count = 0
          and introduced_at is null
          and course_id is null
          and id not in (select concept_id from attempts where concept_id is not null)
          and id not in (select concept_id from plan_items where concept_id is not null)`,
    )
    .get() as { n: number };
  return r.n;
}

export function listWeakConcepts(limit = 5): ConceptDTO[] {
  return listConcepts({ limit: 500 })
    .filter((c) => c.status === "needs_work" || (c.status === "learning" && c.wrongStreak > 0))
    .sort((a, b) => b.wrongStreak - a.wrongStreak || a.pMastery - b.pMastery)
    .slice(0, limit);
}

export function updateConceptStatusManually(conceptId: string, status: ConceptStatus, actor = "user") {
  const db = getDb();
  const prev = getConcept(conceptId);
  if (!prev) return null;
  db.prepare("update concepts set status = ?, updated_at = ? where id = ?").run(status, now(), conceptId);
  db.prepare(
    "insert into concept_events (id, concept_id, from_status, to_status, from_p, to_p, reason, actor, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    uid("ce_"),
    conceptId,
    prev.status,
    status,
    prev.pMastery,
    prev.pMastery,
    "用户手动更正掌握状态",
    actor,
    now(),
  );
  return getConcept(conceptId);
}

/** 某知识点的证据列表（含已作废的，用于审计展示） */
export function listConceptEvidence(conceptId: string): EvidenceDTO[] {
  const rows = getDb()
    .prepare(
      `select e.*, x.type as exercise_type, x.prompt as prompt
         from evidence e
         left join attempts a on a.id = e.ref_id
         left join exercises x on x.id = a.exercise_id
        where e.concept_id = ?
        order by e.created_at desc
        limit 60`,
    )
    .all(conceptId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    correct: r.correct === null ? null : Number(r.correct) === 1,
    score: r.score === null ? null : Number(r.score),
    independent: Number(r.independent) === 1,
    hintUsed: Number(r.hint_used) === 1,
    weight: Number(r.weight ?? 1),
    voided: Number(r.voided) === 1,
    voidReason: (r.void_reason as string) ?? null,
    note: (r.note as string) ?? null,
    createdAt: Number(r.created_at),
    exerciseType: (r.exercise_type as ExerciseType) ?? null,
    prompt: (r.prompt as string) ?? null,
  }));
}

/**
 * 软作废一条证据（A3）。
 * 不物理删除：审计与导出仍能看到它，但它不再参与掌握度与复习调度。
 */
export function voidEvidence(id: string, reason: string): { conceptId: string } | null {
  const db = getDb();
  const row = db.prepare("select concept_id, voided from evidence where id = ?").get(id) as
    | { concept_id: string; voided: number }
    | undefined;
  if (!row) return null;
  if (Number(row.voided) === 1) return { conceptId: row.concept_id };

  db.transaction(() => {
    db.prepare("update evidence set voided = 1, void_reason = ?, voided_at = ? where id = ?").run(
      reason.slice(0, 200),
      now(),
      id,
    );
    db.prepare(
      "insert into concept_events (id, concept_id, from_status, to_status, from_p, to_p, reason, actor, created_at) values (?, ?, null, null, null, null, ?, 'user', ?)",
    ).run(uid("ce_"), row.concept_id, `用户作废一条作答证据：${reason.slice(0, 80)}`, now());
  })();

  recomputeConceptAggregates(row.concept_id);
  return { conceptId: row.concept_id };
}

/** "这题有问题"：作废这道题产生的全部证据 */
export function voidEvidenceByExercise(exerciseId: string, reason: string): string[] {
  const rows = getDb()
    .prepare(
      `select e.id, e.concept_id from evidence e
        join attempts a on a.id = e.ref_id
       where a.exercise_id = ? and e.voided = 0`,
    )
    .all(exerciseId) as { id: string; concept_id: string }[];
  const concepts = new Set<string>();
  for (const r of rows) {
    const res = voidEvidence(r.id, reason);
    if (res) concepts.add(res.conceptId);
  }
  return [...concepts];
}

export function addExerciseFeedback(opts: {
  exerciseId: string;
  sessionId?: string | null;
  vote: "easy" | "hard" | "broken";
  note?: string | null;
}) {
  getDb()
    .prepare(
      "insert into exercise_feedback (id, exercise_id, session_id, vote, note, created_at) values (?, ?, ?, ?, ?, ?)",
    )
    .run(uid("fb_"), opts.exerciseId, opts.sessionId ?? null, opts.vote, opts.note ?? null, now());
}

/** 最近的题目反馈，用于调整下一题的难度与题型 */
export function recentExerciseFeedback(limit = 6) {
  return getDb()
    .prepare(
      `select f.vote, f.note, f.created_at, x.concept_id, x.type
         from exercise_feedback f left join exercises x on x.id = f.exercise_id
        order by f.created_at desc limit ?`,
    )
    .all(limit) as {
    vote: string;
    note: string | null;
    created_at: number;
    concept_id: string | null;
    type: string | null;
  }[];
}

/** 复习会话里出现有效作答后，把对应的复习条目收尾 */
export function completeReviewForSession(sessionId: string): boolean {
  const db = getDb();
  const s = db.prepare("select review_item_id from sessions where id = ?").get(sessionId) as
    | { review_item_id: string | null }
    | undefined;
  if (!s?.review_item_id) return false;
  const res = db
    .prepare("update review_items set status = 'done', acted_at = ? where id = ? and status = 'open'")
    .run(now(), s.review_item_id);
  return res.changes > 0;
}

/** 错因画像：Top 错因 + 最近几次错的作答内容 */
export function conceptErrorProfile(conceptId: string) {
  const db = getDb();
  const top = db
    .prepare(
      `select error_type, count(*) as n from attempts
        where concept_id = ? and is_correct = 0 and error_type is not null
        group by error_type order by n desc limit 3`,
    )
    .all(conceptId) as { error_type: string; n: number }[];
  const recent = db
    .prepare(
      `select a.error_type, a.user_answer, a.created_at, e.prompt, e.type, e.options
         from attempts a join exercises e on e.id = a.exercise_id
        where a.concept_id = ? and a.is_correct = 0
        order by a.created_at desc limit 3`,
    )
    .all(conceptId) as {
    error_type: string | null;
    user_answer: string;
    created_at: number;
    prompt: string;
    type: string;
    options: string | null;
  }[];

  const describe = (raw: string, type: string, optionsRaw: string | null) => {
    const opts = jsonParse<string[]>(optionsRaw, []);
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      return raw.slice(0, 80);
    }
    const label = (i: number) =>
      opts[i] ? `${String.fromCharCode(65 + i)}. ${opts[i]}` : `选项 ${i}`;
    if (type === "single" && Number.isFinite(Number(v))) return label(Number(v));
    if (type === "multi" && Array.isArray(v)) return v.map((x) => label(Number(x))).join("、");
    if (type === "judge") return v === true ? "正确" : v === false ? "错误" : String(v);
    if (typeof v === "string") return v.slice(0, 80);
    if (Array.isArray(v)) return v.map(String).join(" / ").slice(0, 80);
    return JSON.stringify(v).slice(0, 80);
  };
  return {
    top,
    recent: recent.map((r) => ({
      errorType: r.error_type,
      answer: describe(r.user_answer, r.type, r.options),
      prompt: r.prompt.slice(0, 80),
      type: r.type,
      createdAt: r.created_at,
    })),
  };
}

export function getConceptHistory(conceptId: string) {
  return {
    events: getDb()
      .prepare("select * from concept_events where concept_id = ? order by created_at desc limit 30")
      .all(conceptId) as Record<string, unknown>[],
    snapshots: getDb()
      .prepare("select p_mastery, status, recorded_at from mastery_snapshots where concept_id = ? order by recorded_at asc limit 100")
      .all(conceptId) as { p_mastery: number; status: string; recorded_at: number }[],
    evidence: getDb()
      .prepare("select * from evidence where concept_id = ? order by created_at desc limit 30")
      .all(conceptId) as Record<string, unknown>[],
    attempts: getDb()
      .prepare(
        "select a.*, e.type, e.prompt from attempts a join exercises e on e.id = a.exercise_id where a.concept_id = ? order by a.created_at desc limit 30",
      )
      .all(conceptId) as Record<string, unknown>[],
  };
}

/**
 * 写入作答证据 → 更新 BKT → 更新复习调度 → 记录审计。
 * 这是"作答"与"掌握度"之间唯一的通道。
 */
export function recordAttemptEvidence(args: {
  conceptId: string;
  sessionId: string;
  exerciseId: string;
  type: ExerciseType;
  correct: boolean;
  score: number;
  usedHint: boolean;
  independent: boolean;
  difficulty: number;
  attemptId: string;
  durationMs?: number | null;
}) {
  const db = getDb();
  const concept = getConcept(args.conceptId);
  if (!concept) return null;

  const seen = new Set(
    (db
      .prepare("select distinct exercise_id from attempts where concept_id = ? and independent = 1 and is_correct = 1")
      .all(args.conceptId) as { exercise_id: string }[]).map((r) => r.exercise_id),
  );

  const prevState: ConceptState = {
    status: concept.status,
    pMastery: concept.pMastery,
    evidenceCount: concept.evidenceCount,
    independentCorrect: concept.independentCorrect,
    hintUses: concept.hintUses,
    wrongStreak: concept.wrongStreak,
    distinctExercises: concept.distinctExercises,
    lastStudiedAt: concept.lastStudiedAt ?? null,
  };

  const outcome = applyEvidence(
    prevState,
    {
      correct: args.correct,
      score: args.score,
      independent: args.independent,
      hintUsed: args.usedHint,
      exerciseId: args.exerciseId,
      type: args.type,
      difficulty: args.difficulty,
    },
    now(),
    seen,
  );

  const grade = reviewGradeFromAttempt({
    correct: args.correct,
    usedHint: args.usedHint,
    durationMs: args.durationMs,
  });
  // 看过解析的作答只留档，不进入掌握度，也不推进复习调度
  const counted = outcome.countedForMastery;
  const sched = counted
    ? scheduleNext(
        {
          // 必须沿用该知识点当前状态，否则难度永远回到 5、遗忘次数每轮清零
          stability: concept.stability,
          difficulty: concept.difficulty ?? 5,
          reps: concept.reps ?? concept.evidenceCount,
          lapses: concept.lapses ?? 0,
        },
        grade,
        now(),
      )
    : null;

  db.transaction(() => {
    db.prepare(
      "insert into evidence (id, session_id, concept_id, kind, ref_id, correct, score, independent, hint_used, weight, note, created_at) values (?, ?, ?, 'attempt', ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      uid("ev_"),
      args.sessionId,
      args.conceptId,
      args.attemptId,
      args.correct ? 1 : 0,
      args.score,
      args.independent ? 1 : 0,
      args.usedHint ? 1 : 0,
      counted ? 1 : 0,
      outcome.reason,
      now(),
    );

    if (!counted || !sched) return;

    db.prepare(
      "update concepts set status = ?, p_mastery = ?, evidence_count = ?, independent_correct = ?, hint_uses = ?, wrong_streak = ?, distinct_exercises = ?, stability = ?, difficulty = ?, reps = ?, lapses = ?, next_review_at = ?, last_studied_at = ?, updated_at = ? where id = ?",
    ).run(
      outcome.next.status,
      outcome.next.pMastery,
      outcome.next.evidenceCount,
      outcome.next.independentCorrect,
      outcome.next.hintUses,
      outcome.next.wrongStreak,
      outcome.next.distinctExercises,
      sched.stability,
      sched.difficulty,
      sched.reps,
      sched.lapses,
      sched.nextReviewAt,
      now(),
      now(),
      args.conceptId,
    );

    db.prepare(
      "insert into mastery_snapshots (id, concept_id, p_mastery, status, recorded_at) values (?, ?, ?, ?, ?)",
    ).run(uid("ms_"), args.conceptId, outcome.next.pMastery, outcome.next.status, now());

    if (outcome.changed) {
      db.prepare(
        "insert into concept_events (id, concept_id, from_status, to_status, from_p, to_p, reason, actor, created_at) values (?, ?, ?, ?, ?, ?, ?, 'system', ?)",
      ).run(
        uid("ce_"),
        args.conceptId,
        concept.status,
        outcome.next.status,
        concept.pMastery,
        outcome.next.pMastery,
        outcome.reason,
        now(),
      );
    }
    // 保留当前复习会话绑定的条目：答错时要能继续，答对时由 completeReviewForSession 收尾
    db.prepare(
      `delete from review_items
        where concept_id = ? and status = 'open'
          and id not in (select review_item_id from sessions where id = ? and review_item_id is not null)`,
    ).run(args.conceptId, args.sessionId);
  })();

  return { outcome, schedule: sched };
}

// ────────────────────────────── exercises / attempts ──────────────────────────────
export function createExercise(opts: {
  sessionId: string;
  blockId?: string | null;
  conceptId?: string | null;
  type: ExerciseType;
  prompt: string;
  options?: string[];
  answer: unknown;
  rubric?: unknown;
  explanation?: string | null;
  difficulty?: number;
  verification?: "passed" | "ambiguous" | "unverified";
  verificationNote?: string | null;
}): ExercisePublic {
  const id = uid("e_");
  getDb()
    .prepare(
      "insert into exercises (id, session_id, block_id, concept_id, type, prompt, options, answer, rubric, explanation, difficulty, verification, verification_note, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      opts.sessionId,
      opts.blockId ?? null,
      opts.conceptId ?? null,
      opts.type,
      opts.prompt,
      JSON.stringify(opts.options ?? []),
      JSON.stringify(opts.answer),
      JSON.stringify(opts.rubric ?? null),
      opts.explanation ?? null,
      opts.difficulty ?? 2,
      opts.verification ?? "unverified",
      opts.verificationNote ?? null,
      now(),
    );
  return getExercisePublic(id)!;
}

export function getExercise(id: string) {
  const r = getDb().prepare("select * from exercises where id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    blockId: (r.block_id as string) ?? null,
    conceptId: (r.concept_id as string) ?? null,
    type: r.type as ExerciseType,
    prompt: String(r.prompt),
    options: jsonParse<string[]>(r.options, []),
    answer: jsonParse<Record<string, unknown>>(r.answer, {}),
    rubric: jsonParse<string[] | null>(r.rubric, null),
    explanation: (r.explanation as string) ?? null,
    difficulty: Number(r.difficulty),
    verification: (r.verification as "passed" | "ambiguous" | "unverified") ?? "unverified",
    verificationNote: (r.verification_note as string) ?? null,
  };
}

export function getExercisePublic(id: string): ExercisePublic | null {  const ex = getExercise(id);
  if (!ex) return null;
  const attempts = getDb()
    .prepare("select count(*) as n, sum(case when is_correct = 1 then 1 else 0 end) as ok, max(used_hint) as hinted, max(viewed_solution) as viewed from attempts where exercise_id = ?")
    .get(id) as { n: number; ok: number | null; hinted: number | null; viewed: number | null };
  const conceptName = ex.conceptId
    ? (getDb().prepare("select name from concepts where id = ?").get(ex.conceptId) as
        | { name: string }
        | undefined)?.name ?? null
    : null;
  const answer = ex.answer as Record<string, unknown>;
  return {
    id: ex.id,
    blockId: ex.blockId,
    sessionId: ex.sessionId,
    conceptId: ex.conceptId,
    conceptName,
    type: ex.type,
    prompt: ex.prompt,
    options: ex.options,
    blanks: Number(answer.count ?? (Array.isArray(answer.blanks) ? (answer.blanks as unknown[]).length : 1)),
    steps: (answer.steps as string[]) ?? [],
    unit: (answer.unit as string) ?? null,
    difficulty: ex.difficulty,
    attemptCount: attempts.n,
    solved: Number(attempts.ok ?? 0) > 0,
    verification: ex.verification,
    verificationNote: ex.verificationNote,
  };
}

export function listAttemptsByExercise(exerciseId: string) {
  const rows = getDb()
    .prepare("select * from attempts where exercise_id = ? order by created_at asc")
    .all(exerciseId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    isCorrect: r.is_correct === null ? null : Number(r.is_correct) === 1,
    score: r.score === null ? null : Number(r.score),
    feedback: String(r.feedback ?? ""),
    usedHint: Number(r.used_hint) === 1,
    viewedSolution: Number(r.viewed_solution) === 1,
    attemptNo: Number(r.attempt_no),
    createdAt: Number(r.created_at),
    userAnswer: jsonParse<unknown>(r.user_answer, null),
    errorType: (r.error_type as string) ?? null,
  }));
}

/** 服务端标记：该练习的解析已被查看（用于覆盖客户端自报） */
export function markSolutionViewed(exerciseId: string) {
  getDb()
    .prepare("update exercises set solution_viewed_at = coalesce(solution_viewed_at, ?) where id = ?")
    .run(now(), exerciseId);
}

/** 服务端标记：该练习用过提示（并累加次数） */
export function markHintUsed(exerciseId: string) {
  getDb()
    .prepare("update exercises set hint_used_at = ?, hint_count = hint_count + 1 where id = ?")
    .run(now(), exerciseId);
}

/**
 * 清空"已用提示 / 已看解析"的题目级标记。
 *
 * 这两个标记只对「这一次作答」有效：提交成功后清掉，避免"再做一次"时
 * 仍被永久判为借助提示。注意：清标记**不代表恢复独立性**——
 * 答案一旦下发过，独立与否由 hasRevealedAnswer 从历史里推导，无法靠这个接口洗白。
 */
export function resetExerciseFlags(exerciseId: string) {
  getDb()
    .prepare(
      "update exercises set solution_viewed_at = null, hint_used_at = null, hint_count = 0 where id = ?",
    )
    .run(exerciseId);
}

/**
 * 这道题的正确答是否已经下发过：看过解析，或已经有过一次判定过的作答
 * （提交后接口就会把标准答案返回给前端）。
 *
 * 这是"独立完成"的服务端判据。旧实现依赖可被 /reset 清空的标记，
 * 于是「看解析 → 提交 → 再做一次 → 提交」会被记成独立正确，学习证据失真。
 */
export function hasRevealedAnswer(exerciseId: string): boolean {
  const r = getDb()
    .prepare(
      "select 1 as hit from attempts where exercise_id = ? and (viewed_solution = 1 or is_correct is not null) limit 1",
    )
    .get(exerciseId) as { hit: number } | undefined;
  return Boolean(r);
}

export function getExerciseFlags(exerciseId: string): {
  solutionViewed: boolean;
  hintUsed: boolean;
  hintCount: number;
} {
  const r = getDb()
    .prepare("select solution_viewed_at, hint_used_at, hint_count from exercises where id = ?")
    .get(exerciseId) as
    | { solution_viewed_at: number | null; hint_used_at: number | null; hint_count: number }
    | undefined;
  return {
    solutionViewed: Boolean(r?.solution_viewed_at),
    hintUsed: Boolean(r?.hint_used_at),
    hintCount: Number(r?.hint_count ?? 0),
  };
}

export function getExerciseByBlockId(blockId: string): ExercisePublic | null {
  const r = getDb()
    .prepare("select id from exercises where block_id = ? order by created_at desc limit 1")
    .get(blockId) as { id: string } | undefined;
  return r ? getExercisePublic(r.id) : null;
}

/** 一个 quiz 块下的全部题目（按创建顺序） */
export function listExercisesByBlockId(blockId: string): ExercisePublic[] {
  const rows = getDb()
    .prepare("select id from exercises where block_id = ? order by created_at asc, rowid asc")
    .all(blockId) as { id: string }[];
  return rows
    .map((r) => getExercisePublic(r.id))
    .filter((x): x is ExercisePublic => Boolean(x));
}

export function addAttempt(opts: {
  exerciseId: string;
  sessionId: string;
  conceptId: string | null;
  userAnswer: unknown;
  isCorrect: boolean | null;
  score: number | null;
  maxScore: number;
  feedback: string;
  usedHint: boolean;
  viewedSolution: boolean;
  durationMs?: number | null;
  idempotencyKey?: string | null;
  errorType?: string | null;
}) {
  const db = getDb();
  const attemptNo =
    Number(
      (db.prepare("select count(*) as n from attempts where exercise_id = ?").get(opts.exerciseId) as {
        n: number;
      }).n,
    ) + 1;
  const id = uid("a_");
  try {
    db.prepare(
      "insert into attempts (id, exercise_id, session_id, concept_id, user_answer, is_correct, score, max_score, feedback, used_hint, viewed_solution, independent, error_type, attempt_no, duration_ms, idempotency_key, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      opts.exerciseId,
      opts.sessionId,
      opts.conceptId,
      JSON.stringify(opts.userAnswer),
      opts.isCorrect === null ? null : opts.isCorrect ? 1 : 0,
      opts.score,
      opts.maxScore,
      opts.feedback,
      opts.usedHint ? 1 : 0,
      opts.viewedSolution ? 1 : 0,
      opts.viewedSolution ? 0 : 1,
      opts.errorType ?? null,
      attemptNo,
      opts.durationMs ?? null,
      opts.idempotencyKey ?? null,
      now(),
    );
  } catch (e) {
    // 幂等键冲突：返回已有作答，不重复计入
    if (String((e as Error).message).includes("UNIQUE")) {
      const exist = db
        .prepare("select * from attempts where exercise_id = ? and idempotency_key = ?")
        .get(opts.exerciseId, opts.idempotencyKey) as Record<string, unknown> | undefined;
      if (exist) {
        return {
          duplicate: true as const,
          attempt: {
            id: String(exist.id),
            exerciseId: String(exist.exercise_id),
            isCorrect: exist.is_correct === null ? null : Number(exist.is_correct) === 1,
            score: exist.score === null ? null : Number(exist.score),
            maxScore: Number(exist.max_score),
            feedback: String(exist.feedback ?? ""),
            usedHint: Number(exist.used_hint) === 1,
            viewedSolution: Number(exist.viewed_solution) === 1,
            attemptNo: Number(exist.attempt_no),
            createdAt: Number(exist.created_at),
            graded: exist.is_correct !== null,
          },
        };
      }
    }
    throw e;
  }
  return {
    duplicate: false as const,
    attempt: {
      id,
      exerciseId: opts.exerciseId,
      isCorrect: opts.isCorrect,
      score: opts.score,
      maxScore: opts.maxScore,
      feedback: opts.feedback,
      usedHint: opts.usedHint,
      viewedSolution: opts.viewedSolution,
      attemptNo,
      createdAt: now(),
      graded: opts.isCorrect !== null,
    },
  };
}

export function listAttemptsBySession(sessionId: string) {
  return getDb()
    .prepare(
      "select a.*, e.type, e.prompt, e.explanation from attempts a join exercises e on e.id = a.exercise_id where a.session_id = ? order by a.created_at asc",
    )
    .all(sessionId) as Record<string, unknown>[];
}

export function countCorrectAttempts(sessionId: string) {
  const r = getDb()
    .prepare("select count(*) as n from attempts where session_id = ? and is_correct = 1")
    .get(sessionId) as { n: number };
  return r.n;
}

// ────────────────────────────── materials ──────────────────────────────
export function createMaterial(opts: {
  name: string;
  mime: string | null;
  size: number;
  path: string | null;
  status: "parsed" | "failed" | "unsupported";
  textChars?: number;
  error?: string | null;
  planId?: string | null;
}) {
  const id = uid("mat_");
  getDb()
    .prepare(
      "insert into materials (id, name, mime, size, path, status, text_chars, error, plan_id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      opts.name,
      opts.mime,
      opts.size,
      opts.path,
      opts.status,
      opts.textChars ?? 0,
      opts.error ?? null,
      opts.planId ?? null,
      now(),
    );
  return id;
}

export function addMaterialChunks(
  materialId: string,
  chunks: { text: string; page?: number | null; heading?: string | null }[],
) {
  const stmt = getDb().prepare(
    "insert into material_chunks (id, material_id, idx, page, heading, text) values (?, ?, ?, ?, ?, ?)",
  );
  chunks.forEach((c, i) => {
    stmt.run(uid("ch_"), materialId, i, c.page ?? null, c.heading ?? null, c.text);
  });
}

export function listMaterials(): MaterialDTO[] {
  const rows = getDb()
    .prepare(
      `select m.*, p.title as plan_title,
              (select count(*) from material_chunks c where c.material_id = m.id) as chunks
         from materials m left join plans p on p.id = m.plan_id
        order by m.created_at desc`,
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    mime: (r.mime as string) ?? null,
    size: Number(r.size),
    status: r.status as MaterialDTO["status"],
    textChars: Number(r.text_chars),
    planId: (r.plan_id as string) ?? null,
    planTitle: (r.plan_title as string) ?? null,
    error: (r.error as string) ?? null,
    createdAt: Number(r.created_at),
    chunks: Number(r.chunks ?? 0),
  }));
}

/** 把材料归到某个计划；null 表示移出计划（未归类） */
export function setMaterialPlan(materialId: string, planId: string | null) {
  getDb().prepare("update materials set plan_id = ? where id = ?").run(planId, materialId);
}

/** 关键词检索材料片段（本地轻量检索：够用、可解释，不假装是向量检索） */
/** 高频虚词：只做检索用，参与匹配会让召回变噪声 */
const QUERY_STOP =
  /根据|我的|材料|讲讲|讲课|讲|说说|解释|请问|请|帮我|麻烦|一下|是什么|什么是|什么|哪些|哪个|怎么|如何|为什么|的|了|吗|呢|啊|和|与|以及|还有|这些|那些|这个|那个|我们|你|我/g;

/**
 * 把自然语言问题拆成检索词。
 * 之前直接把整句当 LIKE 条件，"根据我的材料，讲讲机会成本是什么" 一个词都命中不了，
 * 结果材料引用根本触发不了。现在会去掉虚词，并对长片段补 2 字窗口兜底。
 */
export function extractQueryTerms(query: string): string[] {
  const segments = query
    .split(/[\s,，。;；、?!？！\n\t]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);
  const terms = new Set<string>();
  for (const seg of segments) {
    const cleaned = seg.replace(QUERY_STOP, "").trim();
    if (cleaned.length >= 2) terms.add(cleaned);
    if (cleaned.length > 6) {
      const limit = Math.min(cleaned.length, 16);
      for (let i = 0; i + 2 <= limit; i++) terms.add(cleaned.slice(i, i + 2));
    }
  }
  // 长词优先，避免被两字窗口淹没
  return [...terms].sort((a, b) => b.length - a.length).slice(0, 12);
}

export function searchMaterialChunks(query: string, limit = 4, planId: string | null = null) {
  const terms = extractQueryTerms(query);
  if (!terms.length) return [];
  const db = getDb();
  // 先在 SQL 里用 LIKE 粗筛（命中任一词），再在内存里按命中数排序，
  // 避免材料变多后每条消息都搬运全表文本。
  // 按计划隔离：有计划的会话只检索该计划的材料，未归类会话只检索未归类材料。
  const where = `(${terms.map(() => "c.text like ?").join(" or ")}) and ${
    planId ? "m.plan_id = ?" : "m.plan_id is null"
  }`;
  const rows = db
    .prepare(
      `select c.id, c.text, c.page, c.heading, c.material_id, m.name as material
         from material_chunks c join materials m on m.id = c.material_id
        where ${where}
        limit 400`,
    )
    .all(...terms.map((t) => `%${t}%`), ...(planId ? [planId] : [])) as {
    id: string;
    text: string;
    page: number | null;
    heading: string | null;
    material_id: string;
    material: string;
  }[];
  const scored = rows
    .map((r) => {
      let score = 0;
      // 命中越长的词说明越贴近原意，权重越高
      for (const t of terms) if (r.text.includes(t)) score += t.length;
      return { ...r, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((r) => ({
    id: r.id,
    materialId: r.material_id,
    snippet: r.text.length > 700 ? r.text.slice(0, 700) + "…" : r.text,
    page: r.page,
    heading: r.heading,
    material: r.material,
  }));
}

// ────────────────────────────── plans ──────────────────────────────
/**
 * 按标题找已存在的路线。
 * 用途：模型重复生成同一目标时，不该出现两条同名计划各自计进度。
 */
export function findPlanByTitle(title: string): PlanDTO | null {
  const norm = title.trim().toLowerCase();
  if (!norm) return null;
  const rows = getDb().prepare("select id, title from plans order by updated_at desc limit 50").all() as {
    id: string;
    title: string;
  }[];
  const hit = rows.find((r) => r.title.trim().toLowerCase() === norm);
  return hit ? getPlan(hit.id) : null;
}

export interface CourseInput {
  title: string;
  description?: string;
  concepts: { name: string; definition?: string }[];
}

export interface PlanCreateInput {
  goalId?: string | null;
  title: string;
  note?: string;
  status?: PlanStatus;
  courses: CourseInput[];
}

interface RawCourseConceptRow {
  id: string;
  name: string;
  status: ConceptStatus;
  evidence_count: number;
  introduced_at: number | null;
  next_review_at: number | null;
  last_studied_at: number | null;
  created_at: number;
}

function rawCourseConcepts(courseId: string): RawCourseConceptRow[] {
  return getDb()
    .prepare(
      `select id, name, status, evidence_count, introduced_at, next_review_at, last_studied_at, created_at
         from concepts where course_id = ? order by created_at asc, rowid asc`,
    )
    .all(courseId) as RawCourseConceptRow[];
}

function conceptLikeOf(r: RawCourseConceptRow): ConceptLike {
  return {
    status: r.status,
    evidenceCount: r.evidence_count,
    introducedAt: r.introduced_at,
    nextReviewAt: r.next_review_at,
    lastStudiedAt: r.last_studied_at,
  };
}

function insertCourse(
  planId: string,
  course: CourseInput,
  orderIndex: number,
  topicId: string,
): { id: string; conflicts: string[] } {
  const db = getDb();
  const id = uid("pi_");
  const t = now();
  db.prepare(
    "insert into plan_items (id, plan_id, concept_id, title, rationale, order_index, status, created_at, updated_at) values (?, ?, null, ?, ?, ?, 'pending', ?, ?)",
  ).run(id, planId, course.title, course.description ?? null, orderIndex, t, t);
  const conflicts: string[] = [];
  for (const c of course.concepts ?? []) {
    const result = ensureConcept({
      topicId,
      name: c.name,
      definition: c.definition,
      courseId: id,
    });
    if (result.courseConflict) conflicts.push(c.name);
  }
  return { id, conflicts };
}

function planTopicId(title: string, note?: string | null) {
  return ensureTopic(title, note?.slice(0, 200)).id;
}

function touchPlan(planId: string) {
  getDb().prepare("update plans set updated_at = ? where id = ?").run(now(), planId);
}

/**
 * 追加课程到已有计划：同名课程只补新知识点，不重复创建课程。
 * 这是 AI 在规划阶段重复生成同一目标时的幂等入口。
 */
export function appendPlanCourses(planId: string, courses: CourseInput[]): PlanDTO | null {
  const plan = getPlan(planId);
  if (!plan) return null;
  const db = getDb();
  const topicId = planTopicId(plan.title, plan.note);
  const existing = new Map(plan.items.map((item) => [item.title.trim().toLowerCase(), item]));
  const seen = new Set<string>();
  let next = plan.items.length;

  db.transaction(() => {
    for (const course of courses) {
      const key = course.title.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const match = existing.get(key);
      if (match) {
        for (const c of course.concepts ?? []) {
          ensureConcept({
            topicId,
            name: c.name,
            definition: c.definition,
            courseId: match.id,
          });
        }
      } else {
        insertCourse(planId, course, next++, topicId);
      }
    }
    touchPlan(planId);
  })();
  return getPlan(planId);
}

export function createPlan(opts: PlanCreateInput): PlanDTO {
  const db = getDb();
  const id = uid("p_");
  const t = now();
  const topicId = planTopicId(opts.title, opts.note);
  db.transaction(() => {
    db.prepare(
      "insert into plans (id, goal_id, title, note, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, opts.goalId ?? null, opts.title, opts.note ?? null, opts.status ?? "draft", t, t);
    opts.courses.forEach((course, i) => {
      insertCourse(id, course, i, topicId);
    });
  })();
  return getPlan(id)!;
}

/**
 * 按课程内的真实知识点状态更新课程状态。
 * 不再使用「本步随便答对 3 个概念就算完成」的旧规则。
 */
export function syncPlanItemCompletion(sessionId: string): {
  planItemId: string;
  mastered: number;
  total: number;
  completed: boolean;
} | null {
  const db = getDb();
  const session = db
    .prepare("select id, plan_id, plan_item_id, mode from sessions where id = ?")
    .get(sessionId) as
    | { id: string; plan_id: string | null; plan_item_id: string | null; mode: LearningMode }
    | undefined;
  if (!session?.plan_id || !session.plan_item_id || session.mode === "infinite") return null;

  const plan = db.prepare("select status from plans where id = ?").get(session.plan_id) as
    | { status: PlanStatus }
    | undefined;
  // 草稿计划不产生学习进度，必须先由用户确认
  if (!plan || plan.status === "draft") return null;

  const item = db.prepare("select status from plan_items where id = ?").get(session.plan_item_id) as
    | { status: "pending" | "in_progress" | "done" | "skipped" }
    | undefined;
  if (!item || item.status === "skipped") return null;

  const raw = rawCourseConcepts(session.plan_item_id);
  const likes = raw.map(conceptLikeOf);
  const status = courseStatusOf(item.status, likes);
  const progress = courseProgressOf(likes);
  const stored = status === "unconfigured" ? "pending" : status;
  db.transaction(() => {
    db.prepare("update plan_items set status = ?, updated_at = ? where id = ?").run(
      stored,
      now(),
      session.plan_item_id,
    );
    touchPlan(session.plan_id!);
  })();
  return {
    planItemId: session.plan_item_id,
    mastered: progress.mastered,
    total: progress.total,
    completed: status === "done",
  };
}

export function getPlan(id: string): PlanDTO | null {
  const db = getDb();
  const p = db.prepare("select * from plans where id = ?").get(id) as Record<string, unknown> | undefined;
  if (!p) return null;
  const nowTs = Date.now();
  const rows = db
    .prepare("select * from plan_items where plan_id = ? order by order_index asc")
    .all(id) as Record<string, unknown>[];

  const courses = rows.map((r) => {
    const raw = rawCourseConcepts(String(r.id));
    const likes = raw.map(conceptLikeOf);
    const status = courseStatusOf(
      r.status as "pending" | "in_progress" | "done" | "skipped",
      likes,
      nowTs,
    );
    const progress = courseProgressOf(likes, nowTs);
    const concepts: CourseConceptDTO[] = raw.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      displayStatus: conceptDisplayStatus(conceptLikeOf(c), nowTs),
      introducedAt: c.introduced_at,
    }));
    const next =
      raw.find((c) => {
        const s = conceptDisplayStatus(conceptLikeOf(c), nowTs);
        return s === "learning" || s === "review";
      }) ??
      raw.find((c) => conceptDisplayStatus(conceptLikeOf(c), nowTs) !== "mastered") ??
      null;
    const dto: PlanItemDTO = {
      id: String(r.id),
      planId: String(r.plan_id),
      title: String(r.title),
      description: (r.rationale as string) ?? null,
      orderIndex: Number(r.order_index),
      status,
      concepts,
      progress,
      nextConceptId: next?.id ?? null,
      nextConceptName: next?.name ?? null,
      unconfigured: raw.length === 0,
    };
    return { dto, status, likes };
  });

  const progress = planProgressOf(
    courses.map((c) => ({ status: c.status, concepts: c.likes })),
    nowTs,
  );
  const current =
    courses.find((c) => c.status === "in_progress") ??
    courses.find((c) => c.status === "pending" && c.dto.concepts.length > 0) ??
    courses.find((c) => c.status === "unconfigured") ??
    null;

  return {
    id: String(p.id),
    goalId: (p.goal_id as string) ?? null,
    title: String(p.title),
    note: (p.note as string) ?? null,
    status: p.status as PlanStatus,
    createdAt: Number(p.created_at),
    updatedAt: Number(p.updated_at),
    items: courses.map((c) => c.dto),
    progress,
    currentCourseId: current?.dto.id ?? null,
    currentCourseTitle: current?.dto.title ?? null,
    currentConceptId: current?.dto.nextConceptId ?? null,
    currentConceptName: current?.dto.nextConceptName ?? null,
    counts: {
      sessions: (db.prepare("select count(*) as n from sessions where plan_id = ?").get(id) as { n: number }).n,
      materials: (db.prepare("select count(*) as n from materials where plan_id = ?").get(id) as { n: number }).n,
      reviews: (
        db.prepare("select count(*) as n from review_items where plan_id = ? and status = 'open'").get(id) as {
          n: number;
        }
      ).n,
    },
  };
}

/**
 * 删除一条学习路线。
 * 只删路线本身（plans + plan_items），不触碰知识点、作答记录、掌握度证据——
 * 路线是"打算怎么学"，档案是"实际学成了什么"，两者不能互相牵连。
 */
export function deletePlan(id: string): boolean {
  const db = getDb();
  const row = db.prepare("select goal_id from plans where id = ?").get(id) as
    | { goal_id: string | null }
    | undefined;
  if (!row) return false;
  db.transaction(() => {
    // 计划删除后，关联的会话/材料/复习条目回到“未归类”，不连带删除
    db.prepare("update sessions set plan_id = null, plan_item_id = null where plan_id = ?").run(id);
    db.prepare("update materials set plan_id = null where plan_id = ?").run(id);
    db.prepare("update review_items set plan_id = null where plan_id = ?").run(id);
    // 知识点不删除，只解除课程归属；档案里会显示为“待整理”
    db.prepare(
      "update concepts set course_id = null where course_id in (select id from plan_items where plan_id = ?)",
    ).run(id);
    db.prepare("delete from plan_items where plan_id = ?").run(id);
    db.prepare("delete from plans where id = ?").run(id);
    if (row.goal_id) {
      const others = db
        .prepare("select count(*) as n from plans where goal_id = ?")
        .get(row.goal_id) as { n: number };
      if (others.n === 0) db.prepare("delete from goals where id = ?").run(row.goal_id);
    }
  })();
  return true;
}

export function listPlans(): PlanDTO[] {
  const rows = getDb()
    .prepare("select id from plans order by datetime(updated_at/1000,'unixepoch') desc limit 20")
    .all() as { id: string }[];
  return rows.map((r) => getPlan(r.id)!).filter(Boolean);
}

export function updatePlanMeta(
  planId: string,
  patch: { title?: string; note?: string | null },
): PlanDTO | null {
  const plan = getPlan(planId);
  if (!plan) return null;
  const title = patch.title === undefined ? plan.title : patch.title.trim();
  if (!title) return null;
  getDb()
    .prepare("update plans set title = ?, note = ?, updated_at = ? where id = ?")
    .run(title, patch.note === undefined ? plan.note : patch.note, now(), planId);
  return getPlan(planId);
}

export function confirmPlan(planId: string): PlanDTO | null {
  const plan = getPlan(planId);
  if (!plan) return null;
  if (!plan.items.length) return plan;
  if (!plan.items.some((item) => item.concepts.length > 0)) return plan;
  getDb().prepare("update plans set status = 'active', updated_at = ? where id = ?").run(now(), planId);
  return getPlan(planId);
}

export function setPlanStatus(planId: string, status: "active" | "paused"): PlanDTO | null {
  const plan = getPlan(planId);
  if (!plan) return null;
  getDb().prepare("update plans set status = ?, updated_at = ? where id = ?").run(status, now(), planId);
  return getPlan(planId);
}

function courseOfPlan(planId: string, itemId: string) {
  return getDb()
    .prepare("select id, title from plan_items where id = ? and plan_id = ?")
    .get(itemId, planId) as { id: string; title: string } | undefined;
}

export function addPlanCourse(
  planId: string,
  course: { title: string; description?: string },
): PlanDTO | null {
  const plan = getPlan(planId);
  if (!plan) return null;
  const title = course.title.trim();
  if (!title) return null;
  const topicId = planTopicId(plan.title, plan.note);
  const db = getDb();
  db.transaction(() => {
    insertCourse(planId, { title, description: course.description, concepts: [] }, plan.items.length, topicId);
    touchPlan(planId);
  })();
  return getPlan(planId);
}

export function updatePlanCourse(
  planId: string,
  itemId: string,
  patch: { title?: string; description?: string | null },
): PlanDTO | null {
  const course = courseOfPlan(planId, itemId);
  if (!course) return null;
  const title = patch.title === undefined ? course.title : patch.title.trim();
  if (!title) return null;
  const current = getDb().prepare("select rationale from plan_items where id = ?").get(itemId) as
    | { rationale: string | null }
    | undefined;
  getDb()
    .prepare("update plan_items set title = ?, rationale = ?, updated_at = ? where id = ?")
    .run(
      title,
      patch.description === undefined ? current?.rationale ?? null : patch.description,
      now(),
      itemId,
    );
  touchPlan(planId);
  return getPlan(planId);
}

export function deletePlanCourse(planId: string, itemId: string): PlanDTO | null {
  const course = courseOfPlan(planId, itemId);
  if (!course) return null;
  const db = getDb();
  db.transaction(() => {
    db.prepare("update concepts set course_id = null where course_id = ?").run(itemId);
    db.prepare("update sessions set plan_item_id = null where plan_item_id = ?").run(itemId);
    db.prepare("delete from plan_items where id = ?").run(itemId);
    const left = db
      .prepare("select id from plan_items where plan_id = ? order by order_index asc")
      .all(planId) as { id: string }[];
    left.forEach((row, i) => {
      db.prepare("update plan_items set order_index = ? where id = ?").run(i, row.id);
    });
    touchPlan(planId);
  })();
  return getPlan(planId);
}

export function movePlanCourse(
  planId: string,
  itemId: string,
  direction: "up" | "down",
): PlanDTO | null {
  const plan = getPlan(planId);
  if (!plan) return null;
  const index = plan.items.findIndex((i) => i.id === itemId);
  if (index < 0) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= plan.items.length) return plan;
  const db = getDb();
  const a = plan.items[index];
  const b = plan.items[target];
  db.transaction(() => {
    db.prepare("update plan_items set order_index = ? where id = ?").run(target, a.id);
    db.prepare("update plan_items set order_index = ? where id = ?").run(index, b.id);
    touchPlan(planId);
  })();
  return getPlan(planId);
}

export function setPlanCourseSkipped(
  planId: string,
  itemId: string,
  skipped: boolean,
): PlanDTO | null {
  const course = courseOfPlan(planId, itemId);
  if (!course) return null;
  getDb()
    .prepare("update plan_items set status = ?, updated_at = ? where id = ?")
    .run(skipped ? "skipped" : "pending", now(), itemId);
  touchPlan(planId);
  return getPlan(planId);
}

/**
 * 添加知识点到课程。一个知识点只能有一个课程归属：
 * 已属于另一门课程时不强行搬走，返回 conflict 让用户先合并/移除。
 */
export function addConceptToCourse(
  planId: string,
  itemId: string,
  concept: { name: string; definition?: string },
): { plan: PlanDTO | null; created: boolean; conflict: boolean } {
  const plan = getPlan(planId);
  const course = courseOfPlan(planId, itemId);
  if (!plan || !course) return { plan: null, created: false, conflict: false };
  const name = concept.name.trim();
  if (!name) return { plan, created: false, conflict: false };
  const topicId = planTopicId(plan.title, plan.note);
  const result = ensureConcept({
    topicId,
    name,
    definition: concept.definition,
    courseId: itemId,
  });
  if (result.courseConflict) return { plan, created: false, conflict: true };
  touchPlan(planId);
  return { plan: getPlan(planId), created: result.created, conflict: false };
}

export function removeConceptFromCourse(planId: string, conceptId: string): PlanDTO | null {
  const row = getDb()
    .prepare(
      `select c.id from concepts c join plan_items pi on pi.id = c.course_id
        where c.id = ? and pi.plan_id = ?`,
    )
    .get(conceptId, planId) as { id: string } | undefined;
  if (!row) return null;
  getDb().prepare("update concepts set course_id = null, updated_at = ? where id = ?").run(now(), conceptId);
  touchPlan(planId);
  return getPlan(planId);
}

export function renameConcept(
  planId: string,
  conceptId: string,
  name: string,
): { ok: boolean; conflictId?: string; plan: PlanDTO | null } {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, plan: getPlan(planId) };
  const row = getDb()
    .prepare(
      `select c.id from concepts c join plan_items pi on pi.id = c.course_id
        where c.id = ? and pi.plan_id = ?`,
    )
    .get(conceptId, planId) as { id: string } | undefined;
  if (!row) return { ok: false, plan: getPlan(planId) };
  const key = normalizeText(trimmed);
  const dup = getDb()
    .prepare("select id from concepts where canonical_key = ? and id <> ? limit 1")
    .get(key, conceptId) as { id: string } | undefined;
  if (dup) return { ok: false, conflictId: dup.id, plan: getPlan(planId) };
  getDb()
    .prepare("update concepts set name = ?, canonical_key = ?, updated_at = ? where id = ?")
    .run(trimmed, key, now(), conceptId);
  touchPlan(planId);
  return { ok: true, plan: getPlan(planId) };
}

export function createGoal(opts: {
  title: string;
  targetLevel?: string;
  baseline?: string;
  minutesPerDay?: number;
}) {
  const id = uid("g_");
  getDb()
    .prepare(
      "insert into goals (id, title, target_level, baseline, minutes_per_day, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, opts.title, opts.targetLevel ?? null, opts.baseline ?? null, opts.minutesPerDay ?? null, now(), now());
  return id;
}

export function listGoals() {
  return getDb().prepare("select * from goals order by created_at desc limit 20").all() as Record<string, unknown>[];
}

// ────────────────────────────── review ──────────────────────────────
export function refreshReviewQueue() {
  const db = getDb();
  const t = now();
  // 优先按知识点的唯一课程归属；没有课程时再回退到最近一次证据所在计划
  const planOfConcept = `
    select coalesce(
      (select p.id from concepts c
         join plan_items pi on pi.id = c.course_id
         join plans p on p.id = pi.plan_id
        where c.id = ? and p.status <> 'draft'),
      (select s.plan_id from evidence e join sessions s on s.id = e.session_id
        where e.concept_id = ? and e.voided = 0 and s.plan_id is not null
        order by e.created_at desc limit 1)
    ) as plan_id
  `;
  db.exec(`
    update review_items set plan_id = coalesce(
      (select p.id from concepts c
         join plan_items pi on pi.id = c.course_id
         join plans p on p.id = pi.plan_id
        where c.id = review_items.concept_id and p.status <> 'draft'),
      (select s.plan_id from evidence e join sessions s on s.id = e.session_id
        where e.concept_id = review_items.concept_id
          and e.voided = 0 and s.plan_id is not null
        order by e.created_at desc limit 1)
    )
    where plan_id is null
  `);
  const candidates = listConcepts({ limit: 500 });
  const existing = new Set(
    (db.prepare("select concept_id from review_items where status = 'open'").all() as {
      concept_id: string;
    }[]).map((r) => r.concept_id),
  );
  // 用户手动忽略/标记已复习的条目：在产生新学习证据前不要重新出现
  const actedRows = db
    .prepare(
      "select concept_id, acted_at from review_items where status in ('dismissed','done') and acted_at is not null order by acted_at desc",
    )
    .all() as { concept_id: string; acted_at: number }[];
  const lastActed = new Map<string, number>();
  for (const row of actedRows) {
    if (!lastActed.has(row.concept_id)) lastActed.set(row.concept_id, Number(row.acted_at));
  }
  const ins = db.prepare(
    "insert into review_items (id, concept_id, plan_id, reason, priority, due_at, status, created_at) values (?, ?, ?, ?, ?, ?, 'open', ?)",
  );
  const planFor = db.prepare(planOfConcept);
  for (const c of candidates) {
    if (existing.has(c.id)) continue;
    const actedAt = lastActed.get(c.id);
    if (actedAt && (c.lastStudiedAt ?? 0) <= actedAt) continue;
    let reason: string | null = null;
    let priority = 3;
    if (c.status === "needs_work") {
      reason =
        c.wrongStreak >= 2
          ? `最近连续 ${c.wrongStreak} 次答错，需要重新建立正确连接`
          : `有 ${c.evidenceCount} 次作答但尚未形成稳定正确率`;
      priority = 1;
    } else if (c.hintUses > 0 && c.status !== "mastered") {
      reason = `完成过程中使用了 ${c.hintUses} 次提示，独立完成能力尚未验证`;
      priority = 2;
    } else if (c.nextReviewAt && c.nextReviewAt <= t && c.status !== "untouched") {
      reason = "到达计划复习时间，间隔复测有助于长期记忆";
      priority = 2;
    } else if (c.status === "initial" && c.distinctExercises < 3) {
      reason = "只有少量题目上验证过，换一种题型再测一次更可靠";
      priority = 3;
    } else if (c.wrongStreak > 0) {
      // 刚答错过一次：当天就给一个"再练一题"的入口，不要等到明天
      reason = "刚答错过一次，今天再练一题更稳";
      priority = 3;
    }
    if (reason) {
      const plan = planFor.get(c.id, c.id) as { plan_id: string | null } | undefined;
      ins.run(uid("ri_"), c.id, plan?.plan_id ?? null, reason, priority, c.nextReviewAt ?? t, t);
    }
  }
}

export function listReviewItems(status = "open"): ReviewItemDTO[] {
  const rows = getDb()
    .prepare(
      `select r.*, c.name as concept_name, t.name as topic_name,
              coalesce(pi.plan_id, r.plan_id) as resolved_plan_id,
              p.title as plan_title, pi.id as course_id, pi.title as course_name
         from review_items r
         join concepts c on c.id = r.concept_id
         join topics t on t.id = c.topic_id
         left join plan_items pi on pi.id = c.course_id
         left join plans p on p.id = coalesce(pi.plan_id, r.plan_id)
        where r.status = ?
        order by r.priority asc, r.created_at desc limit 30`,
    )
    .all(status) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    conceptId: String(r.concept_id),
    conceptName: String(r.concept_name),
    topicName: String(r.topic_name),
    planId: (r.resolved_plan_id as string) ?? null,
    planTitle: (r.plan_title as string) ?? null,
    courseId: (r.course_id as string) ?? null,
    courseName: (r.course_name as string) ?? null,
    reason: String(r.reason),
    priority: Number(r.priority),
    dueAt: (r.due_at as number) ?? null,
    status: String(r.status),
    createdAt: Number(r.created_at),
  }));
}

export function actOnReviewItem(id: string, status: "accepted" | "dismissed" | "done") {
  getDb().prepare("update review_items set status = ?, acted_at = ? where id = ?").run(status, now(), id);
}

/** 概念最近一次有效证据所在会话的计划；用于复习/练一练自动带上归属 */
export function latestPlanForConcept(conceptId: string): string | null {
  const row = getDb()
    .prepare(
      `select coalesce(
         (select p.id from concepts c
            join plan_items pi on pi.id = c.course_id
            join plans p on p.id = pi.plan_id
           where c.id = ? and p.status <> 'draft'),
         (select s.plan_id from evidence e join sessions s on s.id = e.session_id
           where e.concept_id = ? and e.voided = 0 and s.plan_id is not null
           order by e.created_at desc limit 1)
       ) as plan_id`,
    )
    .get(conceptId, conceptId) as { plan_id: string | null } | undefined;
  return row?.plan_id ?? null;
}

// ────────────────────────────── summaries ──────────────────────────────
export function saveSummary(sessionId: string, data: unknown) {
  const db = getDb();
  db.transaction(() => {
    db.prepare("insert into summaries (id, session_id, data, created_at) values (?, ?, ?, ?)").run(
      uid("sm_"),
      sessionId,
      JSON.stringify(data),
      now(),
    );
    const headline = (data as { headline?: string })?.headline;
    db.prepare("update sessions set summary = ?, resume_hint = ?, updated_at = ? where id = ?").run(
      headline ?? null,
      (data as { resumeHint?: string })?.resumeHint ?? null,
      now(),
      sessionId,
    );
  })();
}

export function getLatestSummary(sessionId: string) {
  const r = getDb()
    .prepare("select data, created_at from summaries where session_id = ? order by created_at desc limit 1")
    .get(sessionId) as { data: string; created_at: number } | undefined;
  return r ? { data: jsonParse<Record<string, unknown>>(r.data, {}), createdAt: r.created_at } : null;
}

// ────────────────────────────── usage ──────────────────────────────
export function logUsage(opts: {
  sessionId?: string | null;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  ok: boolean;
  error?: string;
}) {
  getDb()
    .prepare(
      "insert into usage_log (id, session_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      uid("u_"),
      opts.sessionId ?? null,
      opts.model ?? null,
      opts.promptTokens ?? 0,
      opts.completionTokens ?? 0,
      opts.latencyMs ?? 0,
      opts.ok ? 1 : 0,
      opts.error ?? null,
      now(),
    );
}
