'use strict';
/**
 * Lumina desktop shell (Electron main process).
 *
 * Architecture notes
 * ------------------
 * Electron is only a window/tray shell. The Next.js app keeps running as a
 * *separate* process launched with a real `node.exe`, because better-sqlite3 is
 * a native module compiled for Node's ABI and cannot be loaded inside Electron's
 * bundled Node. So:
 *
 *   Lumina.exe (Electron)  --HTTP-->  http://127.0.0.1:3210  (next start, external node.exe)
 *
 * Boot sequence: probe /api/health -> reuse a healthy server, otherwise spawn
 * one; show splash while waiting, then load the real UI.
 */

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  screen,
  shell,
  dialog,
  nativeImage,
  ipcMain,
  session,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { spawn, execFile } = require('node:child_process');

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const APP_ID = 'com.lumina.desktop';
const PRODUCT = 'Lumina';
const DEFAULT_PORT = 3210; // product port
/**
 * 云端地址（默认入口）。桌面壳默认直连这里，不再启动本地服务：
 * 电脑关着、本机没建过构建，都能打开；数据只有云端一份，不会两边分裂。
 * 想回到本机模式：托盘 →「服务端」→「本机服务」，或设 LUMINA_URL / LUMINA_MODE=local。
 */
const DEFAULT_REMOTE_URL = 'http://123.207.239.2:3210';
const ENV_URL = (process.env.LUMINA_URL || '').trim() || null;
const ENV_MODE = (process.env.LUMINA_MODE || '').trim().toLowerCase() || null; // 'local' | 'remote'
const ENV_PORT = Number(process.env.LUMINA_PORT) || null; // escape hatch (tests / conflicts)
const HEALTH_PATH = '/api/health';
const HEALTH_TIMEOUT_MS = 90_000; // cold `next start` on a big app can be slow
const HEALTH_POLL_MS = 400;
const IS_WIN = process.platform === 'win32';
const DEVTOOLS_ENABLED = !app.isPackaged || process.env.LUMINA_DEVTOOLS === '1';
/** Keep the splash on screen at least this long, so a fast start does not flash. */
const SPLASH_MIN_MS = Number(process.env.LUMINA_SPLASH_MIN_MS || 700) || 700;
const ZOOM_STEP = 0.5;
const ZOOM_MIN = -3;
const ZOOM_MAX = 5;

const APP_DIR = path.join(__dirname, '..'); // desktop/ (dev) or app.asar root (packaged)

app.setName(PRODUCT);
if (IS_WIN) app.setAppUserModelId(APP_ID);

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

let mainWindow = null;
let splashWindow = null;
let tray = null;
let serverProc = null; // child process we spawned (null => reused external server)
let serverOwned = false; // true only when WE started the server
let serverHost = '127.0.0.1';
let serverPort = DEFAULT_PORT;
let isQuitting = false;
let booting = false;
let bootError = null;
let projectRoot = null;
let nodeExePath = null;
let logStream = null;
let trayNoticeShown = false;
let splashShownAt = 0;

// ---------------------------------------------------------------------------
// small fs helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return dir;
}

