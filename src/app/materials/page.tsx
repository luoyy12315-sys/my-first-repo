"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, EmptyState, Modal, PageHeader, SectionHeader, Spinner, cx } from "@/components/ui/kit";
import { PlanSelect, usePlans } from "@/components/PlanSelect";
import type { MaterialDTO } from "@/lib/types";
import { groupByPlan } from "@/lib/utils";

export default function MaterialsPage({ embedded = false }: { embedded?: boolean }) {
  const { plans } = usePlans();
  const [materials, setMaterials] = useState<MaterialDTO[]>([]);
  const [planFilter, setPlanFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MaterialDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [focusChunk, setFocusChunk] = useState<{
    id: string;
    materialId: string;
    material: string;
    page: number | null;
    heading: string | null;
    text: string;
  } | null>(null);
  const [chunkMissing, setChunkMissing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/materials", { cache: "no-store" });
      if (res.ok) {
        setMaterials(((await res.json()) as { materials: MaterialDTO[] }).materials);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // 从会话里点回形针进来时带着回程，上传完能直接回去继续问
    const params = new URLSearchParams(window.location.search);
    const back = params.get("returnTo");
    if (back && back.startsWith("/")) setReturnTo(back);
    // 计划页计数点进来时，预选对应计划
    const plan = params.get("plan");
    if (plan) setPlanFilter(plan);

    // 来源卡片点过来的定位：把那一段原文显示出来
    const chunkId = params.get("chunk");
    if (chunkId) {
      void (async () => {
        const res = await fetch(`/api/chunks/${encodeURIComponent(chunkId)}`, { cache: "no-store" });
        const data = (await res.json()) as { chunk?: typeof focusChunk; error?: string };
        if (res.ok && data.chunk) {
          setFocusChunk(data.chunk);
          setTimeout(() => {
            document
              .getElementById(`material-${data.chunk!.materialId}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 250);
        } else {
          setChunkMissing(data.error ?? "材料片段不存在");
        }
      })();
    }
  }, [load]);

  useEffect(() => {
    if (planFilter !== "all" && planFilter !== "none" && plans.length > 0 && !plans.some((p) => p.id === planFilter)) {
      setPlanFilter("all");
    }
  }, [plans, planFilter]);

  const selectedPlan = planFilter !== "all" && planFilter !== "none" ? plans.find((p) => p.id === planFilter) ?? null : null;

  const filteredMaterials = useMemo(
    () =>
      materials.filter((m) =>
        planFilter === "all" ? true : planFilter === "none" ? !m.planId : m.planId === planFilter,
      ),
    [materials, planFilter],
  );
  const groups = useMemo(() => groupByPlan(filteredMaterials), [filteredMaterials]);

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const targetPlanId = selectedPlan ? selectedPlan.id : null;
    setUploading(true);
    for (const f of list) {
      const form = new FormData();
      form.append("file", f);
      if (targetPlanId) form.append("planId", targetPlanId);
      try {
        const res = await fetch("/api/materials", { method: "POST", body: form });
        const data = (await res.json()) as { error?: string; status?: string };
        if (!res.ok) {
          toast.error(`${f.name}：${data.error ?? "上传失败"}`);
        } else if (data.status === "parsed") {
          toast.success(`${f.name} 已解析`);
          setUploadedCount((n) => n + 1);
        } else {
          toast.message(`${f.name}：${data.error ?? "无法解析"}`);
        }
      } catch (e) {
        toast.error(`${f.name}：${(e as Error).message}`);
      }
    }
    setUploading(false);
    await load();
  };

  const assign = async (materialId: string, planId: string | null) => {
    const res = await fetch(`/api/materials/${materialId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    if (!res.ok) {
      toast.error("调整归属失败");
      return;
    }
    const planTitle = planId ? plans.find((p) => p.id === planId)?.title ?? null : null;
    setMaterials((list) => list.map((m) => (m.id === materialId ? { ...m, planId, planTitle } : m)));
    toast.success(planId ? `已归入「${planTitle}」` : "已移出计划");
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/materials/${pendingDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "删除失败");
      }
      setMaterials((m) => m.filter((x) => x.id !== pendingDelete.id));
      setPendingDelete(null);
      toast.success("材料已删除");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10"}>
      {focusChunk ? (
        <div className="mb-4 rounded-xl border border-accent/30 bg-accentsoft/30 px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">引用来源</Badge>
            <span className="text-[12.5px] text-ink">
              《{focusChunk.material}》
              {focusChunk.page ? ` 第 ${focusChunk.page} 页` : ""}
              {focusChunk.heading ? ` · ${focusChunk.heading}` : ""}
            </span>
            <button
              onClick={() => setFocusChunk(null)}
              className="ml-auto rounded-full px-2 py-0.5 text-[12px] text-ink3 hover:bg-panel2 hover:text-ink"
            >
              收起
            </button>
          </div>
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-panel/70 px-3 py-2 text-[12px] leading-relaxed text-ink2">
            {focusChunk.text}
          </p>
        </div>
      ) : chunkMissing ? (
        <p className="mb-4 rounded-xl border border-warn/30 bg-warnsoft/50 px-3.5 py-2.5 text-[12px] text-ink2">
          {chunkMissing}（可能这份材料已被删除）
        </p>
      ) : null}

      {returnTo ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-accentsoft/40 px-3.5 py-2.5">
          <Link
            href={returnTo}
            className="flex items-center gap-1.5 text-[12.5px] text-accentink hover:underline"
          >
            <ArrowLeft className="size-3.5" /> 回到对话
          </Link>
          <span className="text-[12px] text-ink3">
            {uploadedCount > 0
              ? `已上传 ${uploadedCount} 份材料，回去后可以直接让 AI 引用它们。`
              : "上传完可以直接回到刚才那段对话继续问。"}
          </span>
        </div>
      ) : null}

      {embedded ? null : <PageHeader title="学习材料" />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-ink3">
          计划
          <PlanSelect
            plans={plans}
            mode="filter"
            value={planFilter}
            onChange={setPlanFilter}
            className="max-w-[220px] rounded-full border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink2 outline-none hover:border-linestrong"
            ariaLabel="按计划筛选材料"
          />
        </label>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cx(
          "mb-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center transition-colors",
          drag ? "border-accent bg-accentsoft/40" : "border-line bg-panel/60 hover:border-linestrong",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files && void upload(e.target.files)}
        />
        {uploading ? <Spinner /> : <Upload className="size-5 text-ink3" />}
        <p className="text-[13.5px] text-ink">{uploading ? "正在解析…" : "拖入文件，或点击选择"}</p>
        <p className="text-[12px] text-ink3">
          {selectedPlan ? `将归入「${selectedPlan.title}」` : "将归入：未归类"}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[13px] text-ink3">
          <Spinner /> 读取中…
        </div>
      ) : filteredMaterials.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title={
            materials.length === 0
              ? "还没有材料"
              : `「${selectedPlan?.title ?? "未归类"}」下还没有材料`
          }
          description={
            materials.length === 0
              ? "不传也能学；传了回答会引用它们。"
              : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.planId ?? "ungrouped"}>
              <SectionHeader title={g.planTitle} />
              <div className="flex flex-col gap-1.5">
                {g.items.map((m) => (
                  <div
                    key={m.id}
                    id={`material-${m.id}`}
                    className={cx(
                      "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-panel px-3.5 py-2.5",
                      focusChunk?.materialId === m.id && "border-accent/60 bg-accentsoft/25",
                    )}
                  >
                    <FileText className="size-4 shrink-0 text-ink3" />
                    <div className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-0">
                      <p className="truncate text-[13.5px] text-ink">{m.name}</p>
                      <p className="mt-0.5 text-[12px] text-ink3">
                        {formatSize(m.size)}
                        {m.status === "parsed" ? ` · ${m.textChars.toLocaleString()} 字 · ${m.chunks} 段` : ""}
                        {m.error ? ` · ${m.error}` : ""}
                      </p>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <Badge tone={m.status === "parsed" ? "ok" : m.status === "failed" ? "bad" : "warn"}>
                        {m.status === "parsed" ? "已解析" : m.status === "failed" ? "解析失败" : "不支持"}
                      </Badge>
                      {plans.length > 0 ? (
                        <PlanSelect
                          plans={plans}
                          mode="assign"
                          value={m.planId ?? ""}
                          onChange={(v) => void assign(m.id, v || null)}
                          title={m.planTitle ? `当前归属：${m.planTitle}` : "未归类，点击更换"}
                          className="max-w-[190px] shrink-0 rounded-full border border-line bg-panel px-2 py-1 text-[12px] text-ink2 outline-none hover:border-linestrong sm:max-w-[240px]"
                          ariaLabel={`调整「${m.name}」所属计划`}
                        />
                      ) : null}
                      <button
                        onClick={() => setPendingDelete(m)}
                        className="rounded-full p-1.5 text-ink3 hover:bg-badsoft hover:text-bad"
                        title="删除材料"
                        aria-label={`删除材料 ${m.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="删除这份材料？"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={remove}>
              确认删除
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink2">
          将删除「{pendingDelete?.name}」及其解析出的
          <strong className="text-ink"> {pendingDelete?.chunks ?? 0} 个文本片段</strong>
          ，磁盘上的文件也会一并删除。
        </p>
        <p className="mt-2 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink2">
          这个操作不可恢复，也没有回收站。已有的对话与学习记录不受影响，只是之后讲解不会再引用它。
        </p>
      </Modal>

      <details className="group mt-6 rounded-xl border border-line bg-panel2/40 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-ink2 [&::-webkit-details-marker]:hidden">
          支持格式与限制
          <ChevronDown className="size-3.5 shrink-0 text-ink3 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 flex flex-col gap-1">
          <p>· 支持 txt / md / csv / json / html / pdf / docx，单个 ≤ 20MB。</p>
          <p>· PDF 只提取文本层；扫描件需要 OCR，当前不支持，会明确报错。</p>
          <p>· 旧版 .doc 与 PPTX 暂未启用，请先另存为 .docx / PDF。</p>
          <p>· 材料中的内容会被当作"待分析的数据"，其中的任何指令都不会被执行。</p>
          <p>· 没有页码时只标注来源文件与段落，不编造页码。</p>
        </div>
      </details>
    </div>
  );
}



