/**
 * 讲解风格的持久化（服务端）
 *
 * 存储两份 settings：
 * - `teaching_styles`：风格数组（每项含 id/name/directive/verbosity/两个开关）
 * - `teaching_active_style`：当前"使用中"的风格 id，空表示按默认讲法、不注入
 *
 * 兼容旧版单份 `teaching_profile`：首次读取时迁移成一个名为「我的风格」的卡片，
 * 老配置非默认时自动设为使用中。
 */
import { getSetting, setSetting } from "@/lib/db/repo";
import { uid } from "@/lib/db";
import {
  DEFAULT_STYLE_FIELDS,
  MAX_TEACHING_STYLES,
  buildTeachingStyleBlock,
  isDefaultStyleFields,
  normalizeLegacyProfile,
  normalizeStyleFields,
  normalizeTeachingStyle,
  type StyleFields,
  type TeachingStyle,
} from "@/lib/teaching/profile";

const STYLES_KEY = "teaching_styles";
const ACTIVE_KEY = "teaching_active_style";
const LEGACY_KEY = "teaching_profile";

function readStoredStyles(): TeachingStyle[] {
  const raw = getSetting(STYLES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const styles = parsed
      .map((item, i) => normalizeTeachingStyle(item, i + 1))
      .filter((s) => s.id)
      .slice(0, MAX_TEACHING_STYLES);
    // 同一 id 出现两次会让编辑/删除行为变得难以预测
    const seen = new Set<string>();
    return styles.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  } catch {
    return [];
  }
}

function writeStyles(styles: TeachingStyle[]) {
  setSetting(STYLES_KEY, JSON.stringify(styles));
}

function readActiveId(): string | null {
  return getSetting(ACTIVE_KEY) || null;
}

function writeActiveId(id: string | null) {
  setSetting(ACTIVE_KEY, id ?? "");
}

/** 老配置迁移：只做一次（写回 teaching_styles / teaching_active_style） */
function migrateLegacyProfile(): TeachingStyle[] {
  const legacy = getSetting(LEGACY_KEY);
  if (!legacy) return [];
  let fields: StyleFields;
  try {
    fields = normalizeLegacyProfile(JSON.parse(legacy));
  } catch {
    return [];
  }
  if (isDefaultStyleFields(fields)) return [];
  const style: TeachingStyle = { id: uid("ts_"), name: "我的风格", ...fields };
  writeStyles([style]);
  if (!readActiveId()) writeActiveId(style.id);
  return [style];
}

export function listTeachingStyles(): TeachingStyle[] {
  const styles = readStoredStyles();
  return styles.length ? styles : migrateLegacyProfile();
}

export function getActiveTeachingStyle(): TeachingStyle | null {
  const id = readActiveId();
  if (!id) return null;
  return listTeachingStyles().find((s) => s.id === id) ?? null;
}

/** 新建或更新一个风格；第一个风格会自动设为使用中 */
export function saveTeachingStyle(input: unknown): TeachingStyle {
  const styles = listTeachingStyles();
  const raw = (input ?? {}) as Partial<TeachingStyle>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";

  if (id) {
    const index = styles.findIndex((s) => s.id === id);
    if (index < 0) throw new Error("风格不存在，可能已被删除");
    const next = normalizeTeachingStyle({ ...raw, id }, index + 1);
    styles[index] = next;
    writeStyles(styles);
    return next;
  }

  if (styles.length >= MAX_TEACHING_STYLES) {
    throw new Error(`最多保存 ${MAX_TEACHING_STYLES} 个风格，先删掉不用的再添加`);
  }
  const generated = normalizeTeachingStyle(raw, styles.length + 1);
  const style: TeachingStyle = { ...generated, id: uid("ts_") };
  const next = [...styles, style];
  writeStyles(next);
  if (!readActiveId()) writeActiveId(style.id);
  return style;
}

export function deleteTeachingStyle(id: string): TeachingStyle[] {
  const styles = listTeachingStyles().filter((s) => s.id !== id);
  writeStyles(styles);
  if (readActiveId() === id) {
    // 删掉正在用的风格：顺延到剩下的第一个，没有就回到默认讲法
    writeActiveId(styles[0]?.id ?? null);
  }
  return styles;
}

/** id=null 表示"不使用自定义风格"（默认讲法，不注入） */
export function setActiveTeachingStyle(id: string | null): TeachingStyle | null {
  if (id) {
    const style = listTeachingStyles().find((s) => s.id === id);
    if (!style) throw new Error("风格不存在，可能已被删除");
    writeActiveId(style.id);
    return style;
  }
  writeActiveId(null);
  return null;
}

export function currentStyleBlock(): string | null {
  const style = getActiveTeachingStyle();
  if (!style) return null;
  // 迁移前的默认值也走同一个判断：全默认就不注入
  if (isDefaultStyleFields(style)) return null;
  return buildTeachingStyleBlock(style);
}

/** UI 用：当前生效风格的内容（供预览） */
export function activeStyleFields(): StyleFields {
  return getActiveTeachingStyle() ?? DEFAULT_STYLE_FIELDS;
}

export { normalizeStyleFields };