function readJson(file, fallback) {
  try {
    // strip a UTF-8 BOM: Windows editors (Notepad, PowerShell 5) add one and
    // JSON.parse would throw, silently resetting the user's settings.
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  try {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[lumina] failed to write', file, err && err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// configuration (userData/config.json)
// ---------------------------------------------------------------------------

const configFile = () => path.join(app.getPath('userData'), 'config.json');

const defaultConfig = () => ({
  lanAccess: false,
  minimizeToTray: true,
  port: null, // null => DEFAULT_PORT (or LUMINA_PORT)
  serverMode: 'remote', // 'remote' => 直连云端；'local' => 自己起 next start
  remoteUrl: DEFAULT_REMOTE_URL,
  window: null, // { x, y, width, height, maximized }
  trayNoticeShown: false,
});

let config = defaultConfig();

function loadConfig() {
  const raw = readJson(configFile(), null) || {};
  config = { ...defaultConfig(), ...raw };
  config.window = raw.window || null;
  return config;
}

function saveConfig(patch) {
  if (patch && typeof patch === 'object') config = { ...config, ...patch };
  writeJson(configFile(), config);
}

/** 规范化后的云端根地址（无尾斜杠），非法或未配置时返回 null。 */
function remoteBaseUrl() {
  if (ENV_MODE === 'local') return null;
  const raw = ENV_URL || (config.remoteUrl ? String(config.remoteUrl).trim() : '');
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

function isRemoteMode() {
  if (ENV_MODE === 'local') return false;
  if (ENV_MODE === 'remote') return true;
  return config.serverMode !== 'local' && !!remoteBaseUrl();
}

function logFile() {
  return path.join(app.getPath('userData'), 'logs', 'server.log');
}

function serverLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    if (!logStream) {
      ensureDir(path.dirname(logFile()));
      logStream = fs.createWriteStream(logFile(), { flags: 'a' });
    }
    logStream.write(line);
  } catch {
    /* ignore */
  }
}

function tailServerLog(lines = 25) {
  try {
    const txt = fs.readFileSync(logFile(), 'utf8');
    return txt.trim().split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// project root + node.exe resolution
// ---------------------------------------------------------------------------

function looksLikeProject(dir) {
  try {
    if (!dir) return false;
    const hasPackage = fs.existsSync(path.join(dir, 'package.json'));
    const hasNextConfig = ['next.config.ts', 'next.config.js', 'next.config.mjs', 'next.config.cjs'].some(
      (name) => fs.existsSync(path.join(dir, name)),
    );
    return hasPackage && hasNextConfig;
  } catch {
    return false;
  }
}

function hasNextRuntime(dir) {
  try {
    return (
      fs.existsSync(path.join(dir, 'node_modules', 'next', 'dist', 'bin', 'next')) &&
      fs.existsSync(path.join(dir, 'node_modules'))
    );
  } catch {
    return false;
  }
}

function hasBuild(dir) {
  try {
    return fs.existsSync(path.join(dir, '.next', 'BUILD_ID'));
  } catch {
    return false;
  }
}

function collectAncestors(startAt, maxDepth = 6) {
  const out = [];
  let dir = path.resolve(startAt);
  for (let i = 0; i <= maxDepth; i++) {
    out.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

/**
 * Find the Lumina web app root. Order:
 *   1. LUMINA_ROOT env override
 *   2. ancestors of the executable (packaged: dist/Lumina-win32-x64/.. -> project)
 *   3. ancestors of the app dir (dev: desktop/.. -> project)
 *   4. cwd ancestors
 */
function resolveProjectRoot() {
  const candidates = [];
  const push = (dir) => {
    if (dir && !candidates.includes(dir)) candidates.push(dir);
  };

  if (process.env.LUMINA_ROOT) push(path.resolve(process.env.LUMINA_ROOT));
  if (app.isPackaged) collectAncestors(path.dirname(app.getPath('exe'))).forEach(push);
  else collectAncestors(path.dirname(APP_DIR)).forEach(push);
  collectAncestors(process.cwd()).forEach(push);
  if (!app.isPackaged) push(APP_DIR);

  const full = candidates.find((d) => looksLikeProject(d) && hasNextRuntime(d) && hasBuild(d));
  if (full) return full;

  // Next best: looks like the project but is not built / deps missing -> precise error later
  return candidates.find((d) => looksLikeProject(d)) || null;
}

function existsFile(p) {
  try {
    return !!p && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function listWorkbuddyNode() {
  const base = path.join(os.homedir(), '.workbuddy', 'binaries', 'node', 'versions');
  try {
    return fs
      .readdirSync(base)
      .map((v) => path.join(base, v, 'node.exe'))
      .filter(existsFile)
      .sort()
      .reverse(); // newest version first
  } catch {
    return [];
  }
}

/**
 * Locate a real node.exe (NOT Electron's bundled node - ABI matters).
 * Order: bundled vendor copy -> env override -> PATH -> common install dirs.
 */
function resolveNodeExe() {
  const vendorDirs = app.isPackaged
    ? [path.join(process.resourcesPath, 'vendor'), path.join(process.resourcesPath, 'app', 'vendor')]
    : [path.join(APP_DIR, 'vendor')];

  for (const dir of vendorDirs) {
    const candidate = path.join(dir, IS_WIN ? 'node.exe' : 'node');
    if (existsFile(candidate)) return { exe: candidate, source: 'bundled' };
  }

  if (process.env.LUMINA_NODE && existsFile(process.env.LUMINA_NODE)) {
    return { exe: process.env.LUMINA_NODE, source: 'env:LUMINA_NODE' };
  }

  const pathDirs = (process.env.PATH || '').split(IS_WIN ? ';' : ':').filter(Boolean);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, IS_WIN ? 'node.exe' : 'node');
    if (existsFile(candidate)) return { exe: candidate, source: 'PATH' };
  }

  if (IS_WIN) {
    const programDirs = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs', 'node.exe'),
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'nodejs', 'node.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'nodejs', 'node.exe'),
      process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node.exe'),
    ].filter(Boolean);
    for (const candidate of programDirs) {
      if (existsFile(candidate)) return { exe: candidate, source: 'ProgramFiles' };
    }
    const wb = listWorkbuddyNode();
    if (wb.length) return { exe: wb[0], source: 'workbuddy' };
  } else {
    for (const candidate of ['/usr/local/bin/node', '/usr/bin/node', '/opt/homebrew/bin/node']) {
      if (existsFile(candidate)) return { exe: candidate, source: 'unix-prefix' };
    }
  }

  return { exe: null, source: 'not-found' };
}

// ---------------------------------------------------------------------------
// HTTP / port helpers
// ---------------------------------------------------------------------------

function httpGet(url, timeoutMs = 2000, headers = null) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    let req;
    // 云端可能是 https，本地是 http：按协议选模块，别把 https 地址喂给 http.get
    const mod = /^https:/i.test(url) ? https : http;
    try {
      req = mod.get(url, { timeout: timeoutMs, headers: headers || {} }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 128 * 1024) req.destroy();
        });
        res.on('end', () =>
          done({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body }),
        );
      });
    } catch (err) {
      done({ ok: false, error: err.message });
      return;
    }
    req.on('timeout', () => {
      req.destroy();
      done({ ok: false, error: 'timeout' });
    });
    req.on('error', (err) => done({ ok: false, error: err.code || err.message }));
  });
}

/* ---------------------------------------------------------------------------
 * access token (optional gate: src/proxy.ts activates it when APP_ACCESS_TOKEN
 * is set, e.g. for LAN / phone PWA access). The shell must authenticate too,
 * otherwise every request - including /api/health - comes back 401.
 * ------------------------------------------------------------------------ */

