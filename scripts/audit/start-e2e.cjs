/**
 * 启动阶段一验收用独立实例：DATA_DIR=./data/audit-e2e，端口 3212。
 * 模型配置从正在使用的主库只读读取，再通过环境变量传给子进程，避免把 Key 写进命令行。
 */
const { spawn } = require("node:child_process");
const path = require("node:path");
const Database = require("better-sqlite3");

const db = new Database(path.resolve("data/lumina.db"), { readonly: true });
const row = db.prepare("select value from settings where key = 'ai_config'").get();
db.close();
if (!row) {
  console.error("主库里没有 ai_config，请先在设置页配置模型");
  process.exit(1);
}
const cfg = JSON.parse(row.value);

const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3212"],
  {
    env: {
      ...process.env,
      DATA_DIR: "./data/audit-e2e",
      AI_PROVIDER: cfg.provider,
      AI_BASE_URL: cfg.baseUrl,
      AI_API_KEY: cfg.apiKey,
      AI_MODEL: cfg.model,
      AI_TEMPERATURE: String(cfg.temperature ?? 0.6),
    },
    stdio: ["ignore", "inherit", "inherit"],
  },
);

const stop = () => {
  try {
    child.kill();
  } catch {
    /* ignore */
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
