"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowDown, BookMarked, Check, Copy, FileText, FolderOpen, Sparkles, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import Composer from "./Composer";
import NextActions from "./NextActions";
import BlockRenderer from "@/components/blocks/BlockRenderer";
import Markdown from "@/components/Markdown";
import SourceCards from "@/components/chat/SourceCards";
import ErrorBoundary from "@/components/blocks/ErrorBoundary";
import { Badge, Button, EmptyState, Modal, Spinner, cx } from "@/components/ui/kit";
import { PlanSelect, usePlans } from "@/components/PlanSelect";
import type { BlockWithExercise } from "@/lib/api/serialize";
import type { AiModelPublic, AiStatus, MessageDTO, MessagePart, PlanDTO, SourceDTO } from "@/lib/types";
import { stripPartialCitation } from "@/lib/ai/citations";

interface SessionData {
  id: string;
  title: string;
  mode: "free" | "goal" | "review";
  /** 归属的学习计划；为空表示未归类 */
  planId?: string | null;
  planTitle?: string | null;
  planItemId?: string | null;
  focusConceptId?: string | null;
  focusConceptName?: string | null;
  /** 本会话固定使用的模型；null 表示跟随默认 */
  modelId?: string | null;
  summary: string | null;
  resumeHint: string | null;
  topics: { id: string; name: string }[];
  messageCount: number;
}