let appToken = null;

/** Reads APP_ACCESS_TOKEN from the project's .env files (Next.js load order). */
function readProjectEnvToken(root) {
  if (!root) return null;
  for (const name of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    try {
      const text = fs.readFileSync(path.join(root, name), 'utf8');
      const match = text.match(/^[ \t]*APP_ACCESS_TOKEN[ \t]*=[ \t]*(.+)$/m);
      if (match) {
        const value = match[1].trim().replace(/^['"]|['"]$/g, '');
        if (value) return value;
      }
    } catch {
      /* file missing */
    }
  }
  return null;
}

function resolveAppToken(root) {
  return (
    (process.env.LUMINA_APP_TOKEN || '').trim() ||
    (config.appToken ? String(config.appToken) : '') ||
    readProjectEnvToken(root) ||
    null
  );
}

/**
 * Makes the Electron session look like an authenticated browser:
 *   - seeds the `app_token` cookie the proxy sets itself
 *   - attaches x-app-token to every request to the local origin (belt & braces)
 * Safe to call when no token is configured.
 */
async function installAuthToken() {
  const origins = isRemoteMode()
    ? [remoteBaseUrl()].filter(Boolean)
    : [`http://127.0.0.1:${serverPort}`, `http://localhost:${serverPort}`];
  try {
    const ses = session.defaultSession;
    ses.webRequest.onBeforeSendHeaders(
      { urls: origins.map((o) => `${o}/*`) },
      (details, callback) => {
        if (appToken) {
          details.requestHeaders['x-app-token'] = appToken;
          // keep the Referer sane for same-origin requests
        }
        callback({ requestHeaders: details.requestHeaders });
      },
    );
    if (!appToken) return;
    for (const origin of origins) {
      await ses.cookies
        .set({
          url: `${origin}/`,
          name: 'app_token',
          value: appToken,
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          expirationDate: Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60,
        })
        .catch((err) => serverLog(`cookie set failed (${origin}): ${err.message}`));
    }
    serverLog(`access token installed for ${origins[0]}`);
  } catch (err) {
    serverLog(`installAuthToken failed: ${err && err.message}`);
  }
}

/**
 * /api/health probe. Returns { up, gated, ok }:
 *  - up     : something of ours answers on the port
 *  - gated  : the answer was 401/403 => server is alive but token-protected
 */
async function probeHealthAt(base, timeoutMs = 2500) {
  const headers = appToken ? { 'x-app-token': appToken } : null;
  const res = await httpGet(`${base}${HEALTH_PATH}`, timeoutMs, headers);
  if (res.ok) {
    try {
      const json = JSON.parse(res.body);
      return { up: true, gated: false, ok: !!json && json.ok !== false };
    } catch {
      return { up: true, gated: false, ok: false };
    }
  }
  if (res.status === 401 || res.status === 403) return { up: true, gated: true, ok: true };
  return { up: false, gated: false, ok: false, error: res.error, status: res.status };
}

function probeHealth(port) {
  return probeHealthAt(`http://127.0.0.1:${port}`, 2500);
}

async function isHealthy(port) {
  const probe = await probeHealth(port);
  return probe.up;
}

function isPortOpen(port, host = '127.0.0.1', timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// splash window
// ---------------------------------------------------------------------------

function createSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) return splashWindow;
  splashShownAt = Date.now();
  splashWindow = new BrowserWindow({
    width: 470,
    height: 330,
    frame: false,
    resizable: false,
    movable: true,
    show: false,
    center: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1720',
    title: PRODUCT,
    icon: iconPath('tray.png') || undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: DEVTOOLS_ENABLED,
    },
  });
  splashWindow.loadFile(path.join(APP_DIR, 'splash.html')).catch(() => {});
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  return splashWindow;
}

function setSplashStatus(message, kind = 'info') {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const payload = JSON.stringify({ message: String(message || ''), kind: String(kind || 'info') });
  splashWindow.webContents
    .executeJavaScript(`window.__luminaSplash && window.__luminaSplash(${payload});`, true)
    .catch(() => {});
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    const win = splashWindow;
    splashWindow = null;
    try {
      win.destroy();
    } catch {
      /* ignore */
    }
  }
}

