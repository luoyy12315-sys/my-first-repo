/** 去掉模型复述历史时可能带出的组件占位符（[已展示table] 等）。 */
export function stripBlockPlaceholders(value: string): string {
  return value
    .replace(/[ \t]*\[已展示[^\]]*\][ \t]*/g, " ")
    .replace(/[ \t]*（此前展示过[^）]*组件）[ \t]*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** 把模型生成的内联 Markdown 转成适合标题/列表的单行纯文本。 */
export function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
