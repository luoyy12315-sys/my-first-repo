#!/usr/bin/env node
/**
 * Packages the Electron shell into a standalone Windows folder app:
 *
 *   desktop/dist/Lumina-win32-x64/Lumina.exe
 *
 * The Next.js app itself is NOT bundled - the exe locates the project folder
 * (via LUMINA_ROOT or by walking up from its own location) and runs
 * `node_modules/next/dist/bin/next start` with a real node.exe.
 *
 * Usage:  npm run build        (or: node scripts/build.mjs --skip-icon)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = path.resolve(DESKTOP, '..');
const DIST = path.join(DESKTOP, 'dist');
const VENDOR = path.join(DESKTOP, 'vendor');

// --- mirrors first: never let a packaging run hang on an overseas download ---
process.env.ELECTRON_MIRROR ||= 'https://npmmirror.com/mirrors/electron/';
process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||=
  'https://npmmirror.com/mirrors/electron-builder-binaries/';
process.env.npm_config_electron_mirror ||= process.env.ELECTRON_MIRROR;

const log = (m) => console.log(`[build] ${m}`);
const existsFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// 1. bundle a copy of a real node.exe (better-sqlite3 ABI must match Node, not Electron)
// ---------------------------------------------------------------------------
function findSystemNode() {
  if (process.env.LUMINA_NODE_SOURCE && existsFile(process.env.LUMINA_NODE_SOURCE)) {
    return process.env.LUMINA_NODE_SOURCE;
  }
  const candidates = [];
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) candidates.push(path.join(dir, 'node.exe'));
  candidates.push(
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
  );
  const wbBase = path.join(os.homedir(), '.workbuddy', 'binaries', 'node', 'versions');
  try {
    for (const v of fs.readdirSync(wbBase).sort().reverse()) candidates.push(path.join(wbBase, v, 'node.exe'));
  } catch {
    /* ignore */
  }
  return candidates.find(existsFile) || null;
}

function bundleNode() {
  fs.mkdirSync(VENDOR, { recursive: true });
  const target = path.join(VENDOR, 'node.exe');
  const source = findSystemNode();
  if (!source) {
    log('WARNING: no node.exe found to bundle; the app will fall back to runtime detection.');
    return null;
  }
  const same = existsFile(target) && fs.statSync(target).size === fs.statSync(source).size;
  if (!same) fs.copyFileSync(source, target);
  log(`bundled node.exe <- ${source} (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MiB)`);
  // record provenance next to the binary
  fs.writeFileSync(
    path.join(VENDOR, 'NODE_VERSION.txt'),
    `source: ${source}\nnode: ${execFileSync(source, ['-v'], { encoding: 'utf8' }).trim()}\ntarget: ${target}\n`,
    'utf8',
  );
  return target;
}

// ---------------------------------------------------------------------------
// 2. icons
// ---------------------------------------------------------------------------
function ensureIcons() {
  const ico = path.join(DESKTOP, 'build', 'icon.ico');
  if (existsFile(ico) && !process.argv.includes('--force-icon')) return ico;
  log('generating icons...');
  execFileSync(process.execPath, [path.join(DESKTOP, 'scripts', 'make-icon.mjs')], {
    stdio: 'inherit',
    cwd: DESKTOP,
  });
  return existsFile(ico) ? ico : null;
}

// ---------------------------------------------------------------------------
// 3. package
// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe'))) {
    throw new Error('electron is not installed in desktop/. Run: npm install');
  }
  const nodeTarget = bundleNode();
  const icon = ensureIcons();

  const { default: packager } = await import('@electron/packager');

  const appVersion = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8')).version;

  log('packaging with @electron/packager (win32-x64, asar)...');
  const outDirs = await packager({
    dir: DESKTOP,
    out: DIST,
    name: 'Lumina',
    executableName: 'Lumina',
    platform: 'win32',
    arch: 'x64',
    asar: true,
    overwrite: true,
    prune: true,
    icon: icon || undefined,
    appVersion,
    buildVersion: appVersion,
    appCopyright: `Copyright (c) ${new Date().getFullYear()} Lumina`,
    // keep the app payload small: no deps, no build tooling, no prior output
    ignore: [
      /^\/node_modules($|\/)/,
      /^\/dist($|\/)/,
      /^\/vendor($|\/)/,
      /^\/\.tmp($|\/)/,
      /^\/\.npmrc$/,
      /^\/package-lock\.json$/,
      /^\/README\.md$/,
      /^\/install-shortcut\.ps1$/,
      /^\/scripts($|\/)/,
      /^\/build\/.*\.(png|svg|ico)$/,
    ],
    // node.exe must live OUTSIDE the asar so it can actually be spawned.
    // build/ (tray.png + icon.ico) must be unpacked too: the ignore rule keeps
    // them out of app.asar, and without a real path on disk the tray and window
    // icons resolve to null (blank tray / transparent taskbar icon).
    extraResource: [...(nodeTarget ? [VENDOR] : []), path.join(DESKTOP, 'build')],
    win32metadata: {
      CompanyName: 'Lumina',
      FileDescription: 'Lumina - AI 学习工作台',
      ProductName: 'Lumina',
      InternalName: 'Lumina',
      OriginalFilename: 'Lumina.exe',
      'requested-execution-level': 'asInvoker',
    },
  });

  const appDir = outDirs[0];
  const exe = path.join(appDir, 'Lumina.exe');
  if (!existsFile(exe)) throw new Error(`packaging finished but ${exe} is missing`);

  const vendorExe = path.join(appDir, 'resources', 'vendor', 'node.exe');
  const asar = path.join(appDir, 'resources', 'app.asar');

  console.log('');
  log('done.');
  console.log(`  exe      : ${exe}  (${(fs.statSync(exe).size / 1024 / 1024).toFixed(1)} MiB)`);
  console.log(`  app.asar : ${existsFile(asar) ? `${(fs.statSync(asar).size / 1024).toFixed(1)} KiB` : 'MISSING'}`);
  console.log(`  node.exe : ${existsFile(vendorExe) ? `${(fs.statSync(vendorExe).size / 1024 / 1024).toFixed(1)} MiB (resources/vendor)` : 'not bundled (runtime detection)'}`);
  console.log('');
  console.log('  double-click the exe, or run:');
  console.log(`    .\\desktop\\install-shortcut.ps1   # desktop + start menu shortcut`);
  return exe;
}

main().catch((err) => {
  console.error('[build] FAILED:', err);
  process.exit(1);
});