function iconPath(name) {
  const candidates = [
    path.join(APP_DIR, 'build', name),
    path.join(process.resourcesPath || '', 'build', name),
    path.join(process.resourcesPath || '', 'app', 'build', name),
  ];
  for (const candidate of candidates) {
    if (existsFile(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// server lifecycle
// ---------------------------------------------------------------------------

function nextBinPath(root) {
  return path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
}

/**
 * The guard keeps the spawned server from outliving a hard-killed shell.
 * It lives inside app.asar when packaged, and a real node.exe cannot read asar
 * paths - so we materialise it into userData and load it with `node -r`.
 */
function materializeGuard() {
  try {
    const source = path.join(__dirname, 'server-guard.cjs');
    const target = path.join(app.getPath('userData'), 'server-guard.cjs');
    const body = fs.readFileSync(source, 'utf8');
    let current = '';
    try {
      current = fs.readFileSync(target, 'utf8');
    } catch {
      /* first run */
    }
    if (current !== body) {
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, body, 'utf8');
    }
    return target;
  } catch (err) {
    serverLog(`could not materialise server guard: ${err && err.message}`);
    return null;
  }
}

function startServerProcess() {
  return new Promise((resolve, reject) => {
    const bin = nextBinPath(projectRoot);
    if (!existsFile(bin)) {
      reject(new Error(`找不到 Next.js 运行时：${bin}\n请先在项目目录执行 npm install。`));
      return;
    }
    serverHost = config.lanAccess ? '0.0.0.0' : '127.0.0.1';
    const guard = materializeGuard();
    const args = [
      ...(guard ? ['-r', guard] : []),
      bin,
      'start',
      '-H',
      serverHost,
      '-p',
      String(serverPort),
    ];

    serverLog(`spawn ${nodeExePath} ${args.join(' ')} (cwd=${projectRoot})`);

    let child;
    try {
      child = spawn(nodeExePath, args, {
        cwd: projectRoot,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(serverPort),
          // lets src/server-guard.cjs notice when this shell dies
          LUMINA_PARENT_PID: String(process.pid),
          // keep the local DB + uploads inside the project folder
          LUMINA_DATA_DIR: process.env.LUMINA_DATA_DIR || path.join(projectRoot, 'data'),
          ELECTRON_RUN_AS_NODE: undefined,
        },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(err);
      return;
    }

    serverProc = child;
    serverOwned = true;

    child.stdout.on('data', (d) => serverLog(`out: ${d.toString().trimEnd()}`));
    child.stderr.on('data', (d) => serverLog(`err: ${d.toString().trimEnd()}`));
    child.on('error', (err) => {
      serverLog(`child error: ${err.message}`);
      reject(err);
    });
    child.on('exit', (code, signal) => {
      serverLog(`child exit code=${code} signal=${signal}`);
      if (serverProc === child) {
        serverProc = null;
        serverOwned = false;
      }
      if (!isQuitting && mainWindow && !mainWindow.isDestroyed() && !booting) {
        // unexpected death while running -> tell the user
        dialog
          .showMessageBox(mainWindow, {
            type: 'error',
            title: `${PRODUCT} 服务已退出`,
            message: '本地 Next.js 服务意外退出。',
            detail: tailServerLog(15) || '（无日志）',
            buttons: ['重启服务', '继续使用当前窗口', '退出'],
            defaultId: 0,
            cancelId: 1,
          })
          .then(({ response }) => {
            if (response === 0) restartService();
            else if (response === 2) quitApp();
          })
          .catch(() => {});
      }
    });

    resolve(child);
  });
}

async function waitForHealth(onTick) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    if (serverProc && serverProc.exitCode !== null) {
      throw new Error(`本地服务进程已退出（exit ${serverProc.exitCode}）。\n\n${tailServerLog(20)}`);
    }
    if (await isHealthy(serverPort)) return true;
    attempt += 1;
    if (onTick) onTick(attempt);
    await sleep(HEALTH_POLL_MS);
  }
  throw new Error(`等待本地服务超时（${Math.round(HEALTH_TIMEOUT_MS / 1000)}s）。\n\n${tailServerLog(20)}`);
}

/** Kill only the process tree we spawned. Never touch an external/reused server. */
async function stopOwnedServer() {
  const child = serverProc;
  if (!child || !serverOwned) return;
  serverProc = null;
  serverOwned = false;
  const pid = child.pid;
  serverLog(`stopping owned server pid=${pid}`);
  if (!pid) return;

  await new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (!finished) {
        finished = true;
        resolve();
      }
    };
    child.once('exit', done);
    if (IS_WIN) {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => done());
    } else {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        done();
      }, 3000);
    }
    setTimeout(done, 8000);
  });

  // give the OS a moment to release the listening socket
  for (let i = 0; i < 25; i++) {
    if (!(await isPortOpen(serverPort))) break;
    await sleep(200);
  }
}

async function restartService() {
  if (booting) return;

  // 云端模式没有本地进程可重启：等价于「重新探活 + 刷新页面」
  if (isRemoteMode()) {
    const base = remoteBaseUrl();
    if (!mainWindow || mainWindow.isDestroyed()) {
      await boot();
      return;
    }
    try {
      await installAuthToken();
      const probe = await probeHealthAt(base, 8000);
      if (!probe.up) {
        dialog.showMessageBox({
          type: 'error',
          title: PRODUCT,
          message: '连不上云端服务',
          detail: `${base}（${probe.error === 'timeout' ? '连接超时' : probe.error || `HTTP ${probe.status}`}）`,
          buttons: ['知道了'],
        });
        return;
      }
      mainWindow.webContents.reloadIgnoringCache();
      serverLog(`remote reload from ${base}`);
    } catch (err) {
      serverLog(`remote reload failed: ${err && err.message}`);
    }
    return;
  }

  try {
    booting = true;
    createSplash();
    setSplashStatus('正在重启本地服务…', 'busy');
    if (!serverOwned) {
      const external = await isHealthy(serverPort);
      if (external) {
        booting = false;
        closeSplash();
        dialog.showMessageBox({
          type: 'info',
          title: PRODUCT,
          message: '当前服务不是由 Lumina 桌面端启动的。',
          detail: '请在启动它的终端窗口里重启，或先关闭那个进程再从托盘重启。',
          buttons: ['知道了'],
        });
        return;
      }
    }
    await stopOwnedServer();
    await startServerProcess();
    setSplashStatus('正在启动本地服务…', 'busy');
    await waitForHealth((n) => setSplashStatus(`等待服务就绪…（${n}）`, 'busy'));
    booting = false;
    closeSplash();
    await loadMainUrl();
    updateTrayMenu();
  } catch (err) {
    booting = false;
    const message = err && err.message ? err.message : String(err);
    serverLog(`restart failed: ${message}`);
    setSplashStatus('重启失败', 'error');
    console.error('[lumina] restart failed', message);
    dialog.showMessageBox({
      type: 'error',
      title: `${PRODUCT} 服务重启失败`,
      message: '无法重启本地服务。',
      detail: message,
      buttons: ['知道了'],
    });
  }
}