export default function SessionView({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [blocks, setBlocks] = useState<Record<string, BlockWithExercise>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamParts, setStreamParts] = useState<MessagePart[]>([]);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [ai, setAi] = useState<AiStatus | undefined>();
  const [models, setModels] = useState<AiModelPublic[]>([]);
  const { plans } = usePlans();
  const [switchingModel, setSwitchingModel] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [withEvidence, setWithEvidence] = useState(false);
  // 联网开关只存在本地，不写会话；刷新后保留
  const [webMode, setWebMode] = useState<"off" | "manual">("off");
  const [webConfigured, setWebConfigured] = useState(false);
  const [webStatusLine, setWebStatusLine] = useState<string | null>(null);
  const [liveSources, setLiveSources] = useState<SourceDTO[]>([]);
  const [advancing, setAdvancing] = useState(false);
  const advancingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const autoSent = useRef(false);
  const sendingRef = useRef(false);
  const initialScrollDone = useRef(false);
  const followLatest = useRef(true);
  const lastScrollY = useRef(0);
  const scrollFrame = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sRes, hRes, mRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}`, { cache: "no-store" }),
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/models", { cache: "no-store" }),
      ]);
      if (!sRes.ok) throw new Error("会话不存在或已被删除");
      const data = (await sRes.json()) as {
        session: SessionData;
        messages: MessageDTO[];
        blocks: BlockWithExercise[];
      };
      setSession(data.session);
      setTitleDraft(data.session.title);
      setMessages(data.messages);
      setBlocks(Object.fromEntries(data.blocks.map((b) => [b.id, b])));
      if (hRes.ok) {
        const h = (await hRes.json()) as { ai: AiStatus };
        setAi(h.ai);
      }
      if (mRes.ok) {
        const m = (await mRes.json()) as { models: AiModelPublic[] };
        setModels(m.models ?? []);
      }
      const wRes = await fetch("/api/settings/web", { cache: "no-store" });
      if (wRes.ok) {
        const w = (await wRes.json()) as { defaultMode?: "off" | "manual"; configured?: boolean };
        setWebConfigured(Boolean(w.configured));
        const saved = (typeof window !== "undefined" ? window.localStorage.getItem("lumina-web-mode") : null) as
          | "off"
          | "manual"
          | null;
        setWebMode(saved ?? w.defaultMode ?? "off");
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 作答/小测可能刚把会话绑定到计划步骤；刷新会话，避免 planItemId 还是旧值
  useEffect(() => {
    const onProgress = () => void load();
    window.addEventListener("session:progress", onProgress);
    return () => window.removeEventListener("session:progress", onProgress);
  }, [load]);

  // 可用性按"当前会话实际用哪个模型"判断，而不是全局默认：
  // 否则默认模型缺 Key、但用户已切到另一个可用模型时，发送按钮仍会被禁用。
  const effectiveAi = useMemo<AiStatus | undefined>(() => {
    if (!ai) return ai;
    const active = session?.modelId
      ? models.find((m) => m.id === session.modelId)
      : models.find((m) => m.isDefault);
    if (!active) return ai;
    return {
      ...ai,
      configured: active.configured,
      model: active.model,
      label: active.label,
      modelId: active.id,
      reason: active.configured ? undefined : "这个模型还没有配置 API Key",
    };
  }, [ai, models, session?.modelId]);

  const changeModel = useCallback(
    async (id: string | null) => {
      if (switchingModel) return;
      setSwitchingModel(true);
      const prev = session?.modelId ?? null;
      // 乐观更新：立刻反映在 UI 上，失败再回滚
      setSession((s) => (s ? { ...s, modelId: id } : s));
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ modelId: id }),
        });
        const data = (await res.json()) as { session?: SessionData; error?: string };
        if (!res.ok || !data.session) throw new Error(data.error ?? "切换失败");
        setSession((s) => (s ? { ...s, ...data.session } : data.session!));
        const picked = id ? models.find((m) => m.id === id) : models.find((m) => m.isDefault);
        toast.success(
          picked ? `本会话改用「${picked.label}」` : "本会话改为跟随默认模型",
          { description: "只影响这个会话，历史消息不变。" },
        );
      } catch (e) {
        setSession((s) => (s ? { ...s, modelId: prev } : s));
        toast.error((e as Error).message);
      } finally {
        setSwitchingModel(false);
      }
    },
    [sessionId, session?.modelId, models, switchingModel],
  );

  const activePlan = useMemo(
    () => plans.find((p) => p.id === session?.planId) ?? null,
    [plans, session?.planId],
  );
  // 当前步骤：优先按会话聚焦的概念匹配；否则取进行中，再否则取第一个未开始
  const activePlanStep = useMemo(() => {
    if (!activePlan) return null;
    if (session?.planItemId) {
      const bound = activePlan.items.find((i) => i.id === session.planItemId);
      // 已完成的步骤也保留：会话里要能显示“进入下一步”，但不能被“开始第一步”重新打开
      return bound && bound.status !== "skipped" ? bound : null;
    }
    const focused = session?.focusConceptId
      ? activePlan.items.find(
          (i) =>
            i.conceptId === session.focusConceptId &&
            (i.status === "pending" || i.status === "in_progress"),
        )
      : null;
    return (
      focused ??
      activePlan.items.find((i) => i.status === "in_progress") ??
      activePlan.items.find((i) => i.status === "pending") ??
      null
    );
  }, [activePlan, session?.focusConceptId, session?.planItemId]);
  const nextPlanStep = useMemo(() => {
    if (!activePlan || !activePlanStep) return null;
    const idx = activePlan.items.findIndex((i) => i.id === activePlanStep.id);
    if (idx < 0) return null;
    return activePlan.items.slice(idx + 1).find((i) => i.status === "pending") ?? null;
  }, [activePlan, activePlanStep]);
  const canAdvancePlan = Boolean(activePlan && activePlanStep && session?.mode !== "review");
  const stepVerified = activePlanStep?.verifiedConcepts ?? 0;
  const stepRequired = activePlanStep?.requiredConcepts ?? 3;
  const stepComplete = Boolean(
    activePlanStep && (activePlanStep.status === "done" || stepVerified >= stepRequired),
  );
  const planActionLabel = useMemo(() => {
    if (!activePlanStep) return "继续下一步";
    if (!stepComplete) return `继续检验（${stepVerified}/${stepRequired}）`;
    return nextPlanStep ? `进入 ${shortStepTitle(nextPlanStep.title)}` : "本步已完成";
  }, [activePlanStep, nextPlanStep, stepComplete, stepRequired, stepVerified]);

  // 在同一外壳里从会话 A 切到会话 B 时，组件可能不会重新挂载。
  useEffect(() => {
    initialScrollDone.current = false;
    followLatest.current = true;
    setShowJumpToLatest(false);
  }, [sessionId]);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    if (scrollFrame.current != null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      // 滚到文档真正的底部，而不是消息占位的底部：
      // 输入区是 sticky 的，它自身也占页面高度，按占位滚会永远差一截。
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
      scrollFrame.current = null;
    });
  }, []);

  // 首次打开会话必定落到最新消息。之前这里在 loading 阶段就把"首次"消耗掉了，
  // 等消息真正到达时又被 near-bottom 判断拦住，长会话会一直停在顶部。
  useEffect(() => {
    if (loading || initialScrollDone.current) return;
    initialScrollDone.current = true;
    followLatest.current = true;
    scrollToLatest("auto");
    // Markdown / KaTeX / 练习组件可能异步撑高页面，等布局稳定后再对一次底。
    const t = window.setTimeout(() => {
      if (followLatest.current) scrollToLatest("auto");
    }, 220);
    return () => window.clearTimeout(t);
  }, [loading, messages.length, scrollToLatest]);

  // 只在用户本来就在底部附近时自动跟随；上滑阅读时不抢滚动。
  useEffect(() => {
    if (loading) return;
    const distance = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
    if (followLatest.current || distance < 160) {
      scrollToLatest(pending ? "auto" : "smooth");
      setShowJumpToLatest(false);
    } else {
      setShowJumpToLatest(true);
    }
  }, [loading, messages.length, streamText, streamParts.length, pending, scrollToLatest]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const distance = document.documentElement.scrollHeight - y - window.innerHeight;
      // 只有"向上滑"才算用户想看旧内容；内容变高、程序滚动都不应取消跟随。
      if (y < lastScrollY.current - 4) followLatest.current = false;
      if (distance < 120) followLatest.current = true;
      lastScrollY.current = y;
      setShowJumpToLatest(
        !followLatest.current && document.documentElement.scrollHeight > window.innerHeight + 320,
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 练习组件、Markdown 和字体加载会异步撑高内容；仍在跟随时继续贴底。
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (followLatest.current) scrollToLatest("auto");
      else if (document.documentElement.scrollHeight > window.innerHeight + 320) {
        setShowJumpToLatest(true);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollToLatest, loading]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || pending || sendingRef.current) return;
      sendingRef.current = true;
      followLatest.current = true;
      setShowJumpToLatest(false);
      const optimistic: MessageDTO = {
        id: `tmp-${Date.now()}`,
        sessionId,
        role: "user",
        content: text,
        parts: [],
        status: "done",
        createdAt: Date.now(),
        seq: 9999,
      };
      setMessages((m) => [...m, optimistic]);
      setPending(true);
      setStreamText("");
      setStreamParts([]);
      setError(null);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const minutesParam = Number(new URLSearchParams(window.location.search).get("minutes"));
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            text,
            mode: session?.mode,
            availableMinutes: Number.isFinite(minutesParam) && minutesParam > 0 ? minutesParam : null,
            modelId: session?.modelId ?? null,
            webMode,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "请求失败");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";
        const parts: MessagePart[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";
          for (const chunk of lines) {
            const line = chunk.trim();
            if (!line.startsWith("data:")) continue;
            let evt: Record<string, unknown>;
            try {
              evt = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            switch (evt.type) {
              case "meta": {
                const s = evt.session as SessionData | undefined;
                if (s) setSession((prev) => ({ ...(prev ?? s), ...s }));
                if (evt.ai) setAi(evt.ai as AiStatus);
                const realUser = evt.userMessage as MessageDTO | undefined;
                if (realUser) {
                  setMessages((m) => m.map((x) => (x.id === optimistic.id ? realUser : x)));
                }
                break;
              }
              case "delta": {
                acc += String(evt.text ?? "");
                setStreamText(acc);
                break;
              }
              case "search_status": {
                const state = String(evt.state ?? "");
                if (state === "searching") {
                  setWebStatusLine("正在查证网络来源…");
                } else if (state === "done") {
                  setWebStatusLine(
                    `参考了 ${Number(evt.count ?? 0)} 个来源${evt.cacheHit ? "（命中缓存）" : ""}`,
                  );
                } else if (state === "failed") {
                  setWebStatusLine(String(evt.message ?? "本次未能联网核实"));
                }
                break;
              }
              case "sources": {
                setLiveSources((evt.sources as SourceDTO[]) ?? []);
                break;
              }
              case "block": {
                const block = evt.block as BlockWithExercise;
                setBlocks((b) => ({ ...b, [block.id]: block }));
                parts.push({ type: "block", blockId: block.id, kind: block.kind });
                setStreamParts([...parts]);
                setToolStatus(null);
                break;
              }
              case "notice": {
                parts.push({ type: "notice", notice: String(evt.text ?? "") });
                setStreamParts([...parts]);
                break;
              }
              case "tool_status": {
                setToolStatus(evt.state === "running" ? String(evt.name ?? "") : null);
                break;
              }
              case "error": {
                setError(String(evt.message ?? "生成失败"));
                break;
              }
              case "done": {
                // 消息与来源由 finally 里的 load() 统一刷新，这里不再单独更新
                if (Array.isArray(evt.sources)) setLiveSources(evt.sources as SourceDTO[]);
                break;
              }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message || "网络中断");
        }
      } finally {
        sendingRef.current = false;
        abortRef.current = null;
        setPending(false);
        setStreamText("");
        setStreamParts([]);
        setToolStatus(null);
        await load();
        // 首轮会自动命名会话；同步侧栏/历史，避免"正文已改名、侧栏还是新的学习"
        window.dispatchEvent(new Event("sessions:changed"));
        // 本轮可能刚生成/合并了学习计划，让计划下拉列表跟上
        window.dispatchEvent(new Event("plans:changed"));
        if (followLatest.current) {
          window.setTimeout(() => scrollToLatest("smooth"), 120);
        }
      }
    },
    [pending, sessionId, load, session?.mode, webMode, scrollToLatest],
  );

  // 计划步骤完成由证据决定：至少 N 个不同知识点独立答对才自动完成。
  // 没达标时这里只会继续检验，不会把“手动完成”当成用户判断。
  const goNext = useCallback(async () => {
    if (advancingRef.current) return;
    if (!canAdvancePlan || !activePlan || !activePlanStep) {
      void send("继续下一步，不要重复刚才的内容。");
      return;
    }
    if (!stepComplete) {
      const names = activePlanStep.verifiedConceptNames ?? [];
      const missing = Math.max(0, stepRequired - stepVerified);
      const verified = names.length ? `已验证：${names.join("、")}。` : "";
      void send(
        `本步验证进度 ${stepVerified}/${stepRequired}。${verified}还差 ${missing} 个不同知识点。请针对还没验证的核心知识点出 1 道题，先别讲解。`,
      );
      return;
    }

    advancingRef.current = true;
    setAdvancing(true);
    try {
      const currentId = activePlanStep.id;
      // 兜底：旧会话可能还没有步骤绑定
      if (session?.planItemId !== currentId) {
        await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ planItemId: currentId }),
        }).catch(() => undefined);
        setSession((s) => (s ? { ...s, planItemId: currentId } : s));
      }
      // 只有达到证据阈值才补写 done；这不是用户手动判断
      if (activePlanStep.status !== "done") {
        const stepDone = await fetch(`/api/plans/${activePlan.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId: currentId, status: "done" }),
        });
        if (!stepDone.ok) {
          const data = (await stepDone.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "同步计划步骤失败");
        }
      }
      const planRes = await fetch(`/api/plans/${activePlan.id}`, { cache: "no-store" });
      const planData = (await planRes.json().catch(() => ({}))) as { plan?: PlanDTO };
      const updated = planData.plan ?? activePlan;
      const idx = updated.items.findIndex((i) => i.id === currentId);
      const next = updated.items.slice(idx + 1).find((i) => i.status === "pending") ?? null;
      window.dispatchEvent(new Event("plans:changed"));
      if (!next) {
        toast.success("本步已完成，计划已经全部完成");
        router.push("/plan");
        return;
      }
      const sessionRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "goal",
          planId: updated.id,
          planItemId: next.id,
          focusConceptId: next.conceptId ?? null,
          title: next.title,
        }),
      });
      const sessionData = (await sessionRes.json().catch(() => ({}))) as {
        session?: { id: string };
        error?: string;
      };
      if (!sessionRes.ok || !sessionData.session) {
        throw new Error(
          `${sessionData.error ?? "创建下一步会话失败"}。本步已完成，可在计划页继续下一步。`,
        );
      }
      await fetch(`/api/plans/${updated.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: next.id, status: "in_progress" }),
      });
      window.dispatchEvent(new Event("plans:changed"));
      window.dispatchEvent(new Event("sessions:changed"));
      const focus = next.conceptName ? `聚焦知识点「${next.conceptName}」。` : "";
      const q = `按我的学习路线「${updated.title}」，现在学这一步：${next.title}。${focus}${next.rationale ?? ""} 先讲清楚再出题检验。`;
      router.push(`/s/${sessionData.session.id}?q=${encodeURIComponent(q)}&minutes=20`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      advancingRef.current = false;
      setAdvancing(false);
    }
  }, [
    activePlan,
    activePlanStep,
    canAdvancePlan,
    router,
    send,
    session?.planItemId,
    sessionId,
    stepComplete,
    stepRequired,
    stepVerified,
  ]);

  const startPlan = useCallback(async () => {
    if (canAdvancePlan && activePlan && activePlanStep && activePlanStep.status !== "done") {
      setSession((s) => (s ? { ...s, planItemId: activePlanStep.id } : s));
      try {
        await Promise.all([
          fetch(`/api/sessions/${sessionId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ planItemId: activePlanStep.id }),
          }),
          activePlanStep.status === "in_progress"
            ? Promise.resolve()
            : fetch(`/api/plans/${activePlan.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ itemId: activePlanStep.id, status: "in_progress" }),
              }),
        ]);
        window.dispatchEvent(new Event("plans:changed"));
      } catch {
        // 绑定失败不阻塞开讲；下一步操作仍可重新绑定
      }
    }
    void send("开始第一步：先讲清楚，再出题检验。");
  }, [activePlan, activePlanStep, canAdvancePlan, send, sessionId]);

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant") ?? null,
    [messages],
  );
  const lastBlocks = useMemo(() => {
    if (!lastAssistant) return [] as BlockWithExercise[];
    return lastAssistant.parts
      .filter((p) => p.type === "block" && p.blockId)
      .map((p) => blocks[p.blockId!])
      .filter((b): b is BlockWithExercise => Boolean(b));
  }, [lastAssistant, blocks]);
  const lastHasExercise = lastBlocks.some((b) => b.kind === "exercise" || b.kind === "quiz");
  const lastHasPlan = lastBlocks.some(
    (b) => b.kind === "steps" && Boolean((b.payload as { planId?: unknown }).planId),
  );
  const lastMessageIsAssistant = messages.at(-1)?.role === "assistant";
  const showTeachingActions = Boolean(
    lastAssistant &&
      lastMessageIsAssistant &&
      !pending &&
      !lastHasExercise &&
      lastAssistant.status === "done" &&
      lastAssistant.error !== "AI_NOT_CONFIGURED" &&
      (lastAssistant.content.trim() || lastAssistant.parts.length > 0),
  );
  const teachingActions = lastHasPlan
    ? activePlanStep && activePlanStep.status !== "done"
      ? [
          {
            label: activePlanStep.status === "in_progress" ? "继续当前步骤" : "开始第一步",
            primary: true,
            onClick: startPlan,
          },
        ]
      : []
    : [
        {
          label: "出题检验",
          primary: true,
          onClick: () =>
            void send("就刚才讲的内容出一道题检验我。先别给答案，题干要具体，最好能暴露我是否真的理解。"),
        },
        {
          label: "换个讲法",
          onClick: () =>
            void send("这个讲法我还没完全懂，换一种更直观的讲法，用我能想象的东西打比方。"),
        },
        {
          label: canAdvancePlan ? planActionLabel : "继续下一步",
          onClick: () => void goNext(),
          title: canAdvancePlan ? "手动标记当前计划步骤完成，并进入下一步" : "继续下一个知识点",
        },
      ];

  // 结构化复习：空会话进入时自动开题（约束由服务端的 review 模式提示词给，不靠这句话）
  useEffect(() => {
    if (loading || autoSent.current) return;
    if (session?.mode !== "review") return;
    if (messages.length > 0) return;
    autoSent.current = true;
    void send("开始这次复习");
  }, [loading, session?.mode, messages.length, send]);

  // 首页带过来的初始问题
  useEffect(() => {
    if (loading || autoSent.current) return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (!q) return;
    if (messages.length > 0) return;
    autoSent.current = true;
    window.history.replaceState({}, "", `/s/${sessionId}`);
    void send(q);
  }, [loading, messages.length, send, sessionId]);

  const saveTitle = async () => {
    setEditingTitle(false);
    const t = titleDraft.trim();
    if (!t || !session) return;
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: t }),
    });
    setSession((s) => (s ? { ...s, title: t } : s));
    // 侧栏「最近」用的是另一份数据，通知它重新拉取
    window.dispatchEvent(new Event("sessions:changed"));
  };

  const changePlan = async (value: string) => {
    const planId = value || null;
    const planTitle = planId ? plans.find((p) => p.id === planId)?.title ?? null : null;
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    if (!res.ok) {
      toast.error("调整计划归属失败");
      return;
    }
    setSession((s) => (s ? { ...s, planId, planTitle } : s));
    window.dispatchEvent(new Event("sessions:changed"));
    toast.success(planId ? `已归入「${planTitle}」` : "已移出计划");
  };

  const removeSession = async () => {
    const url = `/api/sessions/${sessionId}${withEvidence ? "?withEvidence=1" : ""}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) {
      toast.success("会话已删除");
      window.dispatchEvent(new Event("sessions:changed"));
      router.push("/history");
    } else {
      toast.error("删除失败");
    }
  };

  const openWorkspace = (blockId: string) => router.push(`/w/${blockId}?s=${sessionId}`);

  const empty = useMemo(() => messages.length === 0 && !pending, [messages.length, pending]);

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center gap-2 text-[13px] text-ink3">
        <Spinner /> 正在打开会话…
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={<AlertCircle className="size-6" />}
          title={error}
          description="这个会话可能已经被删除。"
          action={
            <Button variant="secondary" onClick={() => router.push("/")}>
              回到首页
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-3xl flex-col px-4 md:min-h-dvh md:px-6">
      {/* 会话头 */}
      <header className="sticky top-14 z-20 -mx-4 border-b border-line bg-bg/85 px-4 py-2.5 backdrop-blur-md md:top-0 md:-mx-6 md:px-6">
        <div className="flex items-center gap-2">
          {editingTitle ? (
            <input
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 py-1 font-serif text-[16px] text-ink outline-none focus:border-accent"
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="min-w-0 flex-1 truncate text-left font-serif text-[16px] tracking-tight text-ink hover:opacity-70"
              title="点击重命名"
            >
              {session?.title ?? "新的学习"}
            </button>
          )}
          <Badge
            tone={session?.mode === "free" ? "neutral" : "accent"}
            className="shrink-0 whitespace-nowrap"
          >
            {session?.mode === "goal" ? "目标学习" : session?.mode === "review" ? "复习" : "自由学习"}
          </Badge>
          {session?.mode === "review" && session.focusConceptName ? (
            <span className="truncate text-[11.5px] text-ink3">聚焦：{session.focusConceptName}</span>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => send("请基于本次真实发生的学习，调用 write_summary 工具写一份学习小结，不要编造数据。")}
              disabled={pending || messages.length === 0}
              className="rounded-full p-2 text-ink3 transition-colors hover:bg-panel2 hover:text-ink disabled:opacity-30"
              title="生成本次学习小结"
              aria-label="生成本次学习小结"
            >
              <FileText className="size-4" />
            </button>
            <Link
              href="/library"
              className="rounded-full p-2 text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
              title="查看学习档案"
              aria-label="查看学习档案"
            >
              <BookMarked className="size-4" />
            </Link>
            <button
              onClick={() => setDeleteOpen(true)}
              className="rounded-full p-2 text-ink3 transition-colors hover:bg-panel2 hover:text-bad"
              title="删除会话"
              aria-label="删除会话"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
        {session?.topics?.length || (plans.length > 0 && !empty) ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {plans.length > 0 && !empty ? (
              <PlanSelect
                plans={plans}
                mode="assign"
                value={session?.planId ?? ""}
                onChange={(v) => void changePlan(v)}
                className={cx(
                  "max-w-[220px] rounded-full border bg-panel px-2 py-0.5 text-[11px] text-ink3 outline-none hover:border-linestrong",
                  session?.planId ? "border-line" : "border-dashed border-line",
                )}
                title="所属学习计划"
                ariaLabel="切换所属学习计划"
              />
            ) : null}
            {session?.topics?.map((t) => (
              <span key={t.id} className="text-[11px] text-ink3">
                # {t.name}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {/* 消息区 */}
      <div ref={contentRef} className="flex-1 py-5">
        {empty ? (
          <div className="flex flex-col gap-5 py-6">
            <div className="flex flex-col gap-2">
              <h1 className="font-serif text-[26px] leading-tight tracking-tight text-ink">
                想学点什么？
              </h1>
              <p className="text-[13.5px] leading-relaxed text-ink2">
                直接问就行。我会根据你的回答调整讲法，必要时给练习或可调参数的模拟器。
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink3">
                <FolderOpen className="size-3.5" />
                <span>归入计划</span>
                {plans.length > 0 ? (
                  <PlanSelect
                    plans={plans}
                    mode="assign"
                    value={session?.planId ?? ""}
                    onChange={(v) => void changePlan(v)}
                    className="max-w-[260px] rounded-full border border-line bg-panel px-2.5 py-1 text-[12px] text-ink2 outline-none hover:border-linestrong"
                    ariaLabel="归入学习计划"
                  />
                ) : (
                  <Link href="/plan" className="text-accentink hover:underline">
                    还没有计划，去建一个
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserMessage key={m.id} message={m} />
              ) : (
                <AssistantMessage
                  key={m.id}
                  message={m}
                  blocks={blocks}
                  onAsk={send}
                  onOpenWorkspace={openWorkspace}
                  onNextStep={m.id === lastAssistant?.id ? goNext : undefined}
                  nextStepLabel={m.id === lastAssistant?.id ? planActionLabel : undefined}
                />
              ),
            )}

            {showTeachingActions && (!lastHasPlan || activePlanStep) ? (
              <NextActions actions={teachingActions} busy={pending || advancing} />
            ) : null}

            {pending ? (
              <div className="animate-rise">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-ink3">
                  <Sparkles className="size-3" />
                  Lumina
                  {toolStatus ? <span className="ml-1 animate-pulse-soft">正在生成{toolLabel(toolStatus)}…</span> : null}
                </div>
                {streamText ? (
                  <div className={cx(streamText ? "stream-caret" : "")}>
                    <ErrorBoundary label="streaming-text">
                      <Markdown>{stripPartialCitation(streamText)}</Markdown>
                    </ErrorBoundary>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[13px] text-ink3">
                      <span className="flex gap-1">
                        <Dot /> <Dot delay={0.15} /> <Dot delay={0.3} />
                      </span>
                      {webStatusLine ?? "思考中…"}
                    </div>
                    {liveSources.length ? <SourceCards sources={liveSources} loading /> : null}
                  </div>
                )}
                {streamParts
                  .filter((p) => p.type === "block" && p.blockId && blocks[p.blockId])
                  .map((p) => (
                    <div key={p.blockId} className="mt-3">
                      <BlockRenderer
                        block={blocks[p.blockId!]}
                        onAsk={send}
                        onOpenWorkspace={() => openWorkspace(p.blockId!)}
                      />
                    </div>
                  ))}
                {streamParts
                  .filter((p) => p.type === "notice")
                  .map((p, i) => (
                    <NoticeLine key={i} text={p.notice ?? ""} />
                  ))}
              </div>
            ) : null}

            {error ? (
              <div className="flex items-start gap-2 rounded-xl border border-bad/30 bg-badsoft/40 px-3 py-2.5 text-[12.5px] text-bad">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div>
                  {error}
                  {error.includes("配置") ? (
                    <Link href="/settings" className="ml-1 underline">
                      去设置
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="sticky bottom-[60px] z-20 -mx-4 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur-md md:bottom-0 md:-mx-6 md:px-6">
        {showJumpToLatest ? (
          <button
            onClick={() => {
              followLatest.current = true;
              setShowJumpToLatest(false);
              scrollToLatest("smooth");
            }}
            className="fixed bottom-60 right-4 z-30 flex items-center gap-1.5 rounded-full border border-line bg-panel/95 px-3 py-1.5 text-[12px] text-ink2 shadow-[var(--shadow)] backdrop-blur transition-colors hover:text-ink md:bottom-48 md:right-8"
            aria-label="回到最新消息"
          >
            <ArrowDown className="size-3.5" />
            回到最新
          </button>
        ) : null}
        {effectiveAi && !effectiveAi.configured ? (
          <div className="mb-2">
            <AiWarning ai={effectiveAi} />
          </div>
        ) : null}
        <Composer
          onSend={send}
          pending={pending}
          disabled={Boolean(effectiveAi && !effectiveAi.configured)}
          ai={effectiveAi}
          models={models}
          modelId={session?.modelId ?? null}
          onModelChange={changeModel}
          webMode={webMode}
          webConfigured={webConfigured}
          onWebModeChange={(mode) => {
            setWebMode(mode);
            try {
              window.localStorage.setItem("lumina-web-mode", mode);
            } catch {
              /* 隐私模式下写不了 localStorage，忽略 */
            }
            if (mode === "manual" && !webConfigured) {
              toast.message("联网检索未配置", {
                description: "到「设置 → 联网检索」填 SearXNG 地址或 API Key 后即可查证。",
              });
            }
          }}
          onAttach={() =>
            router.push(
              `/materials?returnTo=/s/${sessionId}${session?.planId ? `&plan=${session.planId}` : ""}`,
            )
          }
          onStop={() => abortRef.current?.abort()}
          placeholder={
            messages.length === 0
              ? "直接描述你想学的内容，或说「继续上次的学习」"
              : "继续追问，或让我换种讲法 / 出题检验"
          }
        />
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除这个会话？"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="danger" size="sm" onClick={removeSession}>
              确认删除
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink2">
          默认删除：这条会话里的<strong className="text-ink">对话、教学组件和未提交的草稿</strong>。
          题目、作答记录与知识点证据会保留——它们属于跨会话的学习档案。
        </p>
        <label className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-panel2/40 p-3 text-[12.5px] text-ink2">
          <input
            type="checkbox"
            checked={withEvidence}
            onChange={(e) => setWithEvidence(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            同时删除本会话产生的作答证据
            <span className="mt-0.5 block text-[11.5px] text-ink3">
              勾选后会删掉这条会话产生的证据，并按剩余证据<strong className="font-medium text-ink">重算掌握度</strong>——
              分数可能回落。历史快照与变更记录仍保留，可追溯。
            </span>
          </span>
        </label>
      </Modal>
    </div>
  );
}

function shortStepTitle(title: string): string {
  return title.split(/[｜|]/)[0]?.trim() || "本步";
}

function toolLabel(name: string) {
  const map: Record<string, string> = {
    present_exercise: "练习",
    present_quiz: "小测",
    present_chart: "图表",
    present_table: "对比表",
    present_steps: "步骤演示",
    open_simulator: "互动模拟器",
    save_concepts: "知识点",
    save_plan: "学习路线",
    write_summary: "学习小结",
  };
  return map[name] ?? "内容";
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="size-1.5 rounded-full bg-ink3 animate-pulse-soft"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

function UserMessage({ message }: { message: MessageDTO }) {
  return (
    <div className="flex flex-col items-end gap-1 animate-rise">
      <div className="flex items-center gap-1.5 text-[11.5px] text-ink3">
        <User className="size-3" /> 你
      </div>
      <div className="max-w-[92%] rounded-2xl rounded-tr-sm bg-panel2 px-3.5 py-2.5 text-[14.5px] leading-relaxed text-ink whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  blocks,
  onAsk,
  onOpenWorkspace,
  onNextStep,
  nextStepLabel,
}: {
  message: MessageDTO;
  blocks: Record<string, BlockWithExercise>;
  onAsk: (t: string) => void;
  onOpenWorkspace: (id: string) => void;
  onNextStep?: () => void | Promise<void>;
  nextStepLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const hasParts = message.parts.length > 0;

  return (
    <div className="group flex flex-col gap-1.5 animate-rise">
      <div className="flex items-center gap-1.5 text-[11.5px] text-ink3">
        <Sparkles className="size-3 text-accent" /> Lumina
        {message.status === "error" ? <Badge tone="bad">生成中断</Badge> : null}
        {message.error === "AI_NOT_CONFIGURED" ? (
          <Link href="/settings" className="text-[11.5px] text-accentink underline">
            去配置模型
          </Link>
        ) : null}
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            toast.success("已复制");
            setTimeout(() => setCopied(false), 1500);
          }}
          className="ml-1 rounded p-1 opacity-60 transition-opacity hover:bg-panel2 hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          title="复制"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      </div>

      {hasParts ? (
        <div className="flex flex-col gap-3">
          {message.parts.map((p, i) => {
            if (p.type === "text" && p.text)
              return (
                <ErrorBoundary key={i} label="message-text">
                  <Markdown>{p.text}</Markdown>
                </ErrorBoundary>
              );
            if (p.type === "notice") return <NoticeLine key={i} text={p.notice ?? ""} />;
            if (p.type === "block" && p.blockId && blocks[p.blockId]) {
              return (
                <BlockRenderer
                  key={i}
                  block={blocks[p.blockId]}
                  onAsk={onAsk}
                  onOpenWorkspace={() => onOpenWorkspace(p.blockId!)}
                  onNextStep={onNextStep}
                  nextStepLabel={nextStepLabel}
                />
              );
            }
            return null;
          })}
        </div>
      ) : message.content ? (
        <ErrorBoundary label="message-content">
          <Markdown>{message.content}</Markdown>
        </ErrorBoundary>
      ) : (
        <p className="text-[13px] text-ink3">（空）</p>
      )}
      {message.sources && message.sources.length ? (
        <div className="mt-1.5">
          <SourceCards sources={message.sources} />
        </div>
      ) : message.content?.trim() ? (
        <p className="mt-1 text-[10.5px] text-ink3/80" title="没有检索到来源，内容来自模型知识">
          模型知识
        </p>
      ) : null}
      {message.model ? (
        <p className="mt-1 flex items-center gap-1 text-[10.5px] text-ink3/80" title="产出这条回答的模型">
          <Sparkles className="size-2.5" />
          {message.model}
        </p>
      ) : null}
    </div>
  );
}

function NoticeLine({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11.5px] text-ink3">
      <span className="h-px w-3 bg-line-strong" />
      {text}
    </p>
  );
}

function AiWarning({ ai }: { ai: AiStatus }) {
  return (
    <div className="rounded-xl border border-warn/30 bg-warnsoft/50 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink">
      <p className="font-medium text-warn">模型服务尚未配置</p>
      <p className="mt-1 text-ink2">
        {ai.reason ?? "还没有可用的模型"}。没有真实模型时，我不会用固定话术冒充教学——
        填好 Base URL、模型名与 API Key 之后就能开始。
      </p>
      <Link
        href="/settings"
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-all hover:brightness-110"
      >
        去配置模型
      </Link>
    </div>
  );
}
