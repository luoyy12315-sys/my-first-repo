import fs from "node:fs";
import path from "node:path";

// 退出码：0 = 需要重新构建；1 = 当前构建是最新的
const root = process.cwd();
const buildFile = path.join(root, ".next", "BUILD_ID");

try {
  if (!fs.existsSync(buildFile)) process.exit(0);
  const builtAt = fs.statSync(buildFile).mtimeMs;
  const files = [
    "package.json",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
  ].map((f) => path.join(root, f));

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(path.join(root, "src"));

  const newest = files.reduce((max, file) => {
    try {
      return Math.max(max, fs.statSync(file).mtimeMs);
    } catch {
      return max;
    }
  }, 0);

  process.exit(newest > builtAt ? 0 : 1);
} catch {
  // 检测失败时宁可重建，也不要启动旧版本
  process.exit(0);
}