// ---------------------------------------------------------------------------
// window state
// ---------------------------------------------------------------------------

function defaultBounds() {
  const primary = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1280, Math.max(900, Math.round(primary.width * 0.78)));
  const height = Math.min(860, Math.max(620, Math.round(primary.height * 0.82)));
  return {
    width: 1280,
    height: 860,
    x: Math.round(primary.x + (primary.width - Math.min(width, 1280)) / 2),
    y: Math.round(primary.y + (primary.height - Math.min(height, 860)) / 2),
  };
}

function visibleBounds(state) {
  if (!state) return null;
  const { x, y, width, height } = state;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  const w = Math.max(900, Math.round(width));
  const h = Math.max(620, Math.round(height));
  // ensure at least a chunk of the window lands on some display
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      const overlapX = Math.min(x + w, a.x + a.width) - Math.max(x, a.x);
      const overlapY = Math.min(y + h, a.y + a.height) - Math.max(y, a.y);
      return overlapX > 80 && overlapY > 80;
    });
    if (onScreen) return { x: Math.round(x), y: Math.round(y), width: w, height: h };
  }
  const primary = screen.getPrimaryDisplay().workArea;
  return {
    width: w,
    height: h,
    x: Math.round(primary.x + (primary.width - w) / 2),
    y: Math.round(primary.y + (primary.height - h) / 2),
  };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const maximized = mainWindow.isMaximized();
  const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  saveConfig({ window: { ...bounds, maximized } });
}

function trackWindowState(win) {
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(saveWindowState, 400);
  };
  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('maximize', schedule);
  win.on('unmaximize', schedule);
  win.on('close', () => {
    clearTimeout(timer);
    saveWindowState();
  });
}

// ---------------------------------------------------------------------------
// main window
// ---------------------------------------------------------------------------

function appUrl() {
  if (isRemoteMode()) {
    const base = remoteBaseUrl();
    if (base) return `${base}/`;
  }
  return `http://127.0.0.1:${serverPort}/`;
}

async function loadMainUrl() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    await mainWindow.loadURL(appUrl());
  } catch (err) {
    serverLog(`loadURL failed: ${err && err.message}`);
  }
}

