#!/usr/bin/env node
/**
 * Generates desktop/build/icon.ico (multi-size) and desktop/build/tray.png
 * from the best available source, in this order:
 *   1. <project>/public/icons/icon-512.png   (PWA task output, if it exists)
 *   2. <project>/src/app/icon.svg            (app icon / favicon)
 *   3. a built-in fallback drawn with raw pixels (no dependency)
 *
 * `sharp` is resolved from the project root node_modules, so desktop/ does not
 * need its own native dependency.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = path.resolve(DESKTOP, '..');
const BUILD = path.join(DESKTOP, 'build');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

fs.mkdirSync(BUILD, { recursive: true });

function log(msg) {
  console.log(`[icons] ${msg}`);
}

function loadSharp() {
  const tries = [path.join(PROJECT, 'package.json'), path.join(DESKTOP, 'package.json')];
  for (const base of tries) {
    try {
      const req = createRequire(base);
      return req('sharp');
    } catch {
      /* keep trying */
    }
  }
  return null;
}

/**
 * Build ONE icon frame as a classic BMP/DIB (32bpp BGRA + AND mask).
 *
 * Why not PNG-compressed frames: Windows Explorer / the taskbar render an
 * EXE's embedded icon reliably only from classic DIB frames. An .ico whose
 * entries are all PNG-compressed can show up blank/transparent, or make the
 * shell fall back to a stale cached icon. DIB frames always work.
 */
function bmpFrame(size, rgba) {
  const rowBytes = size * 4;
  const xorSize = rowBytes * size;
  const maskRowBytes = Math.ceil(size / 32) * 4; // 1bpp, rows padded to 32-bit
  const maskSize = maskRowBytes * size;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight = XOR + AND (doubled)
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(0, 16); // biCompression = BI_RGB
  header.writeUInt32LE(xorSize + maskSize, 20); // biSizeImage
  header.writeInt32LE(0, 24); // biXPelsPerMeter
  header.writeInt32LE(0, 28); // biYPelsPerMeter
  header.writeUInt32LE(0, 32); // biClrUsed
  header.writeUInt32LE(0, 36); // biClrImportant
  // XOR bitmap: BGRA, bottom-up
  const xor = Buffer.alloc(xorSize);
  for (let y = 0; y < size; y++) {
    const srcRow = (size - 1 - y) * rowBytes;
    const dstRow = y * rowBytes;
    for (let x = 0; x < size; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 4;
      xor[d] = rgba[s + 2]; // B
      xor[d + 1] = rgba[s + 1]; // G
      xor[d + 2] = rgba[s]; // R
      xor[d + 3] = rgba[s + 3]; // A
    }
  }
  // AND mask: all zero (opaque); 32bpp transparency is carried by alpha.
  const mask = Buffer.alloc(maskSize);
  return Buffer.concat([header, xor, mask]);
}

/** Pack DIB icon frames of various sizes into a single .ico (classic format). */
function icoFromRaw(frames) {
  const count = frames.length;
  const blobs = frames.map((f) => bmpFrame(f.size, f.rgba));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  for (let i = 0; i < count; i++) {
    const size = frames[i].size;
    const blob = blobs[i];
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette colors
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(blob.length, 8); // bytes in resource
    e.writeUInt32LE(offset, 12); // offset
    offset += blob.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

/** Encode a PNG from raw RGBA pixels - zero dependency fallback. */
function rawPng(width, height, rgba) {
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Fallback artwork: teal rounded square + cream 4-point star (matches src/app/icon.svg). */
function fallbackRgba(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [0x1f, 0x6f, 0x63];
  const fg = [0xf6, 0xf4, 0xee];
  const r = size * 0.28; // corner radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded rect coverage
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      let inside = true;
      if (cx < r && cy < r) {
        const dx = r - cx;
        const dy = r - cy;
        inside = Math.hypot(dx, dy) <= r + 0.5;
      }
      // star: |dx|^0.6 + |dy|^0.6 <= k
      const sx = (x + 0.5 - size / 2) / (size * 0.31);
      const sy = (y + 0.5 - size / 2) / (size * 0.31);
      const star = Math.pow(Math.abs(sx), 0.65) + Math.pow(Math.abs(sy), 0.65) <= 1;
      const c = star ? fg : bg;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = inside ? 255 : 0;
    }
  }
  return rgba;
}

function fallbackPng(size) {
  return rawPng(size, size, fallbackRgba(size));
}

async function main() {
  const pwaPng = path.join(PROJECT, 'public', 'icons', 'icon-512.png');
  const appSvg = path.join(PROJECT, 'src', 'app', 'icon.svg');
  const sharp = loadSharp();
  log(sharp ? 'sharp available (project node_modules)' : 'sharp NOT available, using pixel fallback');

  let source = null;
  if (fs.existsSync(pwaPng)) {
    source = { kind: 'png', value: pwaPng };
    log(`source: public/icons/icon-512.png (PWA output)`);
  } else if (sharp && fs.existsSync(appSvg)) {
    source = { kind: 'svg', value: fs.readFileSync(appSvg) };
    log('source: src/app/icon.svg');
  } else {
    source = { kind: 'fallback' };
    log('source: built-in fallback art');
  }

  const frames = [];
  for (const size of ICO_SIZES) {
    let rgba;
    if (source.kind === 'fallback') {
      rgba = fallbackRgba(size);
    } else {
      const { data } = await sharp(source.value, { density: 288 })
        .resize(size, size, { fit: 'cover' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      rgba = data;
    }
    frames.push({ size, rgba });
  }
  const ico = icoFromRaw(frames);
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), ico);
  log(`wrote build/icon.ico (${ICO_SIZES.join('/')}px, ${(ico.length / 1024).toFixed(1)} KiB)`);

  // tray icon: 32px PNG (crisper in the notification area than an .ico)
  let tray;
  if (source.kind === 'fallback') {
    tray = fallbackPng(32);
  } else {
    tray = await sharp(source.value, { density: 288 }).resize(32, 32, { fit: 'cover' }).png().toBuffer();
  }
  fs.writeFileSync(path.join(BUILD, 'tray.png'), tray);
  log('wrote build/tray.png (32px)');
}

main().catch((err) => {
  console.error('[icons] FAILED:', err);
  process.exit(1);
});