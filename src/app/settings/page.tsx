"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Globe,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  Field,
  Modal,
  SectionHeader,
  Spinner,
  cx,
  inputClass,
} from "@/components/ui/kit";
import type { AiModelPublic, WebConfigPublic } from "@/lib/types";
import {
  DEFAULT_TEACHING_PROFILE,
  MAX_TEACHING_DIRECTIVE,
  buildTeachingStyleBlock,
  isDefaultTeachingProfile,
  type TeachingProfile,
} from "@/lib/teaching/profile";
import { formatDay } from "@/lib/utils";

type WebProvider = "searxng" | "tavily" | "brave";

const WEB_PROVIDER_LABEL: Record<WebProvider, string> = {
  searxng: "SearXNG（自建，免 Key）",
  tavily: "Tavily（需要 Key）",
  brave: "Brave Search API（需要 Key）",
};

/** 切换服务商时自动带出的官方地址，用户可以改 */
const WEB_PROVIDER_DEFAULT_BASE: Record<WebProvider, string> = {
  searxng: "",
  tavily: "https://api.tavily.com",
  brave: "https://api.search.brave.com",
};

const WEB_PROVIDER_KEY_URL: Record<WebProvider, string> = {
  searxng: "https://docs.searxng.org/admin/installation-docker.html",
  tavily: "https://tavily.com",
  brave: "https://brave.com/search/api/",
};

/** 测试失败时按错误码给"该改什么"，只报错不给方向等于没说 */
const WEB_TEST_ADVICE: Record<string, string> = {
  WEB_NOT_CONFIGURED: "先把地址或 Key 填上",
  WEB_UNAUTHORIZED: "Key 无效或没权限，去服务商后台确认后重填",
  WEB_RATE_LIMIT: "服务商限流了，等一会儿再试，或把超时调大",
  WEB_TIMEOUT: "搜索服务没在超时内返回：自建服务可能没起来，或把超时调大一点",
  WEB_NETWORK: "连不上服务地址：检查地址是否正确、服务是否在运行、本机网络是否可达",
  WEB_BAD_RESPONSE: "服务返回了非预期内容：确认 SearXNG 已在 settings.yml 里打开 json 格式",
};

interface WebStatus extends WebConfigPublic {
  stats?: {
    days: number;
    searches: number;
    cacheHits: number;
    failures: number;
    avgLatencyMs: number | null;
  };
  cacheRows?: number;
}

/** 域名名单里明显不是域名的行；返回空串表示没问题 */
function invalidDomainLines(allow: string, deny: string): string {
  return `${allow}\n${deny}`
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter(
      (x) =>
        !/^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(x),
    )
    .slice(0, 5)
    .join("、");
}

interface WebTestResult {
  ok: boolean;
  code?: string;
  message?: string;
  count?: number;
  latencyMs?: number;
  results?: { title: string; url: string }[];
}

interface AiLegacyStatus {
  configured: boolean;
  source: "env" | "settings" | "none";
  model: string;
  reason?: string;
}

interface Draft {
  label: string;
  provider: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  isDefault: boolean;
}

const EMPTY: Draft = {
  label: "",
  provider: "openai",
  baseUrl: "",
  model: "",
  apiKey: "",
  temperature: 0.6,
  isDefault: false,
};