function createMainWindow() {
  const saved = config.window;
  const bounds = visibleBounds(saved) || defaultBounds();

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: PRODUCT,
    backgroundColor: '#f6f4ee',
    icon: iconPath('icon.ico') || undefined,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      backgroundThrottling: false,
      devTools: DEVTOOLS_ENABLED,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  if (saved && saved.maximized) mainWindow.maximize();
  trackWindowState(mainWindow);

  // external links: open in the system browser, never in-app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const target = safeUrl(url);
    if (!target) {
      event.preventDefault();
      return;
    }
    const current = safeUrl(appUrl());
    if (current && target.origin === current.origin) return; // in-app navigation
    event.preventDefault();
    openExternalSafe(url);
  });

  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    serverLog(`renderer gone: ${JSON.stringify(details)}`);
    if (isQuitting) return;
    dialog
      .showMessageBox(mainWindow, {
        type: 'error',
        title: PRODUCT,
        message: '界面进程异常结束。',
        detail: `原因：${details && details.reason}`,
        buttons: ['重新加载', '退出'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0 && mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
        else quitApp();
      })
      .catch(() => {});
  });

  installShortcuts(mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
    closeSplash();
  });

  // close -> hide to tray (first time: explain once)
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    if (config.minimizeToTray === false) return; // let it really close
    event.preventDefault();
    mainWindow.hide();
    notifyMinimizedToTray();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function safeUrl(raw) {
  try {
    const parsed = new URL(String(raw));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function openExternalSafe(raw) {
  const parsed = safeUrl(raw);
  if (!parsed) {
    serverLog(`blocked non-http(s) external navigation: ${raw}`);
    return false;
  }
  shell.openExternal(parsed.toString()).catch((err) => serverLog(`openExternal failed: ${err.message}`));
  return true;
}

function notifyMinimizedToTray() {
  if (config.trayNoticeShown) return;
  saveConfig({ trayNoticeShown: true });
  if (tray && IS_WIN && typeof tray.displayBalloon === 'function') {
    try {
      tray.displayBalloon({
        title: `${PRODUCT} 仍在后台运行`,
        content: '窗口已最小化到系统托盘，双击图标即可重新打开。',
        iconType: 'info',
      });
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// keyboard shortcuts (menu bar is hidden, so bind the useful ones manually)
// ---------------------------------------------------------------------------

function installShortcuts(win) {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = String(input.key || '');
    const lower = key.toLowerCase();
    const wc = win.webContents;
    const zoomNow = () => (typeof wc.getZoomLevel === 'number' ? wc.getZoomLevel() : 0);

    // F5 / Ctrl+R -> reload
    if (key === 'F5' || (ctrl && lower === 'r' && !input.shift)) {
      event.preventDefault();
      wc.reload();
      return;
    }
    // Ctrl+Shift+R -> hard reload
    if (ctrl && input.shift && lower === 'r') {
      event.preventDefault();
      wc.reloadIgnoringCache();
      return;
    }
    // F11 -> fullscreen
    if (key === 'F11') {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
      return;
    }
    // Ctrl+Shift+I / F12 -> devtools (development builds only)
    if ((ctrl && input.shift && lower === 'i') || key === 'F12') {
      if (DEVTOOLS_ENABLED) {
        event.preventDefault();
        wc.toggleDevTools();
      }
      return;
    }
    // Ctrl +/-/0 -> zoom
    if (ctrl && (key === '=' || key === '+' || key === '-' || key === '_' || key === '0')) {
      event.preventDefault();
      if (key === '0') {
        wc.setZoomLevel(0);
      } else if (key === '-' || key === '_') {
        wc.setZoomLevel(Math.max(ZOOM_MIN, zoomNow() - ZOOM_STEP));
      } else {
        wc.setZoomLevel(Math.min(ZOOM_MAX, zoomNow() + ZOOM_STEP));
      }
      return;
    }
    // Ctrl+H -> back to home
    if (ctrl && lower === 'h') {
      event.preventDefault();
      loadMainUrl();
      return;
    }
    // Esc leaves fullscreen
    if (key === 'Escape' && win.isFullScreen()) {
      event.preventDefault();
      win.setFullScreen(false);
    }
  });
}

// ---------------------------------------------------------------------------
// tray
// ---------------------------------------------------------------------------

function trayImage() {
  const png = iconPath('tray.png');
  const ico = iconPath('icon.ico');
  for (const candidate of [png, ico].filter(Boolean)) {
    const img = nativeImage.createFromPath(candidate);
    if (!img.isEmpty()) return img;
  }
  return nativeImage.createEmpty();
}

function loginItemEnabled() {
  if (!app.isPackaged) return false;
  try {
    const settings = app.getLoginItemSettings();
    return !!(settings && settings.openAtLogin);
  } catch {
    return false;
  }
}

function setLoginItem(enabled) {
  if (!app.isPackaged) return false;
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: false,
      args: [],
    });
    return true;
  } catch (err) {
    serverLog(`setLoginItemSettings failed: ${err.message}`);
    return false;
  }
}

