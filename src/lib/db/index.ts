import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";

const globalForDb = globalThis as unknown as { __luminaDb?: Database.Database };

export function dataDir(): string {
  // 用字符串拼接而非 path.resolve(process.cwd(), 动态env)：
  // 后者会让打包器的文件追踪把整个项目算进去（构建告警）。
  const raw = process.env.DATA_DIR ?? "data";
  const isAbsolute = /^([a-zA-Z]:[\\/]|[\\/])/.test(raw);
  const dir = isAbsolute ? raw : `${process.cwd()}/${raw.replace(/^\.\//, "")}`;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function dbPath(): string {
  return path.join(dataDir(), "lumina.db");
}

/** 幂等加列：新库建表时已包含，老库自动补齐，不会因"重复列"整体失败 */
function ensureColumn(db: Database.Database, table: string, column: string, ddl: string) {
  const cols = db.prepare(`pragma table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`alter table ${table} add column ${ddl}`);
  }
}

function migrate(db: Database.Database) {
  db.exec(SCHEMA_SQL);
  // 增量迁移：每次只追加，绝不删表/清数据
  const applied = new Set(
    db.prepare("select id from schema_migrations").all().map((r) => (r as { id: string }).id),
  );
  const batches: { id: string; run: () => void }[] = [
    {
      id: "20261022_exercise_progress_flags",
      run: () => {
        ensureColumn(db, "exercises", "solution_viewed_at", "solution_viewed_at integer");
        ensureColumn(db, "exercises", "hint_used_at", "hint_used_at integer");
        ensureColumn(db, "exercises", "hint_count", "hint_count integer not null default 0");
      },
    },
    {
      id: "20261022_error_taxonomy_and_voiding",
      run: () => {
        // A1：错因；A3：证据软作废；A2：结构化复习会话
        ensureColumn(db, "attempts", "error_type", "error_type text");
        ensureColumn(db, "evidence", "voided", "voided integer not null default 0");
        ensureColumn(db, "evidence", "void_reason", "void_reason text");
        ensureColumn(db, "evidence", "voided_at", "voided_at integer");
        ensureColumn(db, "sessions", "focus_concept_id", "focus_concept_id text");
        ensureColumn(db, "sessions", "review_item_id", "review_item_id text");
      },
    },
    {
      id: "20261022_multi_model_profiles",
      run: () => {
        ensureColumn(db, "sessions", "model_id", "model_id text");

        // 旧版只有一套 ai_config：迁移成默认模型，用户不必重新填 Key
        const existing = db.prepare("select count(*) as n from ai_models").get() as { n: number };
        if (existing.n > 0) return;

        const row = db.prepare("select value from settings where key = 'ai_config'").get() as
          | { value: string }
          | undefined;
        if (!row?.value) return;

        try {
          const c = JSON.parse(row.value) as {
            provider?: string;
            baseUrl?: string;
            model?: string;
            apiKey?: string;
            temperature?: number;
          };
          if (!c?.model || !c?.apiKey) return;
          const t = Date.now();
          db.prepare(
            `insert into ai_models (id, label, provider, base_url, model, api_key, temperature, is_default, created_at, updated_at)
             values (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          ).run(
            "am_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20),
            c.model,
            c.provider === "anthropic" ? "anthropic" : "openai",
            (c.baseUrl ?? "").replace(/\/+$/, ""),
            c.model,
            c.apiKey,
            typeof c.temperature === "number" ? c.temperature : 0.6,
            t,
            t,
          );
        } catch {
          // 旧配置损坏就不迁移，用户重新添加即可
        }
      },
    },
    {
      id: "20261022_web_retrieval",
      run: () => {
        // 表已由 SCHEMA_SQL 幂等创建；这里只记录迁移点，便于审计
      },
    },
    {
      id: "20261022_plan_grouping",
      run: () => {
        // 计划即“目标”：会话、材料、复习条目都挂到计划下
        ensureColumn(db, "sessions", "plan_id", "plan_id text");
        ensureColumn(db, "materials", "plan_id", "plan_id text");
        ensureColumn(db, "review_items", "plan_id", "plan_id text");
        db.exec("create index if not exists ix_sessions_plan on sessions(plan_id)");
        db.exec("create index if not exists ix_materials_plan on materials(plan_id)");
        db.exec("create index if not exists ix_review_plan on review_items(plan_id)");
        // 旧复习条目按最近一次证据所在会话的计划补归属
        db.exec(`
          update review_items set plan_id = (
            select s.plan_id from evidence e join sessions s on s.id = e.session_id
             where e.concept_id = review_items.concept_id
               and e.voided = 0 and s.plan_id is not null
             order by e.created_at desc limit 1
          )
          where plan_id is null
        `);
      },
    },
    {
      id: "20261023_session_plan_item",
      run: () => {
        ensureColumn(db, "sessions", "plan_item_id", "plan_item_id text");
      },
    },
    {
      id: "20261023_concept_introduced",
      run: () => {
        ensureColumn(db, "concepts", "introduced_at", "introduced_at integer");
        // 旧数据：有定义或已有证据的，视为已讲解过
        db.exec(`
          update concepts set introduced_at = created_at
          where introduced_at is null
            and (coalesce(trim(definition), '') <> '' or evidence_count > 0)
        `);
      },
    },
    {
      id: "20261023_session_plan_item_backfill",
      run: () => {
        // 旧会话没有步骤绑定：归到当前进行中/第一个未开始步骤
        db.exec(`
          update sessions set plan_item_id = (
            select pi.id from plan_items pi
             where pi.plan_id = sessions.plan_id
               and pi.status in ('in_progress', 'pending')
             order by case when pi.status = 'in_progress' then 0 else 1 end, pi.order_index asc
             limit 1
          )
          where plan_id is not null
            and plan_item_id is null
            and message_count > 0
        `);
        // 已有独立正确证据的步骤，至少显示为进行中
        db.exec(`
          update plan_items set status = 'in_progress'
          where status = 'pending' and exists (
            select 1 from sessions s
             join evidence e on e.session_id = s.id
            where s.plan_item_id = plan_items.id
              and e.voided = 0 and e.independent = 1 and e.correct = 1
              and e.weight > 0 and e.concept_id is not null
          )
        `);
        // 已经达到 3 个不同知识点独立正确的步骤，直接补记为完成
        db.exec(`
          update plan_items set status = 'done'
          where status != 'done' and (
            select count(distinct e.concept_id) from sessions s
             join evidence e on e.session_id = s.id
            where s.plan_item_id = plan_items.id
              and e.voided = 0 and e.independent = 1 and e.correct = 1
              and e.weight > 0 and e.concept_id is not null
          ) >= 3
        `);
      },
    },
    {
      id: "20261022_plan_session_backfill",
      run: () => {
        // 从计划步骤进入的旧会话，标题里带着计划名；能确定就直接归过去，其余留给用户手动调整
        db.exec(`
          update sessions set plan_id = (
            select p.id from plans p
             where instr(sessions.title, p.title) > 0
             order by length(p.title) desc limit 1
          )
          where plan_id is null
        `);
      },
    },
    {
      id: "20261023_exercise_verification",
      run: () => {
        ensureColumn(db, "exercises", "verification", "verification text not null default 'unverified'");
        ensureColumn(db, "exercises", "verification_note", "verification_note text");
      },
    },
    {
      id: "20261023_dual_mode_courses",
      run: () => {
        ensureColumn(db, "concepts", "course_id", "course_id text");
        db.exec("create index if not exists ix_concepts_course on concepts(course_id)");

        // 旧「自由学习」统一并入无限学习；复习与目标学习保持不变
        db.exec(`
          update sessions set mode = 'infinite'
          where mode is null or mode = 'free' or mode not in ('infinite', 'goal', 'review')
        `);

        // 旧计划默认是正式计划；新计划由 createPlan 显式写成 draft
        db.exec(`
          update plans set status = 'active'
          where status is null or status = '' or status not in ('draft', 'active', 'paused')
        `);

        // 旧计划步骤只有一个 concept_id：把它还原成课程的归属知识点。
        // 同一个知识点被多个步骤引用时，归到最近更新的计划下的第一个步骤。
        db.exec(`
          update concepts set course_id = (
            select pi.id from plan_items pi join plans p on p.id = pi.plan_id
             where pi.concept_id = concepts.id
             order by p.updated_at desc, pi.order_index asc limit 1
          )
          where course_id is null
            and exists (select 1 from plan_items pi where pi.concept_id = concepts.id)
        `);
        db.exec("create index if not exists ix_plan_items_concept on plan_items(concept_id)");
      },
    },
    {
      id: "20261023_course_evidence_backfill",
      run: () => {
        // 旧步骤在完成时可能验证了多个知识点，但 plan_items 只存了一个 concept_id。
        // 有明确会话步骤证据的概念归回该课程；没有证据、无法确认归属的保持待整理。
        db.exec(`
          update concepts set course_id = (
            select s.plan_item_id from evidence e
              join sessions s on s.id = e.session_id
              join plan_items pi on pi.id = s.plan_item_id
             where e.concept_id = concepts.id
               and e.voided = 0
               and s.plan_item_id is not null
             order by e.created_at desc limit 1
          )
          where course_id is null
            and exists (
              select 1 from evidence e join sessions s on s.id = e.session_id
               where e.concept_id = concepts.id and e.voided = 0 and s.plan_item_id is not null
            )
        `);
        // 旧 free 会话如果明确绑定了计划，它实际是目标学习；没有计划的才是无限学习。
        db.exec(`
          update sessions set mode = 'goal'
          where mode = 'infinite' and plan_id is not null
        `);
      },
    },
    {
      id: "20261024_sidebar_pins",
      run: () => {
        // 侧栏置顶：会话和计划各一个置顶时间戳，null 表示没置顶
        ensureColumn(db, "sessions", "pinned_at", "pinned_at integer");
        ensureColumn(db, "plans", "pinned_at", "pinned_at integer");
      },
    },
  ];
  for (const b of batches) {
    if (applied.has(b.id)) continue;
    db.transaction(b.run)();
    db.prepare("insert into schema_migrations (id, applied_at) values (?, ?)").run(b.id, Date.now());
  }
}

export function getDb(): Database.Database {
  if (globalForDb.__luminaDb) return globalForDb.__luminaDb;
  const db = new Database(dbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  globalForDb.__luminaDb = db;
  return db;
}

export const now = () => Date.now();
export const uid = (prefix = "") =>
  prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 20);

export function jsonParse<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

export function tx<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction(fn)();
}
