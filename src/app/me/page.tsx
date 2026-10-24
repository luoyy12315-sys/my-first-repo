"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FolderOpen,
  History,
  Library,
  Settings,
  Sparkles,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Spinner } from "@/components/ui/kit";
import type { AiModelPublic } from "@/lib/types";

const LINKS = [
  {
    href: "/library",
    title: "学习档案",
    description: "按课程看知识点与掌握依据",
    icon: Library,
  },
  {
    href: "/history",
    title: "学习历史",
    description: "所有对话、规划与复习记录",
    icon: History,
  },
  {
    href: "/materials",
    title: "学习材料",
    description: "上传 PDF / Word / 笔记，让回答引用它们",
    icon: FolderOpen,
  },
  {
    href: "/settings",
    title: "设置",
    description: "模型服务、讲解风格与联网检索",
    icon: Settings,
  },
];

export default function MePage() {
  const [models, setModels] = useState<AiModelPublic[] | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/models", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { models: AiModelPublic[] };
        setModels(data.models ?? []);
      } else {
        setModels([]);
      }
    } catch {
      setModels([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const model = models?.find((m) => m.isDefault) ?? models?.[0] ?? null;

  const testModel = async () => {
    if (!model || testing) return;
    setTesting(true);
    try {
      const res = await fetch(`/api/models/${model.id}/test`, { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        latencyMs?: number;
        message?: string;
        detail?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "测试失败");
      if (data.ok) toast.success(`连通正常 · ${data.latencyMs}ms`);
      else toast.error(`连接失败：${data.message ?? "未知原因"}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-ink3">
          <Sparkles className="size-3.5" /> 我的
        </div>
        <h1 className="font-serif text-[26px] tracking-tight text-ink">学习之外</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink2">
          档案、历史、材料和设置都收在这里。
        </p>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink3">模型服务</h2>
        <Card className="p-4">
          {models === null ? (
            <div className="flex items-center gap-2 text-[13px] text-ink3">
              <Spinner /> 读取中…
            </div>
          ) : !model ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13.5px] text-ink">还没有配置模型</p>
                <p className="mt-0.5 text-[12px] text-ink3">配置后才能开始真正的对话教学。</p>
              </div>
              <Link href="/settings">
                <Button size="sm" variant="secondary">
                  去设置
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13.5px] font-medium text-ink">{model.label}</p>
                  {model.lastError ? (
                    <Badge tone="bad">上次连接失败</Badge>
                  ) : model.lastOkAt ? (
                    <Badge tone="ok">
                      <CheckCircle2 className="size-3" /> 上次正常
                    </Badge>
                  ) : (
                    <Badge tone="neutral">已配置 · 未测试</Badge>
                  )}
                </div>
                <p className="mt-1 truncate font-mono text-[12px] text-ink3">
                  {model.model} · {model.baseUrl}
                </p>
                {model.lastError ? (
                  <p className="mt-1.5 line-clamp-2 rounded-lg bg-badsoft/40 px-2 py-1 text-[12px] leading-relaxed text-bad">
                    {model.lastError}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={testing}
                  onClick={() => void testModel()}
                  icon={<Wifi className="size-3.5" />}
                >
                  测试
                </Button>
                <Link href="/settings">
                  <Button size="sm" variant="ghost">
                    管理
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-2 sm:grid-cols-2">
        {LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-start gap-3 rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-accent/40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-panel2">
                <Icon className="size-4 text-ink2" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-medium text-ink">{item.title}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-ink3 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-ink3">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </section>

    </div>
  );
}
