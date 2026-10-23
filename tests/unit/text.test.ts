import { describe, expect, it } from "vitest";
import { stripBlockPlaceholders, stripInlineMarkdown } from "@/lib/text";
import { fallbackTitle } from "@/lib/ai/prompt";

describe("标题与列表纯文本", () => {
  it("去掉模型输出里的加粗与行内代码标记", () => {
    expect(stripInlineMarkdown("**只影响等式左边**的 `资产`")).toBe("只影响等式左边的 资产");
  });

  it("截断标题时不留下逗号加省略号", () => {
    const title = fallbackTitle("用生活中的例子给我讲清楚会计恒等式，然后出一道选择题检验我。");
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toContain("，…");
  });

  it("短标题原样保留（包括问号）", () => {
    expect(fallbackTitle("复式记账")).toBe("复式记账");
    expect(fallbackTitle("为什么资产等于负债加权益？")).toBe("为什么资产等于负债加权益？");
  });

  it("清掉模型复述的历史组件占位符", () => {
    expect(stripBlockPlaceholders("下面这张表值得存下来：[已展示table]")).toBe(
      "下面这张表值得存下来：",
    );
    expect(stripBlockPlaceholders("前面是（此前展示过table组件）内容")).toBe("前面是 内容");
    expect(stripBlockPlaceholders("普通正文 [[m1]] 不动")).toBe("普通正文 [[m1]] 不动");
  });
});
