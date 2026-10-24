"use client";

/**
 * 侧栏会话区（ChatGPT 式）：
 * - 分三组：置顶 / 计划（每个计划可展开，看到关联对话）/ 最近
 * - 悬停行右侧出现图钉 + 三个点；三个点菜单：重命名 / 置顶 / 移至计划 / 删除
 * - 计划行菜单：重命名 / 置顶 / 计划详细 / 删除
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  FolderInput,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import {
  Button,
  MenuItem,
  Modal,
  OverflowMenu,
  cx,
  inputClass,
} from "@/components/ui/kit";
import type { PlanDTO, SessionSummary } from "@/lib/types";

const OPEN_PLANS_KEY = "lumina-sidebar-open-plans";

type Target = { type: "session"; session: SessionSummary } | { type: "plan"; plan: PlanDTO };

const byRecent = (a: SessionSummary, b: SessionSummary) => b.updatedAt - a.updatedAt;

const byPinned = (a: { pinnedAt?: number | null }, b: { pinnedAt?: number | null }) =>
  (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);

export default function SidebarChats({
  sessions,
  plans,
  onReload,
}: {
  sessions: SessionSummary[];
  plans: PlanDTO[];
  onReload: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [openPlans, setOpenPlans] = useState<Set<string>>(new Set());
  const autoOpened = useRef(false);
  const [rename, setRename] = useState<Target | null>(null);
  const [remove, setRemove] = useState<Target | null>(null);
  const [move, setMove] = useState<SessionSummary | null>(null);

  // 第一次打开（本机没记过展开状态）：有对话的计划先展开，免得看着像空的
  useEffect(() => {
    if (autoOpened.current) return;
    if (!sessions.length && !plans.length) return;
    autoOpened.current = true;
    try {
      const raw = window.localStorage.getItem(OPEN_PLANS_KEY);
      if (raw) {
        setOpenPlans(new Set(JSON.parse(raw) as string[]));
        return;
      }
    } catch {
      /* 记不住就全折叠，不影响使用 */
    }
    const withChats = plans.filter((p) =>
      sessions.some((s) => s.planId === p.id && !s.pinnedAt),
    );
    if (withChats.length) setOpenPlans(new Set(withChats.map((p) => p.id)));
  }, [sessions, plans]);

  const togglePlan = (id: string) => {
    setOpenPlans((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem(OPEN_PLANS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const planIds = useMemo(() => new Set(plans.map((p) => p.id)), [plans]);
  const pinnedSessions = useMemo(
    () => sessions.filter((s) => s.pinnedAt).sort(byPinned),
    [sessions],
  );
  const pinnedPlans = useMemo(() => plans.filter((p) => p.pinnedAt).sort(byPinned), [plans]);
  const normalPlans = useMemo(() => plans.filter((p) => !p.pinnedAt), [plans]);
  const recent = useMemo(
    () =>
      sessions
        .filter((s) => !s.pinnedAt && (!s.planId || !planIds.has(s.planId)))
        .sort(byRecent)
        .slice(0, 12),
    [sessions, planIds],
  );

  const planSessions = (planId: string) =>
    sessions.filter((s) => s.planId === planId && !s.pinnedAt).sort(byRecent);

  const notify = () => {
    // 让主区和其它页面（历史、计划）跟着刷新，避免侧栏与正文两份数据
    window.dispatchEvent(new Event("sessions:changed"));
    window.dispatchEvent(new Event("plans:changed"));
    onReload();
  };

  const toggleSessionPin = async (s: SessionSummary) => {
    await fetch(`/api/sessions/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned: !s.pinnedAt }),
    }).catch(() => null);
    notify();
  };

  const togglePlanPin = async (p: PlanDTO) => {
    await fetch(`/api/plans/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "pin", pinned: !p.pinnedAt }),
    }).catch(() => null);
    notify();
  };

  const rowClass = (active: boolean) =>
    cx(
      "group flex items-center gap-1 rounded-xl pr-1 transition-colors",
      active ? "bg-panel2" : "hover:bg-panel2",
    );

  const sessionRow = (s: SessionSummary, indent = false) => (
    <div
      key={s.id}
      className={rowClass(pathname === `/s/${s.id}`)}
      style={indent ? { paddingLeft: 12 } : undefined}
    >
      <Link
        href={`/s/${s.id}`}
        title={s.title}
        className={cx(
          "min-w-0 flex-1 truncate py-1.5 text-[12.8px] transition-colors",
          indent ? "pl-4" : "pl-3",
          "text-ink2 hover:text-ink",
        )}
      >
        {s.title}
      </Link>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => void toggleSessionPin(s)}
          aria-label={s.pinnedAt ? "取消置顶" : "置顶对话"}
          title={s.pinnedAt ? "取消置顶" : "置顶"}
          className="grid size-6 place-items-center rounded-full text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
        >
          {s.pinnedAt ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>
        <OverflowMenu compact ariaLabel="对话操作" align="right">
          <MenuItem onClick={() => setRename({ type: "session", session: s })}>
            <Pencil className="size-3.5" />
            重命名
          </MenuItem>
          <MenuItem onClick={() => void toggleSessionPin(s)}>
            {s.pinnedAt ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            {s.pinnedAt ? "取消置顶" : "置顶"}
          </MenuItem>
          <MenuItem onClick={() => setMove(s)}>
            <FolderInput className="size-3.5" />
            移至计划
          </MenuItem>
          <MenuItem tone="danger" onClick={() => setRemove({ type: "session", session: s })}>
            <Trash2 className="size-3.5" />
            删除
          </MenuItem>
        </OverflowMenu>
      </div>
    </div>
  );

  const planRow = (p: PlanDTO) => {
    const kids = planSessions(p.id);
    const open = openPlans.has(p.id);
    const planActive = pathname === `/plan/${p.id}`;
    return (
      <div key={p.id}>
        <div className={rowClass(planActive)}>
          <button
            type="button"
            onClick={() => (kids.length ? togglePlan(p.id) : router.push(`/plan/${p.id}`))}
            aria-expanded={kids.length ? open : undefined}
            aria-label={`计划 ${p.title}`}
            className="flex min-w-0 flex-1 items-center gap-1 py-1.5 pl-2 text-left text-[12.8px] text-ink2 transition-colors hover:text-ink"
          >
            {kids.length ? (
              <ChevronRight
                className={cx("size-3.5 shrink-0 text-ink3 transition-transform", open && "rotate-90")}
              />
            ) : (
              <span className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{p.title}</span>
            {kids.length ? (
              <span className="ml-0.5 shrink-0 text-[11px] text-ink3">{kids.length}</span>
            ) : null}
          </button>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => void togglePlanPin(p)}
              aria-label={p.pinnedAt ? "取消置顶" : "置顶计划"}
              title={p.pinnedAt ? "取消置顶" : "置顶"}
              className="grid size-6 place-items-center rounded-full text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
            >
              {p.pinnedAt ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            </button>
            <OverflowMenu compact ariaLabel="计划操作" align="right">
              <MenuItem onClick={() => setRename({ type: "plan", plan: p })}>
                <Pencil className="size-3.5" />
                重命名
              </MenuItem>
              <MenuItem onClick={() => void togglePlanPin(p)}>
                {p.pinnedAt ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                {p.pinnedAt ? "取消置顶" : "置顶"}
              </MenuItem>
              <MenuItem onClick={() => router.push(`/plan/${p.id}`)}>
                <ArrowUpRight className="size-3.5" />
                计划详细
              </MenuItem>
              <MenuItem tone="danger" onClick={() => setRemove({ type: "plan", plan: p })}>
                <Trash2 className="size-3.5" />
                删除
              </MenuItem>
            </OverflowMenu>
          </div>
        </div>
        {open ? (
          <div className="mb-1 flex flex-col gap-0.5">
            {kids.length ? (
              kids.map((s) => sessionRow(s, true))
            ) : (
              <p className="py-1 pl-9 text-[12px] text-ink3">还没有对话</p>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const hasPinned = pinnedSessions.length > 0 || pinnedPlans.length > 0;
  const empty = sessions.length === 0 && plans.length === 0;

  return (
    <>
      {empty ? <p className="px-3 py-2 text-[12px] text-ink3">还没有对话。</p> : null}

      {hasPinned ? (
        <section>
          <p className="px-3 pb-1 pt-2 text-[12px] text-ink3">置顶</p>
          <div className="flex flex-col gap-0.5">
            {pinnedPlans.map((p) => planRow(p))}
            {pinnedSessions.map((s) => sessionRow(s))}
          </div>
        </section>
      ) : null}

      {normalPlans.length ? (
        <section>
          <p className="px-3 pb-1 pt-3 text-[12px] text-ink3">计划</p>
          <div className="flex flex-col gap-0.5">{normalPlans.map((p) => planRow(p))}</div>
        </section>
      ) : null}

      {recent.length ? (
        <section>
          <p className="px-3 pb-1 pt-3 text-[12px] text-ink3">最近</p>
          <div className="flex flex-col gap-0.5">{recent.map((s) => sessionRow(s))}</div>
        </section>
      ) : null}

      {/* 重命名：会话和计划共用一个弹窗 */}
      <RenameDialog target={rename} onClose={() => setRename(null)} onDone={notify} />

      {/* 删除确认：计划会带走课程与知识点，必须讲清楚 */}
      <DeleteDialog
        target={remove}
        onClose={() => setRemove(null)}
        onDone={(target) => {
          if (target.type === "plan" && router && window.location.pathname === `/plan/${target.plan.id}`) {
            router.push("/plan");
          }
          notify();
        }}
      />

      <MoveDialog session={move} plans={plans} onClose={() => setMove(null)} onDone={notify} />
    </>
  );
}

function RenameDialog({
  target,
  onClose,
  onDone,
}: {
  target: Target | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const initial = target?.type === "session" ? target.session.title : (target?.plan.title ?? "");
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(initial);
    setError("");
  }, [initial, target]);

  const save = async () => {
    if (!target || !value.trim()) return;
    setSaving(true);
    setError("");
    const id = target.type === "session" ? target.session.id : target.plan.id;
    const url = target.type === "session" ? `/api/sessions/${id}` : `/api/plans/${id}`;
    const body =
      target.type === "session"
        ? { title: value.trim() }
        : { action: "update", title: value.trim() };
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message ?? "保存失败，稍后再试");
      return;
    }
    onClose();
    onDone();
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title="重命名"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving || !value.trim()}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      }
    >
      <input
        className={inputClass}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="名称"
        autoFocus
        maxLength={80}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
      />
      {error ? <p className="mt-2 text-[12px] text-bad">{error}</p> : null}
    </Modal>
  );
}

function DeleteDialog({
  target,
  onClose,
  onDone,
}: {
  target: Target | null;
  onClose: () => void;
  onDone: (target: Target) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setBusy(false);
    setError("");
  }, [target]);

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    setError("");
    const url =
      target.type === "session" ? `/api/sessions/${target.session.id}` : `/api/plans/${target.plan.id}`;
    const res = await fetch(url, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message ?? "删除失败，稍后再试");
      return;
    }
    onClose();
    onDone(target);
  };

  const title = target?.type === "session" ? target.session.title : (target?.plan.title ?? "");

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={target?.type === "session" ? "删除对话" : "删除计划"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="danger" onClick={() => void confirm()} disabled={busy}>
            {busy ? "删除中…" : "删除"}
          </Button>
        </div>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-ink2">
        {target?.type === "session" ? (
          <>
            「{title}」里的消息和练习会一起删掉，删了不能恢复。
          </>
        ) : (
          <>
            「{title}」里的课程和知识点会一起删掉，删了不能恢复；对话和材料只解除关联，不会删。
          </>
        )}
      </p>
      {error ? <p className="mt-2 text-[12px] text-bad">{error}</p> : null}
    </Modal>
  );
}

function MoveDialog({
  session,
  plans,
  onClose,
  onDone,
}: {
  session: SessionSummary | null;
  plans: PlanDTO[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [planId, setPlanId] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    setPlanId(session.planId ?? "");
    setCourseId(session.planItemId ?? "");
    setBusy(false);
    setError("");
  }, [session]);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const needsCourse = session?.mode === "infinite";
  const courses = plan?.items ?? [];

  useEffect(() => {
    if (!plan) return;
    if (needsCourse && !courses.some((c) => c.id === courseId)) {
      setCourseId(plan.currentCourseId ?? courses[0]?.id ?? "");
    }
  }, [plan, needsCourse, courseId, courses]);

  const submit = async () => {
    if (!session) return;
    if (planId && needsCourse && !courseId) {
      setError("无限学习的对话移入计划时要选一门课程");
      return;
    }
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = { planId: planId || null };
    if (planId && needsCourse) {
      body.planItemId = courseId;
      body.archive = true;
    }
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message ?? "移动失败，稍后再试");
      return;
    }
    onClose();
    onDone();
  };

  return (
    <Modal
      open={Boolean(session)}
      onClose={onClose}
      title="移至计划"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "移动中…" : "移动"}
          </Button>
        </div>
      }
    >
      <div className="flex max-h-[46vh] flex-col gap-1 overflow-y-auto">
        {session?.planId ? (
          <button
            type="button"
            onClick={() => setPlanId("")}
            className={cx(
              "rounded-xl px-3 py-2 text-left text-[13px] transition-colors",
              planId === "" ? "bg-accentsoft text-accentink" : "text-ink2 hover:bg-panel2",
            )}
          >
            不归入计划
          </button>
        ) : null}
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlanId(p.id)}
            className={cx(
              "rounded-xl px-3 py-2 text-left text-[13px] transition-colors",
              planId === p.id ? "bg-accentsoft text-accentink" : "text-ink2 hover:bg-panel2",
            )}
          >
            <span className="block truncate">{p.title}</span>
            <span className="mt-0.5 block text-[12px] text-ink3">
              {p.items.length} 门课程 · {p.counts.sessions} 个对话
            </span>
          </button>
        ))}
        {plans.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-ink3">还没有计划。</p>
        ) : null}
      </div>

      {plan && needsCourse ? (
        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] text-ink3">这门对话跟着哪门课程</span>
          <select
            className={inputClass}
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            aria-label="课程"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? <p className="mt-2 text-[12px] text-bad">{error}</p> : null}
    </Modal>
  );
}