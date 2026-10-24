"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowDown, ArrowUp, BookMarked, Check, Copy, FileText, FolderOpen, Sparkles, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import Composer from "./Composer";
import NextActions from "./NextActions";
import BlockRenderer from "@/components/blocks/BlockRenderer";
import Markdown from "@/components/Markdown";
import SourceCards from "@/components/chat/SourceCards";
import ErrorBoundary from "@/components/blocks/ErrorBoundary";
import { Badge, Button, EmptyState, MenuItem, Modal, OverflowMenu, Spinner, cx } from "@/components/ui/kit";
import { usePlans } from "@/components/PlanSelect";
import type { BlockWithExercise } from "@/lib/api/serialize";
import type {
  AiModelPublic,
  AiStatus,
  LearningMode,
  MessageDTO,
  MessagePart,
  SourceDTO,
} from "@/lib/types";
import { stripPartialCitation } from "@/lib/ai/citations";
import { REPRESENTATIONS } from "@/lib/teaching/representation";

/** 流式增量合批窗口：模型每吐一个 token 就来一个 delta，逐条提交会让整页按 token 重渲染 */
const STREAM_BATCH_MS = 50;

interface SessionData {
  id: string;
  title: string;
  mode: LearningMode;
  /** 归属的学习计划；无限学习为空 */
  planId?: string | null;
  planTitle?: string | null;
  planItemId?: string | null;
  courseTitle?: string | null;
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
  const [reasoningActive, setReasoningActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const autoSent = useRef(false);
  const sendingRef = useRef(false);
  /** 当前会话 id 的镜像：异步收尾时用它判断结果是否还属于正在看的会话 */
  const sessionIdRef = useRef(sessionId);
  /** 发送序号：切换会话 / 新请求都会让上一轮的异步回调失效，避免旧数据写进新界面 */
  const sendSeqRef = useRef(0);
  const initialScrollDone = useRef(false);
  const followLatest = useRef(true);
  const lastScrollY = useRef(0);
  const suppressFollowUntil = useRef(0);
  const scrollFrame = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const expandComposer = useCallback(() => {
    setComposerExpanded(true);
    window.setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="继续追问"]')?.focus();
    }, 60);
  }, []);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);

  // 等待时给出"已经等了多久"，避免推理型模型长时间无输出时像卡死
  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    setElapsed(0);
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [pending]);

  const load = useCallback(async () => {
    const forSessionId = sessionId;
    try {
      const [sRes, hRes, mRes, wRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}`, { cache: "no-store" }),
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/models", { cache: "no-store" }),
        fetch("/api/settings/web", { cache: "no-store" }),
      ]);
      if (!sRes.ok) throw new Error("会话不存在或已被删除");
      const data = (await sRes.json()) as {
        session: SessionData;
        messages: MessageDTO[];
        blocks: BlockWithExercise[];
      };
      const h = hRes.ok ? ((await hRes.json()) as { ai: AiStatus }) : null;
      const m = mRes.ok ? ((await mRes.json()) as { models: AiModelPublic[] }) : null;
      const w = wRes.ok
        ? ((await wRes.json()) as { defaultMode?: "off" | "manual"; configured?: boolean })
        : null;
      // 请求期间用户可能已经切到别的会话；上一轮的响应不能覆盖当前会话
      if (sessionIdRef.current !== forSessionId) return;
      setSession(data.session);
      setTitleDraft(data.session.title);
      setMessages(data.messages);
      setBlocks(Object.fromEntries(data.blocks.map((b) => [b.id, b])));
      if (h) setAi(h.ai);
      if (m) setModels(m.models ?? []);
      if (w) {
        setWebConfigured(Boolean(w.configured));
        const saved = (typeof window !== "undefined" ? window.localStorage.getItem("lumina-web-mode") : null) as
          | "off"
          | "manual"
          | null;
        setWebMode(saved ?? w.defaultMode ?? "off");
      }
      setError(null);
    } catch (e) {
      if (sessionIdRef.current !== forSessionId) return;
      setError((e as Error).message);
    } finally {
      if (sessionIdRef.current === forSessionId) setLoading(false);
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
  const planningSession = Boolean(
    session?.mode === "goal" &&
      !session.planItemId &&
      (session.title.startsWith("规划：") || activePlan?.status === "draft"),
  );
  const activeCourse = useMemo(() => {
    if (!activePlan) return null;
    if (session?.planItemId) {
      return activePlan.items.find((item) => item.id === session.planItemId) ?? null;
    }
    return (
      activePlan.items.find((item) => item.status === "in_progress") ??
      activePlan.items.find((item) => item.id === activePlan.currentCourseId) ??
      null
    );
  }, [activePlan, session?.planItemId]);
  const courseComplete = Boolean(
    activeCourse &&
      activeCourse.progress.total > 0 &&
      activeCourse.progress.mastered === activeCourse.progress.total,
  );
  const courseHref =
    activePlan && activeCourse ? `/plan/${activePlan.id}/course/${activeCourse.id}` : null;
  const continueLabel =
    session?.mode === "goal" && activeCourse
      ? courseComplete
        ? "返回课程"
        : `继续 ${activeCourse.nextConceptName ?? "本课程"}`
      : "继续";

  // 在同一外壳里从会话 A 切到会话 B 时，组件可能不会重新挂载。
  useEffect(() => {
    const switched = sessionIdRef.current !== sessionId;
    sessionIdRef.current = sessionId;
    initialScrollDone.current = false;
    followLatest.current = true;
    setShowJumpToLatest(false);
    if (!switched) return;
    // 切走时结束上一段生成：否则上一轮的 delta 会继续写进新会话的界面。
    // 服务端收到中断会把已生成内容按"中断"落库，回到原会话仍能看到。
    abortRef.current?.abort();
    abortRef.current = null;
    sendSeqRef.current += 1;
    sendingRef.current = false;
    setPending(false);
    setStreamText("");
    setStreamParts([]);
    setToolStatus(null);
    setReasoningActive(false);
    setError(null);
  }, [sessionId]);

  // 离开这个页面（组件卸载）时也要结束生成：流已经没人消费，
  // 继续跑只会白烧 token，旧会话也少了"中断"收尾。
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      sendSeqRef.current += 1;
      sendingRef.current = false;
    };
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    if (scrollFrame.current != null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      // 滚到文档真正的底部，而不是消息占位的底部：
      // 输入区是 sticky 的，它自身也占页面高度，按占位滚会永远差一截。
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
      scrollFrame.current = null;
    });
  }, []);

  const scrollToAnswerStart = useCallback(() => {
    const nodes = document.querySelectorAll<HTMLElement>('[data-role="assistant"]');
    const el = nodes[nodes.length - 1];
    if (!el) return false;
    // 短回答不用跳；长回答（含表格/练习）从开头读起，别一上来就停在题目上。
    if (el.getBoundingClientRect().height < window.innerHeight * 0.55) return false;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
    return true;
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
    if (Date.now() < suppressFollowUntil.current) return;
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
      if (Date.now() < suppressFollowUntil.current) {
        lastScrollY.current = y;
        return;
      }
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
    async (
      text: string,
      opts?: {
        representation?: string;
        avoidRepresentations?: string[];
        reuseUserId?: string;
      },
    ) => {
      if (!text.trim() || sendingRef.current) return;
      const seq = ++sendSeqRef.current;
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
      if (!opts?.reuseUserId) setMessages((m) => [...m, optimistic]);
      setPending(true);
      setStreamText("");
      setStreamParts([]);
      setError(null);
      // 发出去之后回到阅读态：手机上输入区收成一条窄栏，给图表/讲解腾空间。
      setComposerExpanded(false);
      const controller = new AbortController();
      abortRef.current = controller;
      let aborted = false;
      let acc = "";
      const parts: MessagePart[] = [];
      let flushTimer: number | null = null;
      let disposed = false;
      const cancelFlush = () => {
        if (flushTimer != null) {
          window.clearTimeout(flushTimer);
          flushTimer = null;
        }
      };
      const isStale = () => sendSeqRef.current !== seq;
      // 合批：50ms 内的 delta 只提交一次，避免每个 token 都重渲染整页
      const scheduleFlush = () => {
        if (flushTimer != null) return;
        flushTimer = window.setTimeout(() => {
          flushTimer = null;
          if (disposed || isStale()) return;
          setStreamText(acc);
        }, STREAM_BATCH_MS);
      };
      // 组件出现前先把手上的正文定格进 parts，渲染顺序才是 正文→组件→续写正文
      const freezeText = () => {
        cancelFlush();
        if (!acc.trim()) return;
        parts.push({ type: "text", text: acc });
        acc = "";
        setStreamText("");
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            text,
            mode: session?.mode,
            modelId: session?.modelId ?? null,
            webMode,
            representation: opts?.representation,
            avoidRepresentations: opts?.avoidRepresentations,
            reuseUserMessageId: opts?.reuseUserId,
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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (isStale()) break;
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
                scheduleFlush();
                break;
              }
              case "thinking": {
                setReasoningActive(evt.state === "start");
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
                // 续写时正文会出现在组件之后：先把当前这段文本定格，保证渲染顺序
                freezeText();
                const block = evt.block as BlockWithExercise;
                setBlocks((b) => ({ ...b, [block.id]: block }));
                parts.push({ type: "block", blockId: block.id, kind: block.kind });
                setStreamParts([...parts]);
                setToolStatus(null);
                break;
              }
              case "notice": {
                freezeText();
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
                setReasoningActive(false);
                break;
              }
              case "done": {
                // 消息与来源由 finally 里的 load() 统一刷新，这里不再单独更新
                if (Array.isArray(evt.sources)) setLiveSources(evt.sources as SourceDTO[]);
                setReasoningActive(false);
                break;
              }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          aborted = true;
        } else if (!isStale()) {
          setError((e as Error).message || "网络中断");
        }
      } finally {
        disposed = true;
        cancelFlush();
        // 已经切到别的会话 / 有更新的请求：旧一轮的收尾不能改动当前界面
        if (isStale()) return;
        sendingRef.current = false;
        abortRef.current = null;
        setPending(false);
        setStreamText("");
        setStreamParts([]);
        setToolStatus(null);
        setReasoningActive(false);
        const wasFollowing = followLatest.current;
        // 完成后先回到"讲解开头"，不要在长回答/练习题底部停住。
        // 这段时间内不让 near-bottom 逻辑把页面又拉回底部。
        if (wasFollowing) {
          followLatest.current = false;
          suppressFollowUntil.current = Date.now() + 1200;
        }
        await load();
        // 刷新期间可能又切了会话或发了新请求，后续收尾都不该再动界面
        if (isStale()) return;
        if (aborted) {
          // 中断时服务端可能还在收尾落库；等它写完再拉一次，
          // 否则会把周期性快照（例如只剩一个 **）当成最终内容。
          await new Promise((r) => window.setTimeout(r, 700));
          if (isStale()) return;
          await load();
          if (isStale()) return;
        }
        // 首轮会自动命名会话；同步侧栏/历史，避免"正文已改名、侧栏还是新的学习"
        window.dispatchEvent(new Event("sessions:changed"));
        // 本轮可能刚生成/合并了学习计划，让计划下拉列表跟上
        window.dispatchEvent(new Event("plans:changed"));
        if (wasFollowing) {
          window.setTimeout(() => {
            if (isStale()) return;
            if (scrollToAnswerStart()) setShowJumpToLatest(true);
            suppressFollowUntil.current = 0;
          }, 160);
        }
      }
    },
    [sessionId, load, session?.mode, webMode, scrollToLatest],
  );

  // 目标学习不再按“3 个概念自动完成步骤”推进；课程进度完全由知识点证据决定。
  // 这里只负责把对话带到同一门课程的下一个知识点，或回到课程页。
  const goNext = useCallback(() => {
    if (session?.mode === "goal" && activePlan) {
      if (!activeCourse) {
        router.push(`/plan/${activePlan.id}`);
        return;
      }
      if (activeCourse.unconfigured) {
        toast.message("这门课程还没有知识点", {
          description: "先到计划里添加知识点，才能继续学习。",
        });
        router.push(`/plan/${activePlan.id}`);
        return;
      }
      if (courseComplete || activeCourse.status === "done") {
        router.push(courseHref ?? `/plan/${activePlan.id}`);
        return;
      }
      const next = activeCourse.nextConceptName;
      void send(
        next
          ? `继续课程「${activeCourse.title}」的下一个知识点「${next}」。先讲清楚，再出题检验。`
          : "继续这门课程的下一个知识点，不要重复刚才的内容。",
      );
      return;
    }
    if (session?.mode === "goal" && activePlan) {
      router.push(`/plan/${activePlan.id}`);
      return;
    }
    void send("继续下一步，不要重复刚才的内容。");
  }, [activeCourse, activePlan, courseComplete, courseHref, router, send, session?.mode]);

  const generateSummary = useCallback(() => {
    if (pending || messages.length === 0) return;
    void send("请基于本次真实发生的学习，调用 write_summary 工具写一份学习小结，不要编造数据。");
  }, [pending, messages.length, send]);

  const retryLast = useCallback(() => {
    if (pending) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setError(null);
    // 复用原提问：服务端不会再插入一条重复的用户消息。
    void send(lastUser.content, { reuseUserId: lastUser.id });
  }, [messages, pending, send]);

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
    ? [
        {
          label: activePlan?.status === "active" ? "查看计划" : "查看并确认计划",
          primary: true,
          onClick: () => router.push(activePlan ? `/plan/${activePlan.id}` : "/plan"),
        },
      ]
    : [
        {
          label: "出题检验",
          primary: true,
          onClick: () =>
            void send("就刚才讲的内容出一道题检验我。先别给答案，题干要具体，最好能暴露我是否真的理解。"),
        },
        {
          label: "换个讲法",
          onClick: () => {
            const key = `lumina:reps:${sessionId}`;
            let used: string[] = [];
            try {
              const raw = JSON.parse(window.localStorage.getItem(key) ?? "[]");
              if (Array.isArray(raw)) used = raw.filter((x): x is string => typeof x === "string");
            } catch {
              /* 本地记录损坏时重新开始 */
            }
            const fresh = REPRESENTATIONS.filter((r) => !used.includes(r));
            const next = fresh[0] ?? REPRESENTATIONS[0];
            // 全部用过一轮后重新计数，但本次仍然避开刚用过的那几种
            const avoid = fresh.length ? used : [];
            const updated = [...new Set([...avoid, next])];
            try {
              window.localStorage.setItem(key, JSON.stringify(updated));
            } catch {
              /* 隐私模式下写不了，不影响本次请求 */
            }
            void send("这个讲法我还没完全懂，换一种讲法重新讲一遍。", {
              representation: next,
              avoidRepresentations: avoid,
            });
          },
        },
        ...(session?.mode === "goal"
          ? [
              {
                label: activeCourse
                  ? courseComplete
                    ? "返回课程"
                    : continueLabel
                  : "查看计划",
                onClick: () =>
                  activeCourse && !courseComplete
                    ? goNext()
                    : router.push(courseHref ?? (activePlan ? `/plan/${activePlan.id}` : "/plan")),
                title: activeCourse
                  ? "继续本课程的下一个知识点"
                  : "回到计划选择课程",
              },
            ]
          : session?.mode === "infinite"
            ? [
                {
                  label: "继续",
                  onClick: () => void send("继续刚才的内容，不要重复。"),
                },
                {
                  label: "整理成计划",
                  onClick: () =>
                    void send(
                      "请把这次对话里的学习内容整理成一个目标学习计划草稿，按「课程 → 知识点」组织；先给我确认，不要直接开始教学。",
                    ),
                },
              ]
            : [
                {
                  label: "继续复习",
                  onClick: () => goNext(),
                },
              ]),
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

  const removeSession = async () => {
    const url = `/api/sessions/${sessionId}${withEvidence ? "?withEvidence=1" : ""}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) {
      toast.success("会话已删除");
      window.dispatchEvent(new Event("sessions:changed"));
      router.push("/archive?tab=sessions");
    } else {
      toast.error("删除失败");
    }
  };

  const openWorkspace = useCallback(
    (blockId: string) => router.push(`/w/${blockId}?s=${sessionId}`),
    [router, sessionId],
  );

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
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-[44rem] flex-col px-4 md:min-h-dvh md:px-6">
      {/* 会话头 */}
      <header className="sticky top-14 z-20 -mx-4 border-b border-line bg-bg/97 px-4 py-2.5 backdrop-blur-md md:top-0 md:-mx-6 md:px-6">
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
            tone={session?.mode === "infinite" ? "neutral" : session?.mode === "review" ? "warn" : "accent"}
            className="shrink-0 whitespace-nowrap"
          >
            {session?.mode === "goal" ? "目标学习" : session?.mode === "review" ? "复习" : "无限学习"}
          </Badge>
          {session?.mode === "review" && session.focusConceptName ? (
            <span className="hidden shrink-0 truncate text-[12px] text-ink3 sm:inline">
              聚焦：{session.focusConceptName}
            </span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <OverflowMenu label="">
              <MenuItem onClick={generateSummary} disabled={pending || messages.length === 0}>
                <FileText className="size-3.5" /> 生成本次学习小结
              </MenuItem>
              <MenuItem onClick={() => router.push("/archive?tab=concepts")}>
                <BookMarked className="size-3.5" /> 学习档案
              </MenuItem>
              <MenuItem onClick={() => setDeleteOpen(true)} tone="danger">
                <Trash2 className="size-3.5" /> 删除会话
              </MenuItem>
            </OverflowMenu>
          </div>
        </div>
        {session?.mode === "goal" && session.planId ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink3">
            <Link href={`/plan/${session.planId}`} className="hover:text-accentink hover:underline">
              {session.planTitle ?? "学习计划"}
            </Link>
            {session.planItemId ? (
              <>
                <span>/</span>
                <Link
                  href={`/plan/${session.planId}/course/${session.planItemId}`}
                  className="hover:text-accentink hover:underline"
                >
                  {session.courseTitle ?? activeCourse?.title ?? "课程"}
                </Link>
                {activeCourse ? (
                  <span className="text-ink3">
                    · {activeCourse.progress.mastered}/{activeCourse.progress.total} 个知识点已掌握
                  </span>
                ) : null}
              </>
            ) : planningSession ? (
              <>
                <span>
                  · 规划会话 · {activePlan?.status === "active" ? "计划已确认" : "计划待确认"}
                </span>
                <Link
                  href={`/plan/${session.planId}`}
                  className="text-accentink hover:underline"
                >
                  {activePlan?.status === "active" ? "查看计划" : "去确认"}
                </Link>
              </>
            ) : (
              <span>· 尚未绑定课程</span>
            )}
          </div>
        ) : session?.mode === "review" && session.planTitle ? (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[12px] text-ink3">
            <span>{session.planTitle}</span>
            {session.courseTitle ? <span>· {session.courseTitle}</span> : null}
            <span>· 只更新这个知识点的证据</span>
          </div>
        ) : null}
        {/* 目标/复习会话的计划与课程已经在上一行给过了，再挂一条 #计划名 只是重复 */}
        {session?.topics?.length && session.mode === "infinite" ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {session.topics.map((t) => (
              <span key={t.id} className="text-[12px] text-ink3">
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
              <h1 className="font-serif text-[22px] leading-tight tracking-tight text-ink">
                {session?.mode === "goal" ? "先定一个目标" : session?.mode === "review" ? "复习一下" : "想学点什么？"}
              </h1>
              <p className="text-[13.5px] leading-relaxed text-ink2">
                {session?.mode === "goal"
                  ? "说说想系统学什么，我先给一份计划草稿，你确认后再开始。"
                  : session?.mode === "review"
                    ? "先答，再看这次作答怎么影响掌握度。"
                    : "直接问，或贴一段看不懂的内容。"}
              </p>
              {session?.mode === "goal" ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink3">
                  <FolderOpen className="size-3.5" />
                  <span>已确认的计划可以在</span>
                  <Link href="/plan" className="text-accentink hover:underline">
                    目标学习
                  </Link>
                  <span>里继续。</span>
                </div>
              ) : null}
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
                  onRetry={
                    m.id === lastAssistant?.id &&
                    m.status === "error" &&
                    m.error !== "AI_NOT_CONFIGURED" &&
                    !pending
                      ? retryLast
                      : undefined
                  }
                  onNextStep={m.id === lastAssistant?.id ? goNext : undefined}
                  nextStepLabel={
                    m.id === lastAssistant?.id
                      ? session?.mode === "goal"
                        ? continueLabel
                        : session?.mode === "review"
                          ? "继续复习"
                          : "继续"
                      : undefined
                  }
                />
              ),
            )}

            {showTeachingActions ? (
              <NextActions actions={teachingActions} busy={pending} />
            ) : null}

            {pending ? (
              <div className="animate-rise">
                <div className="mb-1.5 flex items-center gap-1.5 text-[12px] text-ink3">
                  <Sparkles className="size-3" />
                  Lumina
                  {toolStatus ? <span className="ml-1 animate-pulse-soft">正在生成{toolLabel(toolStatus)}…</span> : null}
                </div>
                <StreamParts
                  parts={streamParts}
                  blocks={blocks}
                  onAsk={send}
                  onOpenWorkspace={openWorkspace}
                />
                {streamText ? (
                  <div className="stream-caret mt-2">
                    <ErrorBoundary label="streaming-text">
                      <Markdown>{stripPartialCitation(streamText)}</Markdown>
                    </ErrorBoundary>
                  </div>
                ) : !streamParts.length ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[13px] text-ink3">
                      <span className="flex gap-1">
                        <Dot /> <Dot delay={0.15} /> <Dot delay={0.3} />
                      </span>
                      {webStatusLine ??
                        (reasoningActive
                          ? `模型正在推理${elapsed ? ` · ${elapsed}s` : ""}…`
                          : elapsed >= 3
                            ? `思考中… ${elapsed}s`
                            : "思考中…")}
                    </div>
                    {liveSources.length ? <SourceCards sources={liveSources} loading /> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="flex items-start gap-2 rounded-xl border border-bad/30 bg-badsoft/40 px-3 py-2.5 text-[12.5px] text-bad">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <p>{error}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {!error.includes("配置") ? (
                      <button
                        type="button"
                        onClick={retryLast}
                        className="rounded-full border border-line bg-panel px-2.5 py-1 text-[12px] text-ink2 transition-colors hover:border-accent/50 hover:text-ink"
                      >
                        重试
                      </button>
                    ) : null}
                    <Link href="/settings" className="text-[12px] underline underline-offset-2">
                      检查模型设置
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

          </div>
        )}
      </div>

      {/* 输入区：手机上有消息后默认收成一条窄栏，把空间让给讲解/图表 */}
      <div className="sticky bottom-[60px] z-20 -mx-4 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur-md md:bottom-0 md:-mx-6 md:px-6">
        {messages.length > 0 && !composerExpanded ? (
          <div className="md:hidden">
            {pending ? (
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-2.5 text-[13px] text-ink3">
                  <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
                  <span className="truncate">正在生成{elapsed ? ` · ${elapsed}s` : ""}…</span>
                </div>
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="shrink-0 rounded-full border border-line bg-panel px-3 py-2 text-[12.5px] text-ink2"
                >
                  停止
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={expandComposer}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-panel px-3 py-2.5 text-left"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accentsoft text-accent">
                    <ArrowUp className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink3">
                    继续追问，或让我换种讲法 / 出题检验
                  </span>
                </button>
                {showJumpToLatest ? (
                  <button
                    type="button"
                    onClick={() => {
                      followLatest.current = true;
                      setShowJumpToLatest(false);
                      scrollToLatest("smooth");
                    }}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-ink2"
                    aria-label="回到最新消息"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
        <div className={cx(messages.length > 0 && !composerExpanded && "hidden md:block")}>
        {effectiveAi && !effectiveAi.configured ? (
          <div className="mb-2">
            <AiWarning ai={effectiveAi} />
          </div>
        ) : null}
        <div className="mb-1.5 flex flex-wrap items-center justify-end gap-2 px-1">
          <div className="flex items-center gap-1.5">
            {showJumpToLatest ? (
              <button
                onClick={() => {
                  followLatest.current = true;
                  setShowJumpToLatest(false);
                  scrollToLatest("smooth");
                }}
                className="flex items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-1 text-[12px] text-ink2 transition-colors hover:border-accent/50 hover:text-ink"
                aria-label="回到最新消息"
              >
                <ArrowDown className="size-3.5" />
                回到最新
              </button>
            ) : null}
            {messages.length > 0 ? (
              <button
                type="button"
                onClick={() => setComposerExpanded(false)}
                className="rounded-full border border-line bg-panel px-2.5 py-1 text-[12px] text-ink3 md:hidden"
              >
                收起
              </button>
            ) : null}
          </div>
        </div>
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
        {session?.mode !== "infinite" ? (
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-panel2/40 p-3 text-[12.5px] text-ink2">
            <input
              type="checkbox"
              checked={withEvidence}
              onChange={(e) => setWithEvidence(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>
              同时删除本会话产生的作答证据
              <span className="mt-0.5 block text-[12px] text-ink3">
                勾选后会删掉这条会话产生的证据，并按剩余证据
                <strong className="font-medium text-ink">重算掌握度</strong>——
                分数可能回落。历史快照与变更记录仍保留，可追溯。
              </span>
            </span>
          </label>
        ) : null}
      </Modal>
    </div>
  );
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
    save_plan: "计划草稿",
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

const UserMessage = memo(function UserMessage({ message }: { message: MessageDTO }) {
  return (
    <div className="flex flex-col items-end gap-1 animate-rise">
      <div className="flex items-center gap-1.5 text-[12px] text-ink3">
        <User className="size-3" /> 你
      </div>
      <div className="max-w-[92%] rounded-2xl rounded-tr-sm bg-panel2 px-3.5 py-2.5 text-[14.5px] leading-relaxed text-ink whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
});

/**
 * 流式组件的稳定外壳：delta 每 50ms 提交一次时，只有末尾的流式正文需要重渲染，
 * 已经渲染出来的组件（图表、练习等）不应跟着重算。
 */
const StreamParts = memo(function StreamParts({
  parts,
  blocks,
  onAsk,
  onOpenWorkspace,
}: {
  parts: MessagePart[];
  blocks: Record<string, BlockWithExercise>;
  onAsk: (t: string) => void;
  onOpenWorkspace: (id: string) => void;
}) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") {
          return (
            <div key={i} className="mt-2">
              <ErrorBoundary label="streaming-text">
                <Markdown>{stripPartialCitation(String(p.text ?? ""))}</Markdown>
              </ErrorBoundary>
            </div>
          );
        }
        if (p.type === "block" && p.blockId && blocks[p.blockId]) {
          return (
            <div key={i} className="mt-3">
              <BlockRenderer
                block={blocks[p.blockId]}
                onAsk={onAsk}
                onOpenWorkspace={() => onOpenWorkspace(p.blockId!)}
              />
            </div>
          );
        }
        if (p.type === "notice") {
          return <NoticeLine key={i} text={p.notice ?? ""} />;
        }
        return null;
      })}
    </>
  );
});

interface AssistantMessageProps {
  message: MessageDTO;
  blocks: Record<string, BlockWithExercise>;
  onAsk: (t: string) => void;
  onOpenWorkspace: (id: string) => void;
  onRetry?: () => void;
  onNextStep?: () => void | Promise<void>;
  nextStepLabel?: string;
}

function AssistantMessageImpl({
  message,
  blocks,
  onAsk,
  onOpenWorkspace,
  onRetry,
  onNextStep,
  nextStepLabel,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const hasParts = message.parts.length > 0;

  return (
    <div
      id={`m-${message.id}`}
      data-role="assistant"
      className="group flex scroll-mt-52 flex-col gap-1.5 animate-rise md:scroll-mt-24"
    >
      <div className="flex items-center gap-1.5 text-[12px] text-ink3">
        <Sparkles className="size-3 text-accent" /> Lumina
        {message.status === "error" ? <Badge tone="bad">生成中断</Badge> : null}
        {message.error === "AI_NOT_CONFIGURED" ? (
          <Link href="/settings" className="text-[12px] text-accentink underline">
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
      {message.status === "error" && message.error !== "AI_NOT_CONFIGURED" ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-panel px-3 py-2">
          <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink2">
            {message.error === "AI_ABORTED"
              ? "你停止了这次生成，已经讲出来的部分保留在上面。"
              : "这次回答没有正常完成，已经讲出来的部分保留在上面。"}
            {onRetry ? "重试会用同一条提问重新生成，不会多出一条提问。" : null}
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 rounded-full border border-line bg-panel2 px-3 py-1 text-[12px] font-medium text-ink transition-colors hover:border-accent/50 hover:text-accentink"
            >
              重试这次回答
            </button>
          ) : null}
        </div>
      ) : null}
      {message.sources && message.sources.length ? (
        <div className="mt-1.5">
          <SourceCards sources={message.sources} />
        </div>
      ) : message.content?.trim() ? (
        <p className="mt-1 text-[12px] text-ink3/80" title="没有检索到来源，内容来自模型知识">
          模型知识
        </p>
      ) : null}
      {message.model ? (
        <p className="mt-1 flex items-center gap-1 text-[12px] text-ink3/80" title="产出这条回答的模型">
          <Sparkles className="size-2.5" />
          {message.model}
        </p>
      ) : null}
    </div>
  );
}

const AssistantMessage = memo(AssistantMessageImpl, (prev, next) => {
  if (prev.message !== next.message) return false;
  if (
    prev.onAsk !== next.onAsk ||
    prev.onOpenWorkspace !== next.onOpenWorkspace ||
    prev.onRetry !== next.onRetry ||
    prev.onNextStep !== next.onNextStep ||
    prev.nextStepLabel !== next.nextStepLabel
  ) {
    return false;
  }
  if (prev.blocks === next.blocks) return true;
  // 流式过程中 blocks 只增不减：与本条消息无关的新组件不该触发重渲染
  for (const part of next.message.parts) {
    if (
      part.type === "block" &&
      part.blockId &&
      prev.blocks[part.blockId] !== next.blocks[part.blockId]
    ) {
      return false;
    }
  }
  return true;
});

function NoticeLine({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="flex items-center gap-1.5 text-[12px] text-ink3">
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


