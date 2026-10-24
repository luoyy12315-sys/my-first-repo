/**
 * 「换个讲法」的结构化表征（纯数据，客户端/服务端共用）
 */
export const REPRESENTATIONS = ["analogy", "case", "contrast", "steps", "derivation", "socratic"] as const;
export type Representation = (typeof REPRESENTATIONS)[number];

export const REPRESENTATION_LABEL: Record<Representation, string> = {
  analogy: "生活类比",
  case: "具体案例",
  contrast: "对比表",
  steps: "分步拆解",
  derivation: "公式推导",
  socratic: "追问引导",
};

const HINT: Record<Representation, string> = {
  analogy: "用日常事物打比方，再回到术语",
  case: "用一个具体场景或数字完整走一遍",
  contrast: "用对照表逐项比较",
  steps: "拆成有先后顺序的步骤",
  derivation: "从定义和条件一步步推导",
  socratic: "用连续提问引导，不直接给结论",
};

export function normalizeRepresentation(value: unknown): Representation | null {
  return typeof value === "string" && (REPRESENTATIONS as readonly string[]).includes(value)
    ? (value as Representation)
    : null;
}

export function normalizeAvoid(value: unknown): Representation[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeRepresentation).filter((v): v is Representation => Boolean(v)))].slice(0, 6);
}

export function buildRepresentationBlock(current: Representation, avoid: Representation[]): string {
  const avoidLabels = avoid.filter((r) => r !== current).map((r) => REPRESENTATION_LABEL[r]);
  const parts = [
    `【本轮讲法】必须使用「${REPRESENTATION_LABEL[current]}」这一种表征来重新讲同一内容：${HINT[current]}。`,
    "不要只换措辞；要让学生能从新的角度建立起理解。",
  ];
  if (avoidLabels.length) {
    parts.push(`本会话已经用过：${avoidLabels.join("、")}，这次不要再重复这些表征。`);
  }
  return parts.join("\n");
}