function buildTrayMenu() {
  const remote = isRemoteMode();
  const base = remoteBaseUrl();
  const lan = !!config.lanAccess;
  const baseLabel = base ? base.replace(/^https?:\/\//, '') : '未配置';

  const modeSubmenu = [
    {
      label: `云端（${baseLabel}）`,
      type: 'radio',
      checked: remote,
      enabled: !!base,
      click: () => switchServerMode('remote'),
    },
    {
      label: `本机服务（127.0.0.1:${serverPort}）`,
      type: 'radio',
      checked: !remote,
      click: () => switchServerMode('local'),
    },
  ];

  const items = [{ label: `显示 ${PRODUCT}`, click: () => showMainWindow() }, { type: 'separator' }];

  if (remote) {
    items.push(
      { label: `已连接云端：${baseLabel}`, enabled: false },
      { label: '重新连接云端', click: () => restartService() },
      { label: '在浏览器中打开', click: () => openExternalSafe(appUrl()) },
    );
  } else {
    items.push(
      { label: '重启本地服务', click: () => restartService() },
      {
        label: lan ? '允许局域网访问（已开启）' : '允许局域网访问',
        type: 'checkbox',
        checked: lan,
        click: (item) => toggleLanAccess(item.checked),
      },
      { label: '在浏览器中打开', click: () => openExternalSafe(appUrl()) },
      {
        label: '打开数据目录',
        click: () => {
          const dir = path.join(projectRoot || APP_DIR, 'data');
          ensureDir(dir);
          shell.openPath(dir);
        },
      },
    );
  }

  items.push({ type: 'separator' }, { label: '服务端', submenu: modeSubmenu });

  items.push({
    label: '开机自启',
    type: 'checkbox',
    checked: loginItemEnabled(),
    enabled: app.isPackaged,
    click: (item) => {
      const ok = setLoginItem(item.checked);
      if (!ok) {
        dialog.showMessageBox({
          type: 'warning',
          title: PRODUCT,
          message: '开机自启仅在安装后的正式版本可用。',
          buttons: ['知道了'],
        });
        updateTrayMenu();
      }
    },
  });

  items.push({ type: 'separator' }, { label: `退出 ${PRODUCT}`, click: () => quitApp() });

  return Menu.buildFromTemplate(items);
}

/** 托盘里切换「云端 / 本机」，切换后重建窗口（两套连接不能并存）。 */
async function switchServerMode(mode) {
  const next = mode === 'local' ? 'local' : 'remote';
  if (next === (isRemoteMode() ? 'remote' : 'local')) return;
  saveConfig({ serverMode: next });
  serverLog(`server mode -> ${next}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.destroy();
    } catch {
      /* ignore */
    }
    mainWindow = null;
  }
  updateTrayMenu();
  await boot();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
  if (isRemoteMode()) {
    const base = remoteBaseUrl();
    tray.setToolTip(`${PRODUCT} - 云端 ${base ? base.replace(/^https?:\/\//, '') : '(未配置)'}`);
    return;
  }
  const lan = config.lanAccess;
  const host = lan ? localLanAddress() : '127.0.0.1';
  tray.setToolTip(`${PRODUCT} - http://${host}:${serverPort}`);
}

function localLanAddress() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const info of nets[name] || []) {
        if (info.family === 'IPv4' && !info.internal) return info.address;
      }
    }
  } catch {
    /* ignore */
  }
  return '127.0.0.1';
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip(`${PRODUCT} - 本地 AI 学习工作台`);
  updateTrayMenu();
  tray.on('click', () => showMainWindow());
  tray.on('double-click', () => showMainWindow());
  tray.on('right-click', () => {
    updateTrayMenu();
    tray.popUpContextMenu();
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (bootError) {
      dialog.showMessageBox({ type: 'error', title: PRODUCT, message: bootError.message, buttons: ['知道了'] });
      return;
    }
    boot();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function toggleLanAccess(enabled) {
  if (isRemoteMode()) return; // 云端模式下不存在「局域网访问」这回事
  saveConfig({ lanAccess: !!enabled });
  updateTrayMenu();
  if (!serverOwned) {
    const healthy = await isHealthy(serverPort);
    dialog.showMessageBox({
      type: 'info',
      title: PRODUCT,
      message: enabled ? '已记录局域网访问设置。' : '已关闭局域网访问设置。',
      detail: healthy
        ? '当前服务由外部启动，无法由桌面端重启；重启该服务后生效。'
        : '服务未运行，下次启动时生效。',
      buttons: ['知道了'],
    });
    return;
  }
  await restartService();
  if (enabled) {
    dialog.showMessageBox({
      type: 'info',
      title: PRODUCT,
      message: '局域网访问已开启',
      detail: `同一 Wi-Fi 下的设备可访问：http://${localLanAddress()}:${serverPort}\n首次访问可能需要在 Windows 防火墙中允许 Node.js。`,
      buttons: ['知道了'],
    });
  }
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

/**
 * 云端模式：不起本地服务、不找 node.exe、不要求本机有 .next 构建。
 * 只做三件事——装令牌、探活、开窗口。
 */
async function bootRemote() {
  const base = remoteBaseUrl();
  if (!base) {
    throw new Error(
      '云端地址无效。\n\n请在托盘 →「服务端」里重新填写，或设置环境变量 LUMINA_URL（例如 http://123.207.239.2:3210）。',
    );
  }

  // 令牌解析顺序与本地模式一致：环境变量 > config.json > 项目 .env
  projectRoot = resolveProjectRoot();
  appToken = resolveAppToken(projectRoot);
  serverLog(`--- boot (remote) --- url=${base} token=${appToken ? 'yes' : 'no'}`);

  await installAuthToken();
  setSplashStatus(`正在连接 ${base.replace(/^https?:\/\//, '')} …`, 'busy');

  const probe = await probeHealthAt(base, 8000);
  if (!probe.up) {
    const detail = probe.error === 'timeout' ? '连接超时' : probe.error || `HTTP ${probe.status || '?'}`;
    throw new Error(
      `连不上云端服务：${base}（${detail}）\n\n可能的原因：\n` +
        '  · 服务器没在跑：ssh 上去看 systemctl status lumina\n' +
        '  · 当前网络访问不了这个地址（换了 Wi-Fi / 公司网络拦截）\n' +
        '  · 云端防火墙没放行 3210\n\n' +
        '想先用本机服务：托盘 →「服务端」→「本机服务」。',
    );
  }
  if (probe.gated) {
    throw new Error(
      `云端服务在线，但令牌被拒绝（${base} 返回 401）。\n\n` +
        '桌面端用的是本机 .env.local 里的 APP_ACCESS_TOKEN，必须与服务器上那份一致。\n' +
        '如果你最近换过令牌，重新部署一次云端（或同步 .env.local）后重启 Lumina。',
    );
  }

  setSplashStatus('正在加载界面…', 'busy');
  const splashElapsed = Date.now() - splashShownAt;
  if (splashElapsed < SPLASH_MIN_MS) await sleep(SPLASH_MIN_MS - splashElapsed);
  createMainWindow();
  await loadMainUrl();
  serverLog(`remote UI loaded from ${base}`);
}

async function boot() {
  if (booting) return;
  booting = true;
  bootError = null;

  const remote = isRemoteMode();
  createSplash();
  setSplashStatus(remote ? '正在连接云端…' : '正在准备本地服务…', 'busy');

  try {
    if (remote) {
      await bootRemote();
      booting = false;
      updateTrayMenu();
      return;
    }

    // 1. project root
    projectRoot = resolveProjectRoot();
    if (!projectRoot) {
      throw new Error(
        '找不到 Lumina 主程序目录（包含 package.json 与 next.config 的文件夹）。\n\n' +
          `当前程序位置：${app.getPath('exe')}\n` +
          '请把 Lumina.exe 保留在 Lumina 项目文件夹内（例如 项目\\desktop\\dist\\Lumina-win32-x64\\），' +
          '或设置环境变量 LUMINA_ROOT 指向项目根目录。',
      );
    }

    // 2. built?
    if (!hasBuild(projectRoot)) {
      throw new Error(
        `未找到生产构建（${path.join(projectRoot, '.next', 'BUILD_ID')} 不存在）。\n\n` +
          '请先在项目目录运行：\n  npm install\n  npm run build\n然后重新打开 Lumina。',
      );
    }

    // 3. node.exe
    const node = resolveNodeExe();
    nodeExePath = node.exe;
    if (!nodeExePath) {
      throw new Error(
        '找不到可用的 Node.js（node.exe）。\n\n' +
          '请安装 Node.js 20/22，或把 node.exe 放到 resources\\vendor\\node.exe。',
      );
    }
    serverLog(`--- boot --- projectRoot=${projectRoot} node=${nodeExePath} (${node.source})`);

    // 3.5 optional access token (src/proxy.ts gate for LAN / phone PWA use)
    appToken = resolveAppToken(projectRoot);
    serverLog(appToken ? 'access token configured - requests will be authenticated' : 'no access token (open local mode)');

    // 4. reuse a healthy server, otherwise spawn one
    serverPort = ENV_PORT || Number(config.port) || DEFAULT_PORT;
    await installAuthToken();
    const healthy = await isHealthy(serverPort);
    if (healthy) {
      serverOwned = false;
      serverLog(`reusing server already listening on ${serverPort}`);
      setSplashStatus('检测到已运行的本地服务，正在连接…', 'busy');
    } else {
      if (await isPortOpen(serverPort)) {
        throw new Error(
          `端口 ${serverPort} 已被其它程序占用，但 ${HEALTH_PATH} 没有正常响应。\n\n` +
            '请关闭占用该端口的程序，或设置环境变量 LUMINA_PORT 换一个端口。',
        );
      }
      setSplashStatus('正在启动本地服务…', 'busy');
      await startServerProcess();
      await waitForHealth((n) => {
        if (n % 5 === 0) setSplashStatus(`正在启动本地服务…（${n}）`, 'busy');
      });
    }

    // 5. window + real UI
    setSplashStatus('正在加载界面…', 'busy');
    const splashElapsed = Date.now() - splashShownAt;
    if (splashElapsed < SPLASH_MIN_MS) await sleep(SPLASH_MIN_MS - splashElapsed);
    createMainWindow();
    await loadMainUrl();
    booting = false;
    updateTrayMenu();
  } catch (err) {
    booting = false;
    bootError = err instanceof Error ? err : new Error(String(err));
    serverLog(`boot failed: ${bootError.message}`);
    console.error('[lumina] boot failed:', bootError.message);
    setSplashStatus('启动失败', 'error');
    closeSplash();
    dialog
      .showMessageBox({
        type: 'error',
        title: `${PRODUCT} 启动失败`,
        message: '无法启动本地服务。',
        detail: bootError.message,
        buttons: ['退出', '重试'],
        defaultId: 0,
        cancelId: 0,
      })
      .then(({ response }) => {
        if (response === 1) {
          bootError = null;
          boot();
        } else {
          quitApp();
        }
      })
      .catch(() => quitApp());
  }
}

// ---------------------------------------------------------------------------
// quit
// ---------------------------------------------------------------------------

async function quitApp() {
  if (isQuitting) return;
  isQuitting = true;
  try {
    await stopOwnedServer();
  } catch {
    /* ignore */
  }
  closeSplash();
  if (tray) {
    try {
      tray.destroy();
    } catch {
      /* ignore */
    }
    tray = null;
  }
  app.quit();
}

function shutdownSync() {
  // last-chance synchronous cleanup (only the process we own)
  const child = serverProc;
  if (!child || !serverOwned || !child.pid) return;
  try {
    if (IS_WIN) {
      require('node:child_process').execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    /* ignore */
  }
  serverProc = null;
  serverOwned = false;
}

// ---------------------------------------------------------------------------
// app bootstrap
// ---------------------------------------------------------------------------

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance owns the tray. It will show itself via 'second-instance'.
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // `Lumina.exe --quit` asks a running instance to shut down cleanly
    if (Array.isArray(argv) && argv.some((a) => String(a).toLowerCase() === '--quit')) {
      quitApp();
      return;
    }
    showMainWindow();
  });

  // Single-instance handling for the `--quit` switch on the FIRST launch too:
  // nothing to quit if we are the only instance, so just exit quietly.
  if (process.argv.some((a) => String(a).toLowerCase() === '--quit')) {
    app.quit();
  }

  app.on('before-quit', () => {
    isQuitting = true;
    shutdownSync();
  });

  app.on('will-quit', () => {
    if (logStream) {
      try {
        logStream.end();
      } catch {
        /* ignore */
      }
      logStream = null;
    }
  });

  // Tray app: closing the last window must NOT quit.
  app.on('window-all-closed', () => {
    if (isQuitting) app.quit();
  });

  app.on('activate', () => showMainWindow());

  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      loadConfig();
      serverPort = ENV_PORT || Number(config.port) || DEFAULT_PORT;
      createTray();
      await boot();
    })
    .catch((err) => {
      console.error('[lumina] fatal:', err);
      dialog.showErrorBox(`${PRODUCT} 启动失败`, String((err && err.message) || err));
      app.quit();
    });
}

// exported for potential future unit tests
module.exports = { safeUrl };