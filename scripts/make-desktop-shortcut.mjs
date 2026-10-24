/**
 * 生成桌面快捷方式（Windows），不依赖 COM 自动化。
 *
 * 两个关键点（都是踩过的坑）：
 *  1. 目标指向 cmd.exe（纯 ASCII），项目路径放进命令行参数。因为 .lnk 的
 *     LinkInfo 里有一条 ANSI 路径字段，中文目录在这里没法可靠表达；
 *     参数走 UTF-16 字符串表，不存在编码歧义。
 *  2. 卷序列号必须是真实值（从系统已有快捷方式读出）。写 0 会被 Shell
 *     判为无效目标，双击报「未指定的错误」。
 *
 * 用法：node scripts/make-desktop-shortcut.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const projectDir = path.resolve(import.meta.dirname, "..");
const desktop = path.join(os.homedir(), "Desktop");
const iconPath = path.join(projectDir, "assets", "lumina.ico");
const startBat = path.join(projectDir, "start.bat");
const outName = process.argv[2] ?? "Lumina 学习工作台.lnk";
const out = path.join(desktop, outName);

/** 从系统里任一指向 C 盘的快捷方式读取卷序列号 */
function readVolumeSerial() {
  const roots = [
    "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
    "C:\\Users\\Public\\Desktop",
  ];
  const walk = (d, acc = []) => {
    if (!fs.existsSync(d)) return acc;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (e.name.toLowerCase().endsWith(".lnk")) acc.push(p);
    }
    return acc;
  };
  for (const root of roots) {
    for (const f of walk(root)) {
      try {
        const b = fs.readFileSync(f);
        const flags = b.readUInt32LE(20);
        if (!(flags & 0x02)) continue;
        let o = 76;
        if (flags & 0x01) o = 78 + b.readUInt16LE(76);
        const serial = b.readUInt32LE(o + b.readUInt32LE(o + 12) + 8);
        if (serial) return serial;
      } catch {
        /* 忽略坏文件 */
      }
    }
  }
  return 0;
}

if (!fs.existsSync(startBat)) {
  console.error("找不到 start.bat：", startBat);
  process.exit(1);
}

const CMD = "C:\\Windows\\System32\\cmd.exe";
const ARGS = `/c call "${startBat}"`;
const NAME = "Lumina 学习工作台";
const hasIcon = fs.existsSync(iconPath);
const serial = readVolumeSerial();

// ---------- Header ----------
const header = Buffer.alloc(76);
header.writeUInt32LE(0x4c, 0);
Buffer.from("0114020000000000c000000000000046", "hex").copy(header, 4);
const FLAGS = 0x02 | 0x04 | 0x10 | 0x20 | (hasIcon ? 0x40 : 0) | 0x80;
header.writeUInt32LE(FLAGS, 20); // LinkInfo|Name|WorkDir|Args|Icon|Unicode
header.writeUInt32LE(0x20, 24);
header.writeUInt32LE(1, 60); // SW_SHOWNORMAL

// ---------- LinkInfo ----------
const ansiBuf = Buffer.from(CMD + "\0", "latin1");
const uniBuf = Buffer.from(CMD + "\0", "utf16le");
const suffixAnsi = Buffer.from("\0", "latin1");
const suffixUni = Buffer.from("\0\0", "utf16le");

const HS = 0x24;
const VOL = 17;
const lb = HS + VOL;
const sfx = lb + ansiBuf.length;
const lbU = sfx + suffixAnsi.length;
const sfxU = lbU + uniBuf.length;
const size = sfxU + suffixUni.length;

const li = Buffer.alloc(size);
li.writeUInt32LE(size, 0);
li.writeUInt32LE(HS, 4);
li.writeUInt32LE(0x01, 8);
li.writeUInt32LE(HS, 12);
li.writeUInt32LE(lb, 16);
li.writeUInt32LE(0, 20);
li.writeUInt32LE(sfx, 24);
li.writeUInt32LE(lbU, 28);
li.writeUInt32LE(sfxU, 32);
li.writeUInt32LE(VOL, HS);
li.writeUInt32LE(3, HS + 4); // DRIVE_FIXED
li.writeUInt32LE(serial, HS + 8);
li.writeUInt32LE(0x10, HS + 12);
ansiBuf.copy(li, lb);
suffixAnsi.copy(li, sfx);
uniBuf.copy(li, lbU);
suffixUni.copy(li, sfxU);

// ---------- StringData ----------
const str = (s) => {
  const body = Buffer.from(s, "utf16le");
  const len = Buffer.alloc(2);
  len.writeUInt16LE(s.length, 0);
  return Buffer.concat([len, body]);
};
const parts = [str(NAME), str(projectDir), str(ARGS)];
if (hasIcon) parts.push(str(iconPath));

// 直接覆盖已存在的 .lnk 会被 Shell 的句柄挡住（EPERM），先写临时文件再换名
const tmp = out + ".new";
fs.writeFileSync(tmp, Buffer.concat([header, li, ...parts]));
try {
  fs.renameSync(tmp, out);
} catch {
  try {
    fs.unlinkSync(out);
  } catch {
    /* 旧文件可能已不存在 */
  }
  fs.renameSync(tmp, out);
}

// ---------- 回读校验 ----------
const b = fs.readFileSync(out);
const u16 = (o) => b.readUInt16LE(o);
const u32 = (o) => b.readUInt32LE(o);
const rd = (o) => {
  const n = u16(o);
  return { v: b.subarray(o + 2, o + 2 + n * 2).toString("utf16le"), next: o + 2 + n * 2 };
};
const liSize = u32(76);
const uni = b
  .subarray(76 + u32(76 + 28), 76 + u32(76 + 32))
  .toString("utf16le")
  .replace(/\0+$/, "");
const serialRead = u32(76 + 0x24 + 8);
let p = 76 + liSize;
const name = rd(p);
const work = rd(name.next);
const args = rd(work.next);
const ico = hasIcon ? rd(args.next) : null;

const ok =
  uni === CMD &&
  serialRead === serial &&
  name.v === NAME &&
  work.v === projectDir &&
  args.v === ARGS &&
  (!hasIcon || ico?.v === iconPath);

console.log(
  JSON.stringify(
    {
      out,
      bytes: b.length,
      serial: "0x" + serial.toString(16),
      target: uni,
      name: name.v,
      workdir: work.v,
      args: args.v,
      icon: hasIcon ? ico?.v : null,
      ok,
    },
    null,
    1,
  ),
);
if (!ok) process.exit(1);
