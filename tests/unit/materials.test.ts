import { describe, expect, it } from "vitest";
import { parseMaterial } from "@/lib/materials/parse";

describe("材料解析 · HTML", () => {
  it("HTML 会去掉脚本与样式，只留下正文", async () => {
    const html = `<!doctype html><html><head><style>.x{color:red}</style><script>alert("x")</script></head>
      <body><h1>机会成本</h1><p>放弃的最优替代方案的价值。</p></body></html>`;
    const file = new File([html], "note.html", { type: "text/html" });
    const parsed = await parseMaterial(file);
    expect(parsed.status).toBe("parsed");
    expect(parsed.text).toContain("机会成本");
    expect(parsed.text).toContain("放弃的最优替代方案");
    expect(parsed.text).not.toContain("alert");
    expect(parsed.text).not.toContain("color:red");
  });
});