const PRESETS = [
  { name: "DeepSeek", provider: "openai" as const, baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { name: "通义千问", provider: "openai" as const, baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { name: "Kimi", provider: "openai" as const, baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { name: "智谱 GLM", provider: "openai" as const, baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-plus" },
  { name: "火山方舟", provider: "openai" as const, baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "" },
  { name: "Ollama 本地", provider: "openai" as const, baseUrl: "http://127.0.0.1:11434/v1", model: "qwen2.5:7b" },
  { name: "OpenAI", provider: "openai" as const, baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { name: "Anthropic", provider: "anthropic" as const, baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
];

interface SystemInfo {
  dbPath: string;
  dbSizeKb: number;
  counts: Record<string, number>;
  node: string;
}

/** 与 src/lib/db/usage.ts 的 UsageBucket 对齐；客户端不 import 服务端模块 */
interface UsageBucket {
  calls: number;
  okCalls: number;
  failedCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgLatencyMs: number | null;
}

interface UsageModelRow extends UsageBucket {
  model: string;
  lastUsedAt: number | null;
}

interface UsageSummary {
  generatedAt: number;
  days: number;
  today: UsageBucket;
  month: UsageBucket;
  all: UsageBucket;
  byModel: UsageModelRow[];
}

export default function SettingsPage() {
  const [models, setModels] = useState<AiModelPublic[]>([]);
  const [legacy, setLegacy] = useState<AiLegacyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [system, setSystem] = useState<SystemInfo | null>(null);

  // ── 用量 ──
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AiModelPublic | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AiModelPublic | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // ── 联网检索 ──
  const [web, setWeb] = useState<WebStatus | null>(null);
  const [webOpen, setWebOpen] = useState(false);
  const [webCacheRows, setWebCacheRows] = useState(0);
  const [webDraft, setWebDraft] = useState({
    enabled: false,
    provider: "searxng" as WebProvider,
    baseUrl: "",
    apiKey: "",
    maxSources: 3,
    timeoutMs: 4000,
    ttlDays: 7,
    defaultMode: "off" as "off" | "manual",
    allowDomains: "",
    denyDomains: "",
    maxSearchesPerSession: 6,
  });
  const [webSaving, setWebSaving] = useState(false);
  const [webTesting, setWebTesting] = useState(false);
  const [webTestResult, setWebTestResult] = useState<WebTestResult | null>(null);

  // ── 讲解风格 ──
  const [teaching, setTeaching] = useState<TeachingProfile>(DEFAULT_TEACHING_PROFILE);
  const [teachingOpen, setTeachingOpen] = useState(false);
  const [teachingSaving, setTeachingSaving] = useState(false);
  const teachingIsDefault = isDefaultTeachingProfile(teaching);
  const teachingPreview = buildTeachingStyleBlock(teaching);

  const persistTeaching = useCallback(async (next: TeachingProfile, message: string) => {
    setTeachingSaving(true);
    try {
      const res = await fetch("/api/settings/teaching", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "保存失败");
      }
      const data = (await res.json()) as { profile?: TeachingProfile };
      if (data.profile) setTeaching(data.profile);
      toast.success(message);
    } catch (e) {
      toast.error((e as Error).message || "保存失败");
    } finally {
      setTeachingSaving(false);
    }
  }, []);

  const saveTeaching = () => void persistTeaching(teaching, "讲解风格已保存");
  const resetTeaching = () =>
    void persistTeaching(DEFAULT_TEACHING_PROFILE, "已恢复默认讲法：不再额外注入风格要求");

  const load = useCallback(async () => {
    const [mRes, aRes, sRes, wRes, tRes] = await Promise.all([
      fetch("/api/models", { cache: "no-store" }),
      fetch("/api/settings/ai", { cache: "no-store" }),
      fetch("/api/system", { cache: "no-store" }),
      fetch("/api/settings/web", { cache: "no-store" }),
      fetch("/api/settings/teaching", { cache: "no-store" }),
    ]);
    if (mRes.ok) {
      const data = (await mRes.json()) as { models: AiModelPublic[] };
      setModels(data.models ?? []);
    }
    if (aRes.ok) setLegacy((await aRes.json()) as AiLegacyStatus);
    if (sRes.ok) setSystem((await sRes.json()) as SystemInfo);
    if (wRes.ok) {
      const w = (await wRes.json()) as WebStatus;
      setWeb(w);
      setWebCacheRows(Number(w.cacheRows ?? 0));
      setWebDraft({
        enabled: w.enabled,
        provider: w.provider,
        baseUrl: w.baseUrl,
        apiKey: "",
        maxSources: w.maxSources,
        timeoutMs: w.timeoutMs,
        ttlDays: w.ttlDays,
        defaultMode: w.defaultMode,
        allowDomains: w.allowDomains.join("\n"),
        denyDomains: w.denyDomains.join("\n"),
        maxSearchesPerSession: w.maxSearchesPerSession,
      });
    }
    if (tRes.ok) {
      const data = (await tRes.json()) as { profile?: TeachingProfile };
      if (data.profile) setTeaching(data.profile);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(false);
    try {
      const res = await fetch("/api/usage?days=30", { cache: "no-store" });
      if (!res.ok) {
        setUsageError(true);
        return;
      }
      const data = (await res.json()) as UsageSummary;
      setUsage(data);
    } catch {
      // 用量只是辅助信息：读不到就给可重试的提示，不影响设置页其它功能
      setUsageError(true);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  const openAdd = () => {
    setEditing(null);
    setDraft({ ...EMPTY, isDefault: models.length === 0 });
    setEditorOpen(true);
  };

  const openEdit = (m: AiModelPublic) => {
    setEditing(m);
    setDraft({
      label: m.label,
      provider: m.provider,
      baseUrl: m.baseUrl,
      model: m.model,
      apiKey: "",
      temperature: m.temperature,
      isDefault: m.isDefault,
    });
    setEditorOpen(true);
  };

  const save = async () => {
    if (!draft.baseUrl.trim() || !draft.model.trim()) {
      toast.error("Base URL 和模型名称都要填");
      return;
    }
    if (!editing && !draft.apiKey.trim() && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(draft.baseUrl)) {
      toast.error("远端模型必须填 API Key");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        label: draft.label.trim() || draft.model.trim(),
        provider: draft.provider,
        baseUrl: draft.baseUrl.trim(),
        model: draft.model.trim(),
        temperature: draft.temperature,
        isDefault: draft.isDefault,
      };
      if (draft.apiKey.trim()) payload.apiKey = draft.apiKey.trim();

      const res = await fetch(editing ? `/api/models/${editing.id}` : "/api/models", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { models?: AiModelPublic[]; model?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "保存失败");

      const savedId = editing?.id ?? (data.model as string | undefined);
      setModels(data.models ?? models);
      setEditorOpen(false);
      toast.success(editing ? "已保存修改" : "模型已添加");

      // 保存后立刻做一次真实连通测试，避免"存了个错的还以为能用"
      if (savedId) void testModel(savedId, { silentOk: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const testModel = async (id: string, opts: { silentOk?: boolean } = {}) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/models/${id}/test`, { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        latencyMs?: number;
        message?: string;
        detail?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "测试失败");
      if (data.ok) {
        if (!opts.silentOk) toast.success(`连通正常 · ${data.latencyMs}ms`);
      } else {
        toast.error(`连接失败：${data.message ?? "未知原因"}${data.detail ? `（${data.detail}）` : ""}`);
      }
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestingId(null);
    }
  };

  const makeDefault = async (m: AiModelPublic) => {
    const res = await fetch(`/api/models/${m.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    const data = (await res.json()) as { models?: AiModelPublic[]; error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "设置失败");
      return;
    }
    setModels(data.models ?? models);
    toast.success(`「${m.label}」已设为默认模型`);
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/models/${pendingDelete.id}`, { method: "DELETE" });
      const data = (await res.json()) as {
        models?: AiModelPublic[];
        defaultModel?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "删除失败");
      setModels(data.models ?? []);
      setPendingDelete(null);
      if ((data.models ?? []).length === 0) {
        toast.message("已删除最后一个模型配置", {
          description: "现在没有可用模型，对话页会提示未配置。",
        });
      } else {
        toast.success(
          data.defaultModel ? `已删除，默认模型现在是「${data.defaultModel}」` : "已删除",
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  /** 当前表单值：保存与测试共用，避免"测的是旧配置" */
  const webPayload = () => ({
    enabled: webDraft.enabled,
    provider: webDraft.provider,
    baseUrl: webDraft.baseUrl,
    apiKey: webDraft.apiKey || undefined,
    maxSources: webDraft.maxSources,
    timeoutMs: webDraft.timeoutMs,
    ttlDays: webDraft.ttlDays,
    defaultMode: webDraft.defaultMode,
    allowDomains: webDraft.allowDomains.split("\n").map((x) => x.trim()).filter(Boolean),
    denyDomains: webDraft.denyDomains.split("\n").map((x) => x.trim()).filter(Boolean),
    maxSearchesPerSession: webDraft.maxSearchesPerSession,
  });

  const saveWeb = async () => {
    setWebSaving(true);
    setWebTestResult(null);
    try {
      const res = await fetch("/api/settings/web", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(webPayload()),
      });
      const data = (await res.json()) as WebStatus & { error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "保存失败");
        // 保存失败时把开关退回服务端状态：否则页面上会出现"已勾选 + 徽标写关闭"的自相矛盾
        setWebDraft((d) => ({ ...d, enabled: web?.enabled ?? false }));
        return false;
      }
      setWeb(data);
      setWebCacheRows(Number(data.cacheRows ?? 0));
      setWebDraft((d) => ({ ...d, apiKey: "" }));
      toast.success("联网检索配置已保存");
      await load();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setWebSaving(false);
    }
  };

  /** 测试**当前表单**：改了地址/Key 不用先保存也能验证 */
  const testWeb = async () => {
    setWebTesting(true);
    setWebTestResult(null);
    try {
      const res = await fetch("/api/settings/web/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: webDraft.provider,
          baseUrl: webDraft.baseUrl,
          apiKey: webDraft.apiKey || undefined,
          timeoutMs: webDraft.timeoutMs,
          maxSources: webDraft.maxSources,
          allowDomains: webDraft.allowDomains.split("\n").map((x) => x.trim()).filter(Boolean),
          denyDomains: webDraft.denyDomains.split("\n").map((x) => x.trim()).filter(Boolean),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as WebTestResult & { error?: string };
      // 未配置时接口返回 400 + 可读原因，不能把它吞成一句“测试失败”。
      if (!res.ok) {
        const message = data.message ?? data.error ?? "测试失败";
        setWebTestResult({ ok: false, code: data.code, message });
        toast.error(message);
        return;
      }
      setWebTestResult(data);
      if (data.ok) {
        toast.success(`搜索可用 · ${data.latencyMs}ms · ${data.count} 条结果`);
      } else {
        toast.error(data.message ?? "搜索失败");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWebTesting(false);
    }
  };

  /** 保存并测试：先落库（失败就不测），再测刚保存的这套 */
  const saveAndTestWeb = async () => {
    const okSaved = await saveWeb();
    if (okSaved) await testWeb();
  };

  const clearWebCache = async () => {
    try {
      const res = await fetch("/api/settings/web", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clearCache" }),
      });
      const data = (await res.json().catch(() => ({}))) as { removed?: number; cacheRows?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "清空失败");
      setWebCacheRows(Number(data.cacheRows ?? 0));
      toast.success(`已清空 ${data.removed ?? 0} 条检索缓存`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /** 换服务商时把地址重置成该服务商的官方地址：两家的地址互不相通，留着旧值只会让人以为配好了 */
  const changeWebProvider = (provider: WebProvider) => {
    setWebDraft((d) =>
      d.provider === provider ? d : { ...d, provider, baseUrl: WEB_PROVIDER_DEFAULT_BASE[provider] },
    );
    setWebTestResult(null);
  };

  /** 通俗摘要：折叠状态下也要一眼看出现在是什么状态 */
  const webSummary = !web
    ? "未配置"
    : web.enabled
      ? web.configured
        ? `已启用 · ${web.provider === "searxng" ? "SearXNG" : web.provider === "tavily" ? "Tavily" : "Brave"}${web.defaultMode === "manual" ? " · 对话里默认打开" : ""}`
        : "已启用但还不能用（缺地址或 Key）"
      : "未启用";

  const teachingSummary = teachingIsDefault
    ? "未设置 · 使用默认讲法"
    : `${teaching.directive.trim() ? "自定义讲法" : "默认讲法"} · 篇幅 ${teaching.verbosity}/5${
        teaching.requireExample ? " · 必须举例" : ""
      }${teaching.requireCheckQuestion ? " · 讲完提问" : ""}`;

  const defaultModel = models.find((m) => m.isDefault) ?? models[0];
  const healthBadge = defaultModel?.configured
    ? defaultModel.lastError
      ? { tone: "bad" as const, text: "上次连接失败" }
      : defaultModel.lastOkAt
        ? { tone: "ok" as const, text: "可用" }
        : { tone: "neutral" as const, text: "已配置 · 未测试" }
    : legacy?.configured && legacy.source === "env"
      ? { tone: "ok" as const, text: "可用" }
      : { tone: "warn" as const, text: "待配置" };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-[26px] tracking-tight text-ink">设置</h1>
          <p className="mt-1 text-[13px] text-ink2">
            可配置多个模型，不同会话可以各用一个。
          </p>
        </div>
        <Button size="sm" icon={<Plus className="size-3.5" />} onClick={openAdd}>
          添加模型
        </Button>
      </div>

      <section className="mb-8">
        <SectionHeader
          title="模型服务"
          hint={
            models.length
              ? `${models.length} 个配置 · 默认「${defaultModel?.label ?? "—"}」`
              : legacy?.source === "env"
                ? "当前来自环境变量"
                : "尚未配置"
          }
          action={
            <Badge tone={healthBadge.tone}>
              {healthBadge.tone === "ok" ? <CheckCircle2 className="size-3" /> : null}
              {healthBadge.text}
            </Badge>
          }
        />

        {loading ? (
          <Card className="flex items-center gap-2 p-4 text-[13px] text-ink3">
            <Spinner /> 读取中…
          </Card>
        ) : models.length === 0 ? (
          <Card className="p-4">
            <p className="text-[13px] leading-relaxed text-ink2">
              {legacy?.source === "env"
                ? "当前正在使用环境变量里的模型配置（AI_BASE_URL / AI_MODEL / AI_API_KEY）。"
                : "还没有添加任何模型。"}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink3">
              添加后可以在对话框左下角切换；不同会话可以各用一个模型。Ollama 不需要填 Key。
            </p>
            <Button className="mt-3" size="sm" icon={<Plus className="size-3.5" />} onClick={openAdd}>
              添加第一个模型
            </Button>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {models.map((m) => (
              <Card key={m.id} className="p-3.5">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-[13.5px] font-medium text-ink">{m.label}</p>
                      {m.isDefault ? (
                        <Badge tone="accent">
                          <Star className="size-2.5" /> 默认
                        </Badge>
                      ) : null}
                      {m.configured ? (
                        <Badge tone="ok">已配 Key</Badge>
                      ) : (
                        <Badge tone="warn">缺 Key</Badge>
                      )}
                      {m.lastOkAt ? (
                        <Badge tone="neutral">上次正常 {m.lastTestMs ?? 0}ms</Badge>
                      ) : null}
                      {m.lastError ? <Badge tone="bad">上次失败</Badge> : null}
                    </div>
                    <p className="mt-1 truncate font-mono text-[12px] text-ink3">
                      {m.model} · {m.baseUrl}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink3">
                      {m.provider === "anthropic" ? "Anthropic 协议" : "OpenAI 兼容"} · 温度{" "}
                      {m.temperature.toFixed(1)}
                      {m.keyMasked ? ` · ${m.keyMasked}` : " · 无 Key"}
                    </p>
                    {m.lastError ? (
                      <p className="mt-1 line-clamp-2 rounded-lg bg-badsoft/40 px-2 py-1 text-[12px] leading-relaxed text-bad">
                        {m.lastError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={testingId === m.id}
                      onClick={() => void testModel(m.id)}
                      icon={<Wifi className="size-3.5" />}
                    >
                      测试
                    </Button>
                    {!m.isDefault ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void makeDefault(m)}
                        icon={<Star className="size-3.5" />}
                      >
                        设为默认
                      </Button>
                    ) : null}
                    <button
                      onClick={() => openEdit(m)}
                      className="rounded-full p-2 text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
                      aria-label={`编辑 ${m.label}`}
                      title="编辑"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(m)}
                      className="rounded-full p-2 text-ink3 transition-colors hover:bg-badsoft hover:text-bad"
                      aria-label={`删除 ${m.label}`}
                      title="删除"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
            <p className="mt-1 text-[12px] leading-relaxed text-ink3">
              切换只影响当前会话，会被记住。
            </p>
          </div>
        )}

        {legacy && !legacy.configured && models.length === 0 ? (
          <p className="mt-2 rounded-lg bg-warnsoft/60 px-3 py-2 text-[12px] leading-relaxed text-ink2">
            {legacy.reason}。没有真实模型时，应用不会用固定文本冒充教学——对话页会明确提示未配置。
          </p>
        ) : null}
      </section>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `编辑「${editing.label}」` : "添加模型"}
        wide
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button size="sm" loading={saving} onClick={save} icon={<Save className="size-3.5" />}>
              保存并测试
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-ink">快速填充</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => {
                    setDraft((d) => ({
                      ...d,
                      label: d.label || p.name,
                      provider: p.provider,
                      baseUrl: p.baseUrl,
                      model: p.model || d.model,
                    }));
                  }}
                  className="rounded-full border border-line bg-panel px-2.5 py-1 text-[12px] text-ink2 transition-colors hover:border-accent/50 hover:text-ink"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="名称" hint="显示在对话里的名字">
              <input
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                className={inputClass}
                placeholder="例如：火山方舟 / 便宜模型"
              />
            </Field>
            <Field label="模型名称" hint="服务商给的 model id">
              <input
                value={draft.model}
                onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                className={cx(inputClass, "font-mono text-[12.5px]")}
                placeholder="deepseek-chat"
              />
            </Field>
          </div>

          <Field label="Base URL" hint="写到 /v1 为止，不要带 /chat/completions">
            <input
              value={draft.baseUrl}
              onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
              className={cx(inputClass, "font-mono text-[12.5px]")}
              placeholder="https://api.deepseek.com/v1"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="协议">
              <select
                value={draft.provider}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, provider: e.target.value as Draft["provider"] }))
                }
                className={inputClass}
              >
                <option value="openai">OpenAI 兼容（推荐）</option>
                <option value="anthropic">Anthropic Messages</option>
              </select>
            </Field>
            <Field
              label="API Key"
              hint={
                editing
                  ? `当前：${editing.keyMasked || "未设置"}（留空不修改）`
                  : "Ollama 可留空"
              }
            >
              <input
                type="password"
                value={draft.apiKey}
                onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                className={cx(inputClass, "font-mono text-[12.5px]")}
                placeholder={editing ? "••••••••（留空保持不变）" : "sk-..."}
                autoComplete="off"
              />
            </Field>
          </div>

          <Field label={`温度 ${draft.temperature.toFixed(1)}`} hint="低=稳定，高=发散。教学建议 0.5–0.7">
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={draft.temperature}
              onChange={(e) => setDraft((d) => ({ ...d, temperature: Number(e.target.value) }))}
              className="w-full accent-[var(--accent)]"
            />
          </Field>

          <label className="flex items-start gap-2 text-[12.5px] text-ink2">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))}
              className="mt-0.5 size-3.5 accent-[var(--accent)]"
            />
            设为默认模型（新会话默认用它）
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="删除这个模型配置？"
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
          将删除「{pendingDelete?.label}」（{pendingDelete?.model}）及其 Key。
        </p>
        <p className="mt-2 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink2">
          已经用这个模型产生的学习记录、证据和对话都<span className="font-medium text-ink">不会</span>被删除；
          正在使用它的会话会自动回到默认模型。
        </p>
      </Modal>

      <section className="mb-8">
        <SectionHeader
          title="讲解风格"
          hint={teachingOpen ? "只影响讲解方式，不改事实准确性与安全约束" : teachingSummary}
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setTeachingOpen((v) => !v)}
              icon={
                <ChevronDown
                  className={cx("size-3.5 transition-transform", teachingOpen ? "rotate-180" : "")}
                />
              }
            >
              {teachingOpen ? "收起" : "展开"}
            </Button>
          }
        />
        {teachingOpen ? (
          <Card className="flex flex-col gap-4 p-4">
            <Field
              label="你希望我怎么讲"
              hint={`最多 ${MAX_TEACHING_DIRECTIVE} 字；留空就是默认讲法，不额外注入`}
            >
              <textarea
                className={cx(inputClass, "min-h-[92px] resize-y")}
                maxLength={MAX_TEACHING_DIRECTIVE}
                value={teaching.directive}
                onChange={(e) => setTeaching((t) => ({ ...t, directive: e.target.value }))}
                placeholder="例如：先给结论再解释原因；多用真实数字；不要用「显然」这类词。"
              />
            </Field>

            <Field
              label={`篇幅 ${teaching.verbosity}/5`}
              hint="1=只讲关键点，3=讲清思路，5=完整展开并补边界情况"
            >
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={teaching.verbosity}
                onChange={(e) => setTeaching((t) => ({ ...t, verbosity: Number(e.target.value) }))}
                className="w-full accent-[var(--accent)]"
                aria-label="篇幅 1 到 5"
              />
            </Field>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[13px] text-ink2">
                <input
                  type="checkbox"
                  checked={teaching.requireExample}
                  onChange={(e) => setTeaching((t) => ({ ...t, requireExample: e.target.checked }))}
                  className="size-3.5 accent-[var(--accent)]"
                />
                每次讲解至少给一个具体例子或数字
              </label>
              <label className="flex items-center gap-2 text-[13px] text-ink2">
                <input
                  type="checkbox"
                  checked={teaching.requireCheckQuestion}
                  onChange={(e) => setTeaching((t) => ({ ...t, requireCheckQuestion: e.target.checked }))}
                  className="size-3.5 accent-[var(--accent)]"
                />
                讲完后用一个具体问题检验我是否跟上
              </label>
            </div>

            <details className="rounded-xl border border-line bg-panel2/40 px-3 py-2.5">
              <summary className="cursor-pointer select-none text-[12.5px] text-ink2">
                {teachingPreview
                  ? "保存后注入给模型的提示词（点开查看）"
                  : "当前为默认讲法：不会额外注入任何提示词"}
              </summary>
              {teachingPreview ? (
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-ink3">
                  {teachingPreview}
                </pre>
              ) : null}
            </details>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button
                size="sm"
                icon={<Save className="size-3.5" />}
                loading={teachingSaving}
                onClick={saveTeaching}
              >
                保存
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={teachingIsDefault || teachingSaving}
                onClick={resetTeaching}
              >
                恢复默认
              </Button>
              <span className="ml-auto text-[12px] text-ink3">
                {teachingIsDefault ? "当前：默认讲法" : "保存后只影响新消息"}
              </span>
            </div>
          </Card>
        ) : null}
      </section>

      <section className="mb-8">
        <SectionHeader
          title="联网检索"
          hint={webOpen ? "需要时手动查证；关闭时完全不发请求" : webSummary}
          action={
            <div className="flex items-center gap-2">
              {web?.enabled ? (
                <Badge tone={web.configured ? "ok" : "warn"}>
                  <Globe className="size-3" /> {web.configured ? "已启用" : "待配置"}
                </Badge>
              ) : (
                <Badge tone="neutral">关闭</Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setWebOpen((v) => !v)}
                icon={
                  <ChevronDown
                    className={cx("size-3.5 transition-transform", webOpen ? "rotate-180" : "")}
                  />
                }
              >
                {webOpen ? "收起" : "展开"}
              </Button>
            </div>
          }
        />

        {webOpen ? (
          <Card className="flex flex-col gap-4 p-4">
            <label className="flex items-start gap-2.5 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={webDraft.enabled}
                onChange={(e) => setWebDraft((d) => ({ ...d, enabled: e.target.checked }))}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                启用联网检索
                <span className="mt-0.5 block text-[12px] leading-relaxed text-ink3">
                  只发本轮问题（手机号 / 邮箱 / 身份证 / 长数字会先脱敏），不发材料、历史与作答记录。
                </span>
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="搜索服务" hint="选一个可用的后端">
                <select
                  value={webDraft.provider}
                  onChange={(e) => changeWebProvider(e.target.value as WebProvider)}
                  className={inputClass}
                >
                  {(["searxng", "tavily", "brave"] as const).map((p) => (
                    <option key={p} value={p}>
                      {WEB_PROVIDER_LABEL[p]}
                    </option>
                  ))}
                </select>
              </Field>
              {webDraft.provider === "searxng" ? (
                <Field label="SearXNG 地址" hint="必填，例如 http://127.0.0.1:8888">
                  <input
                    value={webDraft.baseUrl}
                    onChange={(e) => setWebDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                    className={cx(inputClass, "font-mono text-[12.5px]")}
                    placeholder="http://127.0.0.1:8888"
                  />
                </Field>
              ) : (
                <Field
                  label="API Key"
                  hint={web?.keyMasked ? `当前：${web.keyMasked}（留空不修改）` : "必填"}
                >
                  <input
                    type="password"
                    value={webDraft.apiKey}
                    onChange={(e) => setWebDraft((d) => ({ ...d, apiKey: e.target.value }))}
                    className={cx(inputClass, "font-mono text-[12.5px]")}
                    placeholder="粘贴 Key"
                    autoComplete="off"
                  />
                </Field>
              )}
            </div>

            <p className="text-[12px] leading-relaxed text-ink3">
              {webDraft.provider === "searxng" ? (
                <>
                  自建示例：<code className="font-mono">docker run -d -p 8888:8080 searxng/searxng</code>
                  ，并在 settings.yml 里打开 json 格式。本机 / 内网地址会自动放行。
                </>
              ) : (
                <>
                  在
                  <a
                    href={WEB_PROVIDER_KEY_URL[webDraft.provider]}
                    target="_blank"
                    rel="noreferrer"
                    className="mx-1 text-accentink underline underline-offset-2"
                  >
                    {webDraft.provider === "tavily" ? "tavily.com" : "brave.com/search/api"}
                  </a>
                  申请 Key；Key 只存在本机数据库，不回显完整内容。
                </>
              )}
            </p>

            <label className="flex items-start gap-2.5 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={webDraft.defaultMode === "manual"}
                onChange={(e) =>
                  setWebDraft((d) => ({ ...d, defaultMode: e.target.checked ? "manual" : "off" }))
                }
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                在对话里默认打开联网
                <span className="mt-0.5 block text-[12px] leading-relaxed text-ink3">
                  对话输入框旁的地球按钮随时可以临时开关，不会改这里的默认值。
                </span>
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button
                size="sm"
                loading={webSaving || webTesting}
                disabled={webTesting}
                onClick={saveAndTestWeb}
                icon={<Wifi className="size-3.5" />}
              >
                保存并测试
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={webTesting}
                onClick={testWeb}
                icon={<Search className="size-3.5" />}
              >
                测试当前设置
              </Button>
              {web?.stats ? (
                <span className="ml-auto text-[12px] text-ink3">
                  近 7 天：{web.stats.searches} 次检索 · 缓存命中 {web.stats.cacheHits} · 失败{" "}
                  {web.stats.failures}
                </span>
              ) : null}
            </div>

            {webTestResult ? (
              <div
                className={cx(
                  "rounded-xl border px-3 py-2.5 text-[12.5px] leading-relaxed",
                  webTestResult.ok ? "border-ok/40 bg-oksoft/40" : "border-bad/40 bg-badsoft/40",
                )}
              >
                {webTestResult.ok ? (
                  <>
                    <p className="text-ink">
                      搜索可用 · {webTestResult.latencyMs}ms · 返回 {webTestResult.count} 条
                      {webTestResult.results?.length ? "，前几条：" : ""}
                    </p>
                    {webTestResult.results?.length ? (
                      <ul className="mt-1.5 space-y-1">
                        {webTestResult.results.map((r) => (
                          <li key={`${r.url}-${r.title}`} className="truncate text-ink2">
                            · {r.title} <span className="text-ink3">（{r.url}）</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-ink">
                      测试失败：{webTestResult.message ?? "未知原因"}
                      {webTestResult.code ? (
                        <span className="ml-1 font-mono text-[11.5px] text-ink3">{webTestResult.code}</span>
                      ) : null}
                    </p>
                    {webTestResult.code && WEB_TEST_ADVICE[webTestResult.code] ? (
                      <p className="mt-1 text-ink2">建议：{WEB_TEST_ADVICE[webTestResult.code]}</p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            <details className="rounded-xl border border-line bg-panel2/40 px-3 py-2.5">
              <summary className="cursor-pointer select-none text-[12.5px] text-ink2">
                高级设置（一般不用改）
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-4">
                <SliderField
                  label="最大来源"
                  value={webDraft.maxSources}
                  hint="每次最多采信 1–5 条"
                  min={1}
                  max={5}
                  onChange={(v) => setWebDraft((d) => ({ ...d, maxSources: v }))}
                />
                <SliderField
                  label="超时"
                  value={Number((webDraft.timeoutMs / 1000).toFixed(1))}
                  suffix="s"
                  hint="超 2–10 秒按未核实处理"
                  min={2}
                  max={10}
                  step={0.5}
                  onChange={(v) => setWebDraft((d) => ({ ...d, timeoutMs: Math.round(v * 1000) }))}
                />
                <SliderField
                  label="缓存"
                  value={webDraft.ttlDays}
                  suffix=" 天"
                  hint="1–30 天内不重复请求"
                  min={1}
                  max={30}
                  onChange={(v) => setWebDraft((d) => ({ ...d, ttlDays: v }))}
                />
                <SliderField
                  label="每会话检索上限"
                  value={webDraft.maxSearchesPerSession}
                  suffix=" 次"
                  hint="缓存命中不计数"
                  min={1}
                  max={30}
                  onChange={(v) => setWebDraft((d) => ({ ...d, maxSearchesPerSession: v }))}
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="域名白名单" hint="每行一个，支持 *.gov.cn；留空表示不限制">
                  <textarea
                    value={webDraft.allowDomains}
                    onChange={(e) => setWebDraft((d) => ({ ...d, allowDomains: e.target.value }))}
                    rows={3}
                    className={cx(inputClass, "font-mono text-[12px]")}
                    placeholder={"gov.cn\nmoe.edu.cn"}
                  />
                </Field>
                <Field label="域名黑名单" hint="命中的直接丢弃">
                  <textarea
                    value={webDraft.denyDomains}
                    onChange={(e) => setWebDraft((d) => ({ ...d, denyDomains: e.target.value }))}
                    rows={3}
                    className={cx(inputClass, "font-mono text-[12px]")}
                  />
                </Field>
              </div>

              {invalidDomainLines(webDraft.allowDomains, webDraft.denyDomains) ? (
                <p className="mt-1.5 text-[12px] text-bad">
                  这些行看起来不是域名：{invalidDomainLines(webDraft.allowDomains, webDraft.denyDomains)}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
                <span className="text-[12px] text-ink3">
                  检索缓存 {webCacheRows} 条（同一问题不重复请求）
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearWebCache}
                  disabled={webCacheRows === 0}
                  icon={<Trash2 className="size-3.5" />}
                >
                  清空缓存
                </Button>
              </div>
            </details>

            <p className="rounded-lg bg-panel2/50 px-3 py-2 text-[12px] leading-relaxed text-ink3">
              判题与解析不走检索；失败或超时时会明说「未能联网核实」，不摆来源卡片。
            </p>
          </Card>
        ) : null}
      </section>

      <section className="mb-8">
        <SectionHeader
          title="用量"
          hint={
            usage && usage.all.calls > 0
              ? `累计 ${usage.all.calls} 次调用 · 来自本机使用记录`
              : "真实 token 消耗"
          }
          action={
            <Button
              size="sm"
              variant="ghost"
              loading={usageLoading}
              onClick={() => void loadUsage()}
              icon={<RefreshCw className="size-3.5" />}
            >
              刷新
            </Button>
          }
        />

        <Card className="p-4">
          {usage === null ? (
            usageError ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-ink2">用量读取失败。</span>
                <Button size="sm" variant="ghost" onClick={() => void loadUsage()} icon={<RefreshCw className="size-3.5" />}>
                  重试
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[13px] text-ink3">
                <Spinner /> 读取中…
              </div>
            )
          ) : usage.all.calls === 0 ? (
            <p className="text-[13px] leading-relaxed text-ink2">
              还没有调用记录。发起一次对话后，这里会显示真实的 token 消耗、平均耗时和失败次数。
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["今日", usage.today],
                  ["本月", usage.month],
                  ["累计", usage.all],
                ] as const).map(([label, b]) => (
                  <div key={label}>
                    <p className="text-[12px] text-ink3">{label}</p>
                    <p className="mt-0.5 flex items-baseline gap-1">
                      <span className="font-serif text-xl tabular-nums text-ink">
                        {formatTokens(b.totalTokens)}
                      </span>
                      <span className="text-[11px] text-ink3">tokens</span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink3">
                      {b.calls} 次调用 · {b.avgLatencyMs == null ? "平均 —" : `平均 ${formatLatency(b.avgLatencyMs)}`}
                    </p>
                    {b.failedCalls > 0 ? (
                      <p className="mt-0.5 text-[12px] text-bad">失败 {b.failedCalls} 次</p>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-line pt-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] font-medium text-ink">按模型</p>
                  <p className="text-[12px] text-ink3">最近 {usage.days} 天 · 按调用次数排序</p>
                </div>
                {usage.byModel.length === 0 ? (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink3">
                    最近 {usage.days} 天没有调用记录；累计数据仍可在上方查看。
                  </p>
                ) : (
                  <div className="mt-1 divide-y divide-line">
                    {usage.byModel.map((m) => (
                      <div
                        key={m.model || "unknown"}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-[12.5px] text-ink">
                            {m.model || "未知模型"}
                          </p>
                          <p className="mt-0.5 text-[12px] leading-relaxed text-ink3">
                            {m.calls} 次 · 失败 {m.failedCalls} 次 ·{" "}
                            {m.avgLatencyMs == null ? "平均 —" : `平均 ${formatLatency(m.avgLatencyMs)}`}
                            {m.lastUsedAt ? ` · 最近 ${formatDay(m.lastUsedAt)}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular-nums text-[12.5px] text-ink">
                            {formatTokens(m.totalTokens)} tokens
                          </p>
                          <p className="mt-0.5 tabular-nums text-[12px] text-ink3">
                            入 {formatTokens(m.promptTokens)} · 出 {formatTokens(m.completionTokens)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </section>

      <section className="mb-8 mt-8">
        <SectionHeader title="数据" hint="SQLite 数据库" />
        <Card className="p-4">
          {system ? (
            <>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {[
                  ["会话", system.counts.sessions],
                  ["消息", system.counts.messages],
                  ["知识点", system.counts.concepts],
                  ["练习", system.counts.exercises],
                  ["作答", system.counts.attempts],
                  ["证据", system.counts.evidence],
                ].map(([label, v]) => (
                  <div key={String(label)}>
                    <p className="font-serif text-lg tabular-nums text-ink">{v as number}</p>
                    <p className="text-[12px] text-ink3">{label as string}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 break-all rounded-lg bg-panel2/60 px-2.5 py-2 font-mono text-[12px] text-ink3">
                {system.dbPath} · {system.dbSizeKb} KB · Node {system.node}
              </p>
            </>
          ) : (
            <div className="flex items-center gap-2 text-[13px] text-ink3">
              <Spinner /> 读取中…
            </div>
          )}
          <p className="mt-2 text-[12px] leading-relaxed text-ink3">
            删会话不删学习证据；要一起删，在删除对话框里勾选。
          </p>
        </Card>
      </section>

      <section>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-line bg-panel px-4 py-3 transition-colors hover:border-linestrong [&::-webkit-details-marker]:hidden">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-serif text-[16px] text-ink">开源复用与许可</span>
              <span className="text-[12px] text-ink3">8 项 · 保留原始版权声明</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-ink3 transition-transform group-open:rotate-180" />
          </summary>
          <Card className="mt-2 divide-y divide-line p-0">
          {[
            { name: "OpenTutor", license: "MIT", usage: "BKT 知识追踪算法移植（knowledge_tracer.py → src/lib/learning/mastery.ts）；块式教学组件注册思路", url: "https://github.com/zijinz456/OpenTutor" },
            { name: "better-sqlite3", license: "MIT", usage: "SQLite 持久化", url: "https://github.com/WiseLibs/better-sqlite3" },
            { name: "KaTeX", license: "MIT", usage: "公式渲染", url: "https://github.com/KaTeX/KaTeX" },
            { name: "react-markdown", license: "MIT", usage: "Markdown 渲染", url: "https://github.com/remarkjs/react-markdown" },
            { name: "Recharts", license: "MIT", usage: "图表", url: "https://github.com/recharts/recharts" },
            { name: "Next.js / React", license: "MIT", usage: "应用框架", url: "https://github.com/vercel/next.js" },
            { name: "lucide-react", license: "ISC", usage: "图标", url: "https://github.com/lucide-icons/lucide" },
            { name: "sonner", license: "MIT", usage: "轻提示", url: "https://github.com/emilkowalski/sonner" },
          ].map((l) => (
            <div key={l.name} className="flex items-start gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink">
                  {l.name} <span className="ml-1 text-[12px] text-ink3">{l.license}</span>
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink3">{l.usage}</p>
              </div>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 shrink-0 text-ink3 hover:text-accent"
                aria-label={`打开 ${l.name}`}
              >
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          ))}
        </Card>
        </details>
        <p className="mt-2 text-[12px] leading-relaxed text-ink3">
          本项目自身以 MIT 发布。第三方源码的完整许可证见仓库 THIRD_PARTY_NOTICES.md。
        </p>
        <p className="mt-2 text-[12px] text-ink3">
          想删掉某个模型只是不想再用它？删配置不会删学习记录。
          <Link href="/library" className="ml-1 underline">
            去学习档案
          </Link>
        </p>
      </section>
    </div>
  );
}

/** 滑块字段：标签 / 当前值 / 说明三层分开，别把三种语义挤在一行 */
function SliderField({
  label,
  value,
  suffix = "",
  hint,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-ink2">{label}</span>
        <span className="font-mono text-[13px] tabular-nums text-ink">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--accent)]"
      />
      <span className="mt-1 block text-[12px] leading-relaxed text-ink3">{hint}</span>
    </label>
  );
}

// ── 用量卡片用的格式化：只处理展示，不改数据 ──

/** token 数：千分位；超过 100 万用 M 缩写 */
function formatTokens(n: number): string {
  const value = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  if (value < 1_000_000) return value.toLocaleString("zh-CN");
  const millions = value / 1_000_000;
  if (millions >= 100) return `${Math.round(millions)}M`;
  return `${millions.toFixed(1).replace(/\.0$/, "")}M`;
}

/** 平均耗时：1 秒以下用 ms，以上用 s；没有样本时显示 "—" */
function formatLatency(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)}s`;
}
