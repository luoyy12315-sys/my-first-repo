import {
  addConceptToCourse,
  addPlanCourse,
  confirmPlan,
  deletePlan,
  deletePlanCourse,
  getPlan,
  listPlans,
  movePlanCourse,
  removeConceptFromCourse,
  renameConcept,
  setPlanCourseSkipped,
  setPlanStatus,
  updatePlanCourse,
  updatePlanMeta,
} from "@/lib/db/repo";
import { fail, handleError, ok, readJson } from "@/lib/api/helpers";

export const runtime = "nodejs";

interface PlanPatchBody {
  action?: string;
  title?: string;
  note?: string | null;
  itemId?: string;
  conceptId?: string;
  name?: string;
  definition?: string;
  description?: string | null;
  direction?: "up" | "down";
  skipped?: boolean;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const plan = getPlan(id);
    if (!plan) return fail(404, "计划不存在");
    return ok({ plan });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!getPlan(id)) return fail(404, "计划不存在");
    const body = await readJson<PlanPatchBody>(req);
    const action = body.action;

    if (action === "confirm") {
      const current = getPlan(id)!;
      if (!current.items.length) return fail(400, "至少添加一门课程后再确认");
      if (!current.items.some((item) => item.concepts.length > 0)) {
        return fail(400, "至少为一个课程添加知识点后再确认");
      }
      const plan = confirmPlan(id);
      return ok({ plan });
    }

    if (action === "pause" || action === "resume") {
      const plan = setPlanStatus(id, action === "pause" ? "paused" : "active");
      return plan ? ok({ plan }) : fail(404, "计划不存在");
    }

    if (action === "update") {
      if (body.title !== undefined && !body.title.trim()) return fail(400, "计划名称不能为空");
      const plan = updatePlanMeta(id, { title: body.title, note: body.note });
      if (!plan) return fail(400, "计划名称不能为空");
      return ok({ plan });
    }

    if (action === "addCourse") {
      if (!body.title?.trim()) return fail(400, "课程名称不能为空");
      const plan = addPlanCourse(id, { title: body.title, description: body.description ?? undefined });
      return plan ? ok({ plan }) : fail(404, "计划不存在");
    }

    if (action === "addConcept") {
      if (!body.itemId) return fail(400, "缺少课程 id");
      if (!body.name?.trim()) return fail(400, "知识点名称不能为空");
      const result = addConceptToCourse(id, body.itemId, {
        name: body.name,
        definition: body.definition,
      });
      if (!result.plan) return fail(404, "课程不存在");
      if (result.conflict) return fail(409, "这个知识点已属于另一门课程；请先在档案中合并或移除");
      return ok({ plan: result.plan, created: result.created });
    }

    if (action === "removeConcept") {
      if (!body.conceptId) return fail(400, "缺少知识点 id");
      const plan = removeConceptFromCourse(id, body.conceptId);
      return plan ? ok({ plan }) : fail(404, "知识点不在该计划中");
    }

    if (action === "renameConcept") {
      if (!body.conceptId) return fail(400, "缺少知识点 id");
      const result = renameConcept(id, body.conceptId, body.name ?? "");
      if (!result.ok) {
        if (result.conflictId) return fail(409, "已有同名知识点；请先在档案中合并");
        return fail(404, "知识点不在该计划中");
      }
      return ok({ plan: result.plan });
    }

    if (!body.itemId) return fail(400, "缺少课程 id");
    const item = getPlan(id)?.items.find((candidate) => candidate.id === body.itemId);
    if (!item) return fail(404, "课程不存在");

    if (action === "updateCourse") {
      if (body.title !== undefined && !body.title.trim()) return fail(400, "课程名称不能为空");
      const plan = updatePlanCourse(id, body.itemId, {
        title: body.title,
        description: body.description,
      });
      return plan ? ok({ plan }) : fail(404, "课程不存在");
    }

    if (action === "deleteCourse") {
      const plan = deletePlanCourse(id, body.itemId);
      return plan ? ok({ plan }) : fail(404, "课程不存在");
    }

    if (action === "moveCourse") {
      if (body.direction !== "up" && body.direction !== "down") return fail(400, "方向不合法");
      const plan = movePlanCourse(id, body.itemId, body.direction);
      return plan ? ok({ plan }) : fail(404, "课程不存在");
    }

    if (action === "skipCourse") {
      const plan = setPlanCourseSkipped(id, body.itemId, Boolean(body.skipped));
      return plan ? ok({ plan }) : fail(404, "课程不存在");
    }

    return fail(400, "未知操作");
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!getPlan(id)) return fail(404, "计划不存在");
    deletePlan(id);
    return ok({ deleted: true, plans: listPlans() });
  } catch (e) {
    return handleError(e);
  }
}
