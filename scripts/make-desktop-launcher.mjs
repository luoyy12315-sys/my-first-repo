/**
 * 在桌面生成一个双击即用的启动器（.cmd）。
 *
 * 为什么不用 .lnk：手写 MS-SHLLINK 在这台机器上两次都没被 Shell 正确执行。
 * 批处理由 Explorer 直接调用，没有格式解析环节，最可靠。
 *
 * 注意：批处理文件由 cmd 按「系统 ANSI 代码页」读取，中文路径必须以 GBK
 * 字节写入，不能存成 UTF-8，否则路径会变成乱码。
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const projectDir = path.resolve(import.meta.dirname, "..");
const desktop = path.join(os.homedir(), "Desktop");
const out = path.join(desktop, "Lumina 学习工作台.cmd");

/** 把字符串按 GBK 编码（只覆盖这里用到的字符：项目 = CF EE C4 BF） */
function toGbk(str) {
  const special = { 项: [0xcf, 0xee], 目: [0xc4, 0xbf] };
  const chunks = [];
  for (const ch of str) {
    if (special[ch]) chunks.push(Buffer.from(special[ch]));
    else chunks.push(Buffer.from(ch, "latin1"));
  }
  return Buffer.concat(chunks);
}

if (!fs.existsSync(path.join(projectDir, "start.bat"))) {
  console.error("找不到 start.bat：", projectDir);
  process.exit(1);
}

const lines = [
  "@echo off",
  "title Lumina - AI Learning Workspace",
  'set "LOG=%TEMP%\\lumina-launch.log"',
  'echo [%DATE% %TIME%] launcher started >> "%LOG%"',
  `set "ROOT=${projectDir}"`,
  'if not exist "%ROOT%\\start.bat" (',
  "  echo [ERROR] start.bat not found: %ROOT%",
  '  echo [%DATE% %TIME%] ERROR start.bat missing >> "%LOG%"',
  "  pause",
  "  exit /b 1",
  ")",
  'echo [%DATE% %TIME%] handing over to start.bat >> "%LOG%"',
  "echo.",
  "echo == Starting Lumina. Keep this window open. ==",
  "echo.",
  'call "%ROOT%\\start.bat"',
  'echo [%DATE% %TIME%] start.bat exited %ERRORLEVEL% >> "%LOG%"',
  "echo.",
  "echo == Server stopped. See the messages above. ==",
  "echo    Common case: port 3210 already in use, i.e. it was already running.",
  "echo.",
  "pause",
  "",
];

const buf = Buffer.concat(lines.map((l) => Buffer.concat([toGbk(l), Buffer.from("\r\n")])));
fs.writeFileSync(out, buf);

// 回读：把 GBK 字节还原成可读字符串
const back = fs
  .readFileSync(out)
  .toString("latin1")
  .replace(/\xcf\xee\xc4\xbf/g, "项目");
const rootLine = back.split("\r\n").find((l) => l.startsWith('set "ROOT='));
console.log(JSON.stringify({ out, bytes: buf.length, rootLine, ok: rootLine?.includes(projectDir) }, null, 1));
