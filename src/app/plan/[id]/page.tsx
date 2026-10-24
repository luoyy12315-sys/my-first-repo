"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  Progress,
  Spinner,
  StatusPill,
  cx,
} from "@/components/ui/kit";
import { planStatusText } from "@/components/plan/PlanCard";
import type { PlanDTO } from "@/lib/types";

const COURSE_LABEL: Record<string, string> = {
  pending: "待开始",
  in_progress: "进行中",
  done: "已完成",
  skipped: "已跳过",
  unconfigured: "未配置知识点",
};

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [courseDrafts, setCourseDrafts] = useState<Record<string, { title: string; description: string }>>({});
  const [conceptDrafts, setConceptDrafts] = useState<Record<string, string>>({});
  const [conceptInputs, setConceptInputs] = useState<Record<string, string>>({});
  const [newCourse, setNewCourse] = useState({ title: "", description: "" });
  const [pendingCourse, setPendingCourse] = useState<PlanDTO["items"][number] | null>(null);
  const [pendingConcept, setPendingConcept] = useState<{ id: string; name: string } | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaDraft, setMetaDraft] = useState({ title: "", note: "" });
  // 课程默认只展开"当前这门"：30 个知识点全摊开等于让用户自己找重点
  const [openCourses, setOpenCourses] = useState<Record<string, boolean>>({});

  const applyPlan = useCallback((next: PlanDTO) => {
    setPlan(next);
    setCourseDrafts(
      Object.fromEntries(
        next.items.map((item) => [
          item.id,
          { title: item.title, description: item.description ?? "" },
        ]),
      ),
    );
    setConceptDrafts(
      Object.fromEntries(next.items.flatMap((item) => item.concepts.map((c) => [c.id, c.name]))),
    );
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans/${id}`, { cache: "no-store" });
      const data = (await res.json()) as { plan?: PlanDTO; error?: string };
      if (!res.ok || !data.plan) throw new Error(data.error ?? "计划不存在");
      applyPlan(data.plan);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, applyPlan]);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener("plans:changed", onChange);
    return () => window.removeEventListener("plans:changed", onChange);
  }, [load]);

  const patch = useCallback(
    async (payload: Record<string, unknown>, key = "plan") => {
      setBusy(key);
      try {
        const res = await fetch(`/api/plans/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as { plan?: PlanDTO; error?: string };
        if (!res.ok || !data.plan) throw new Error(data.error ?? "操作失败");
        applyPlan(data.plan);
        if (payload.action === "confirm") setEditMode(false);
        window.dispatchEvent(new Event("plans:changed"));
        window.dispatchEvent(new Event("sessions:changed"));
        return data.plan;
      } catch (e) {
        toast.error((e as Error).message);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [id, applyPlan],
  );

  const complete = useMemo(
    () =>
      Boolean(
        plan &&
          plan.progress.coursesTotal > 0 &&
          plan.progress.coursesDone === plan.progress.coursesTotal &&
          plan.progress.unconfiguredCourses === 0,
      ),
    [plan],
  );

  // 当前课程：进行中的那门；没有就取第一门还没开始的
  const defaultOpenId = useMemo(() => {
    if (!plan) return null;
    return (
      plan.items.find((i) => i.status === "in_progress")?.id ??
      plan.items.find((i) => i.status === "pending")?.id ??
      null
    );
  }, [plan]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-10 text-[13px] text-ink3 md:px-8">
        <Spinner /> 读取计划…
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <EmptyState
          title="计划不存在"
          description={error ?? "它可能已经被删除。"}
          action={
            <Link href="/plan">
              <Button variant="secondary">返回计划列表</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const statusText = planStatusText(plan);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-ink3">
        <Link href="/plan" className="flex items-center gap-1 hover:text-ink">
          <ArrowLeft className="size-3.5" /> 目标学习
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-[25px] leading-tight tracking-tight text-ink">{plan.title}</h1>
            <Badge
              tone={
                plan.status === "draft"
                  ? "warn"
                  : complete
                    ? "ok"
                    : plan.status === "paused"
                      ? "neutral"
                      : "accent"
              }
            >
              {statusText}
            </Badge>
          </div>
          {plan.note ? (
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink2">{plan.note}</p>
          ) : null}
          <p className="mt-1 text-[12px] text-ink3">
            {plan.items.length} 门课程 · {plan.progress.conceptsMastered}/{plan.progress.conceptsTotal} 个知识点已掌握
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            icon={<Pencil className="size-3.5" />}
            onClick={() => {
              setMetaDraft({ title: plan.title, note: plan.note ?? "" });
              setMetaOpen(true);
            }}
          >
            计划信息
          </Button>
          {plan.status === "draft" ? (
            <Button
              size="sm"
              loading={busy === "confirm"}
              onClick={() => void patch({ action: "confirm" }, "confirm")}
            >
              确认计划
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              loading={busy === "pause"}
              onClick={() =>
                void patch({ action: plan.status === "paused" ? "resume" : "pause" }, "pause")
              }
            >
              {plan.status === "paused" ? "恢复计划" : "暂停计划"}
            </Button>
          )}
          <Button
            size="sm"
            variant={editMode ? "ghost" : "secondary"}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? "完成编辑" : "编辑课程"}
          </Button>
        </div>
      </div>

      {plan.status === "draft" ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warnsoft/40 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            这是计划草稿，还没有开始学习。先看一遍课程与知识点，没问题就确认；需要改就点右上角「编辑课程」。
          </span>
        </div>
      ) : null}
      {plan.status === "paused" ? (
        <div className="mb-4 rounded-xl border border-line bg-panel2/50 px-3.5 py-2.5 text-[12.5px] text-ink2">
          计划已暂停，进度会保留。恢复后可以从当前课程继续。
        </div>
      ) : null}

      <div className="mb-5 rounded-2xl border border-line bg-panel p-4">
        <div className="mb-1 flex items-center justify-between text-[12px] text-ink3">
          <span>学习进度</span>
          <span className="tabular-nums">{plan.progress.percent}%</span>
        </div>
        <Progress value={plan.progress.percent} max={100} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink3">
          <span>已完成课程 {plan.progress.coursesDone}/{plan.progress.coursesTotal}</span>
          <span>已掌握知识点 {plan.progress.conceptsMastered}/{plan.progress.conceptsTotal}</span>
          {plan.progress.unconfiguredCourses > 0 ? (
            <span className="text-warn">
              {plan.progress.unconfiguredCourses} 门课程未配置知识点，不计入完成率
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {plan.items.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-6" />}
            title="还没有课程"
            description="至少添加一门课程和一个知识点，才能确认计划并开始学习。"
            action={
              <Button size="sm" variant="secondary" onClick={() => setEditMode(true)}>
                添加课程
              </Button>
            }
          />
        ) : (
          plan.items.map((course, index) => {
            const draft = courseDrafts[course.id] ?? {
              title: course.title,
              description: course.description ?? "",
            };
            const isOpen = editMode || (openCourses[course.id] ?? course.id === defaultOpenId);
            return (
              <section key={course.id} className="rounded-2xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {editMode ? (
                      <div className="flex flex-col gap-2">
                        <input
                          value={draft.title}
                          onChange={(e) =>
                            setCourseDrafts((d) => ({
                              ...d,
                              [course.id]: { ...draft, title: e.target.value },
                            }))
                          }
                          className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[14px] text-ink outline-none focus:border-accent"
                          aria-label="课程名称"
                        />
                        <textarea
                          value={draft.description}
                          onChange={(e) =>
                            setCourseDrafts((d) => ({
                              ...d,
                              [course.id]: { ...draft, description: e.target.value },
                            }))
                          }
                          rows={2}
                          placeholder="这门课程学什么（可选）"
                          className="resize-y rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent"
                          aria-label="课程说明"
                        />
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === `course-${course.id}`}
                            onClick={() =>
                              void patch(
                                {
                                  action: "updateCourse",
                                  itemId: course.id,
                                  title: draft.title,
                                  description: draft.description || null,
                                },
                                `course-${course.id}`,
                              )
                            }
                          >
                            保存课程信息
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            onClick={() =>
                              setOpenCourses((map) => ({ ...map, [course.id]: !isOpen }))
                            }
                            aria-expanded={isOpen}
                            aria-controls={`course-${course.id}`}
                            className="-ml-1 flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-panel2"
                            title={isOpen ? "收起课程" : "展开课程"}
                          >
                            <ChevronRight
                              className={cx(
                                "size-3.5 shrink-0 text-ink3 transition-transform",
                                isOpen && "rotate-90",
                              )}
                            />
                            <h2 className="truncate font-serif text-[16px] text-ink">
                              {course.title}
                            </h2>
                          </button>
                          <Badge
                            tone={
                              course.status === "done"
                                ? "ok"
                                : course.status === "skipped"
                                  ? "neutral"
                                  : course.status === "unconfigured"
                                    ? "warn"
                                    : "accent"
                            }
                          >
                            {COURSE_LABEL[course.status]}
                          </Badge>
                          <span className="text-[12px] tabular-nums text-ink3">
                            已掌握 {course.progress.mastered}/{course.progress.total}
                          </span>
                        </div>
                        {course.description ? (
                          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">
                            {course.description}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {editMode ? (
                      <>
                        <button
                          onClick={() => void patch({ action: "moveCourse", itemId: course.id, direction: "up" }, `move-${course.id}`)}
                          disabled={index === 0}
                          className="rounded-full p-1.5 text-ink3 hover:bg-panel2 disabled:opacity-25"
                          title="上移课程"
                          aria-label="上移课程"
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          onClick={() => void patch({ action: "moveCourse", itemId: course.id, direction: "down" }, `move-${course.id}`)}
                          disabled={index === plan.items.length - 1}
                          className="rounded-full p-1.5 text-ink3 hover:bg-panel2 disabled:opacity-25"
                          title="下移课程"
                          aria-label="下移课程"
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button
                          onClick={() => setPendingCourse(course)}
                          className="rounded-full p-1.5 text-ink3 hover:bg-badsoft hover:text-bad"
                          title="删除课程"
                          aria-label="删除课程"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    ) : null}
                    {plan.status !== "draft" && course.status !== "skipped" ? (
                      <Link
                        href={`/plan/${plan.id}/course/${course.id}`}
                        className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink2 hover:border-accent hover:text-accentink"
                      >
                        {course.progress.mastered > 0 || course.status === "in_progress"
                          ? "继续学习"
                          : "进入课程"}
                      </Link>
                    ) : null}
                  </div>
                </div>

                {isOpen ? (
                  <Progress value={course.progress.percent} max={100} className="mt-2.5" />
                ) : null}

                {isOpen ? (
                  <div id={`course-${course.id}`} className="mt-3 flex flex-col gap-1.5">
                  {course.concepts.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-warn/40 bg-warnsoft/30 px-2.5 py-2 text-[12px] text-warn">
                      这门课程还没有知识点，不会计入完成率。请在编辑模式下添加。
                    </p>
                  ) : (
                    course.concepts.map((concept) => (
                      <div
                        key={concept.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-line/70 px-2.5 py-1.5"
                      >
                        {editMode ? (
                          <input
                            value={conceptDrafts[concept.id] ?? concept.name}
                            onChange={(e) =>
                              setConceptDrafts((d) => ({ ...d, [concept.id]: e.target.value }))
                            }
                            onBlur={() => {
                              const next = (conceptDrafts[concept.id] ?? "").trim();
                              if (next && next !== concept.name) {
                                void patch({
                                  action: "renameConcept",
                                  conceptId: concept.id,
                                  name: next,
                                });
                              }
                            }}
                            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12.5px] text-ink outline-none hover:border-line focus:border-accent"
                            aria-label="知识点名称"
                          />
                        ) : plan.status === "draft" ? (
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                            {concept.name}
                          </span>
                        ) : (
                          <Link
                            href={`/library?c=${concept.id}`}
                            className="min-w-0 flex-1 truncate text-[12.5px] text-ink hover:text-accentink"
                          >
                            {concept.name}
                          </Link>
                        )}
                        <StatusPill
                          status={concept.status}
                          displayStatus={concept.displayStatus}
                          introduced={Boolean(concept.introducedAt)}
                        />
                        {editMode ? (
                          <button
                            onClick={() =>
                              setPendingConcept({ id: concept.id, name: concept.name })
                            }
                            className="rounded p-1 text-ink3 hover:bg-badsoft hover:text-bad"
                            title="删除这个知识点（连同作答证据）"
                            aria-label={`删除知识点 ${concept.name}`}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}

                  {editMode ? (
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        value={conceptInputs[course.id] ?? ""}
                        onChange={(e) =>
                          setConceptInputs((d) => ({ ...d, [course.id]: e.target.value }))
                        }
                        placeholder="添加知识点名称"
                        className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus className="size-3" />}
                        loading={busy === `addconcept-${course.id}`}
                        onClick={async () => {
                          const name = (conceptInputs[course.id] ?? "").trim();
                          if (!name) return;
                          const next = await patch(
                            { action: "addConcept", itemId: course.id, name },
                            `addconcept-${course.id}`,
                          );
                          if (next) setConceptInputs((d) => ({ ...d, [course.id]: "" }));
                        }}
                      >
                        添加
                      </Button>
                    </div>
                  ) : null}
                  </div>
                ) : null}

                {editMode && plan.status !== "draft" ? (
                  <button
                    onClick={() =>
                      void patch({
                        action: "skipCourse",
                        itemId: course.id,
                        skipped: course.status !== "skipped",
                      })
                    }
                    className="mt-2 text-[12px] text-ink3 hover:text-ink"
                  >
                    {course.status === "skipped" ? "恢复这门课程" : "跳过这门课程"}
                  </button>
                ) : null}
              </section>
            );
          })
        )}

        {editMode ? (
          <section className="rounded-2xl border border-dashed border-line p-4">
            <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink3">
              添加课程
            </h2>
            <div className="flex flex-col gap-2">
              <input
                value={newCourse.title}
                onChange={(e) => setNewCourse((c) => ({ ...c, title: e.target.value }))}
                placeholder="课程/学习单元名称"
                className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
              />
              <input
                value={newCourse.description}
                onChange={(e) => setNewCourse((c) => ({ ...c, description: e.target.value }))}
                placeholder="课程说明（可选）"
                className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent"
              />
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="size-3.5" />}
                loading={busy === "addcourse"}
                onClick={async () => {
                  if (!newCourse.title.trim()) return;
                  const next = await patch(
                    {
                      action: "addCourse",
                      title: newCourse.title,
                      description: newCourse.description || undefined,
                    },
                    "addcourse",
                  );
                  if (next) setNewCourse({ title: "", description: "" });
                }}
              >
                添加课程
              </Button>
            </div>
          </section>
        ) : null}
      </div>

      {plan.items.length > 0 && plan.status === "draft" ? (
        <div className="mt-5 flex justify-end">
          <Button
            loading={busy === "confirm-bottom"}
            onClick={() => void patch({ action: "confirm" }, "confirm-bottom")}
          >
            确认并开始目标学习
          </Button>
        </div>
      ) : null}

      <Modal
        open={Boolean(pendingCourse)}
        onClose={() => setPendingCourse(null)}
        title="删除这门课程？"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPendingCourse(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (!pendingCourse) return;
                const removed = pendingCourse.concepts.length;
                const next = await patch(
                  { action: "deleteCourse", itemId: pendingCourse.id },
                  "deletecourse",
                );
                if (next) {
                  setPendingCourse(null);
                  toast.success(
                    removed > 0
                      ? `课程已删除，同时移除 ${removed} 个知识点`
                      : "课程已删除",
                  );
                }
              }}
            >
              确认删除
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink2">
          「{pendingCourse?.title}」会从计划中移除，课程里的 {pendingCourse?.concepts.length ?? 0}{" "}
          个知识点会
          <span className="font-medium text-bad">一起删除</span>，无法撤销。
        </p>
        <p className="mt-2 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink2">
          这些知识点上的作答记录与掌握度证据会一起清空；对话历史保留。
          仍被其它课程使用的知识点只会解除本课程的归属，不会被删除。
        </p>
      </Modal>

      <Modal
        open={Boolean(pendingConcept)}
        onClose={() => setPendingConcept(null)}
        title="删除这个知识点？"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPendingConcept(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={busy === "removeconcept"}
              onClick={async () => {
                if (!pendingConcept) return;
                const name = pendingConcept.name;
                const next = await patch(
                  { action: "removeConcept", conceptId: pendingConcept.id },
                  "removeconcept",
                );
                if (next) {
                  setPendingConcept(null);
                  toast.success(`已删除知识点「${name}」`);
                }
              }}
            >
              删除
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink2">
          「{pendingConcept?.name}」会从课程里移除并
          <span className="font-medium text-bad">删除</span>
          ，无法撤销。
        </p>
        <p className="mt-2 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink2">
          它上面的作答记录与掌握度证据会一起清空；对话历史保留。
          仍被其它课程使用的知识点只会解除本课程的归属，不会被删除。
        </p>
      </Modal>

      <Modal
        open={metaOpen}
        onClose={() => setMetaOpen(false)}
        title="计划信息"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMetaOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              loading={busy === "meta"}
              onClick={async () => {
                const next = await patch(
                  { action: "update", title: metaDraft.title, note: metaDraft.note || null },
                  "meta",
                );
                if (next) setMetaOpen(false);
              }}
            >
              保存
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <label className="text-[12px] text-ink3">
            计划名称
            <input
              value={metaDraft.title}
              onChange={(e) => setMetaDraft((m) => ({ ...m, title: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="text-[12px] text-ink3">
            学习目标 / 说明
            <textarea
              value={metaDraft.note}
              onChange={(e) => setMetaDraft((m) => ({ ...m, note: e.target.value }))}
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
