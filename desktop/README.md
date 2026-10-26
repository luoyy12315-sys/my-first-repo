# Lumina 桌面版（Electron 外壳）

把根目录的 Next.js 应用包成**真正的 Windows 程序**：双击出现独立窗口，没有地址栏和标签页，
关闭后缩到系统托盘常驻，可开机自启、可一键开局域网访问。

## 两种运行模式（2026-10-25 起默认云端）

| | 云端模式（默认） | 本机模式 |
| --- | --- | --- |
| 连到哪 | `http://123.207.239.2:3210`（腾讯云常驻） | 自己用内嵌 `node.exe` 起 `next start` |
| 需要本机有 `.next` 构建吗 | 不需要 | 需要 |
| 需要 `node_modules` 吗 | 不需要 | 需要 |
| exe 能单独挪走吗 | 能 | 不能（要从自己所在目录往上找项目根） |
| 数据在哪 | 云端 `data/lumina.db`（唯一一份） | 本机 `data/lumina.db` |
| 离线能用吗 | 不能（连不上会明确报错，不会偷偷回退本机库） | 能 |

切换方式：**托盘图标右键 →「服务端」→ 选「云端」或「本机服务」**。切换会写进
`%APPDATA%\Lumina\config.json` 的 `serverMode`（`remote` / `local`）并重建窗口。

也可以用环境变量临时覆盖，优先级高于配置：

```powershell
$env:LUMINA_MODE = 'local'                        # 强制本机模式
$env:LUMINA_URL  = 'http://1.2.3.4:3210'          # 换一个云端地址
$env:LUMINA_APP_TOKEN = '<令牌>'                  # 覆盖 .env.local 里的 APP_ACCESS_TOKEN
```

云端模式下令牌的解析顺序：`LUMINA_APP_TOKEN` → `config.json` 的 `appToken` → 项目 `.env.local` 的
`APP_ACCESS_TOKEN`。拿到令牌后先写 `app_token` Cookie 再加载页面，所以窗口里不会看到令牌页。

```
desktop/
├── package.json               # electron + @electron/packager；scripts: start / build / icons / shortcut
├── .npmrc                     # npmmirror registry + Electron 二进制国内镜像
├── .gitignore                 # 忽略 node_modules / dist / vendor/node.exe / 生成的图标
├── splash.html                # 启动加载页（打进 asar）
├── install-shortcut.ps1       # 桌面 + 开始菜单快捷方式（-Remove 卸载，幂等，纯 ASCII）
├── README.md
├── src/
│   ├── main.js                # 主进程：单实例、托盘、服务生命周期、窗口状态、快捷键、令牌
│   └── server-guard.cjs       # 子进程看门狗：Lumina.exe 被强杀时让 node 服务自杀，避免占端口
├── scripts/
│   ├── build.mjs              # 复制 node.exe → vendor/、生成图标 → @electron/packager 打包
│   ├── make-icon.mjs          # public/icons/icon-512.png（PWA 产物）→ build/icon.ico + tray.png
│   └── verify-asar.mjs        # 打包产物自检（关键实现是否真的进了 asar）
├── build/                     # 生成的 icon.ico（16/24/32/48/64/128/256）+ tray.png
├── vendor/node.exe            # 内嵌的真实 Node.js（build.mjs 复制，不进 git）
└── dist/Lumina-win32-x64/     # 产物：Lumina.exe + resources/app.asar + resources/vendor/node.exe
```

## 为什么服务跑在外部 node.exe 里？

`better-sqlite3` 是按 **Node ABI** 编译的原生模块，Electron 自带的是另一个 ABI，直接 require 会崩。
所以 Electron 只当外壳：用内嵌的 `resources/vendor/node.exe` 起 `next start`，再用 BrowserWindow 加载
`http://127.0.0.1:3210`。数据库、上传、`.next` 构建全部沿用根目录，桌面版和浏览器版行为一致。

## 构建

```powershell
cd desktop
# Node 不在 PATH 时用绝对路径：C:\Users\...\.workbuddy\binaries\node\versions\22.22.2-6\npm.cmd
npm install          # 只在 desktop/ 装依赖
npm run build        # = node scripts/build.mjs
```

产物：`desktop\dist\Lumina-win32-x64\Lumina.exe`（约 200 MiB，含 83 MiB 的 node.exe 副本）。

- `@electron/packager`，`platform=win32 arch=x64 asar=true`，图标与版本信息写进 exe 资源。
- 根目录的 `.next`（生产构建）必须存在：外壳只负责启动 `next start`，不负责 `next build`。
  缺 `.next\BUILD_ID` 时会弹出明确的错误提示窗口，而不是静默失败。
- 找不到 node.exe 时回退：`LUMINA_NODE` → `PATH` → `Program Files\nodejs` → `%USERPROFILE%\.workbuddy\binaries\node\versions\*`。
- 打包前会自动把 node.exe 复制到 `vendor/`，并以 `extraResource` 放到 `resources/vendor/`（asar 外，能被 spawn）。

## 创建桌面快捷方式

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\desktop\install-shortcut.ps1
# 卸载：  ... -File .\desktop\install-shortcut.ps1 -Remove
```

生成「桌面」和「开始菜单\程序」两个 `Lumina.lnk`，`IconLocation` 指向 exe（图标已嵌入）。
幂等：重复执行只覆盖同名快捷方式。

> ⚠️ 这个 .ps1 必须保持**纯 ASCII**（或存成 UTF-8 **带 BOM**）。Windows PowerShell 5.1 会把无 BOM 的
> UTF-8 当 ANSI 读，中文句末的引号会被 GBK 前导字节吃掉，导致整个脚本解析失败。

## 运行时行为

| 能力 | 说明 |
| --- | --- |
| 单实例 | `app.requestSingleInstanceLock()`；再次双击只会把已有窗口唤到前台 |
| 窗口 | 默认 1280×860，最小 900×620，位置尺寸/最大化状态记在 `%APPDATA%\Lumina\config.json` |
| 启动流程 | 先探测 `/api/health`：已跑就复用（退出时**不杀**别人的进程），否则自己 spawn，健康检查通过后加载界面；期间显示 splash（最短 700ms，避免闪一下） |
| 访问令牌 | 若项目启用了 `APP_ACCESS_TOKEN`（局域网/手机 PWA 场景，见 `src/proxy.ts`），外壳会自动带上令牌：Cookie `app_token` + `x-app-token` 请求头；令牌从 `LUMINA_APP_TOKEN` → `config.json` 的 `appToken` → 项目 `.env*` 依次读取 |
| 托盘 | 显示 Lumina / 重启本地服务 / 允许局域网访问 / 开机自启 / 在浏览器中打开 / 打开数据目录 / 退出 |
| 关闭行为 | 关闭窗口 → 隐藏到托盘（首次弹一次气泡提示）；托盘「退出」才真正退出，且**只杀自己启动的**服务进程 |
| 局域网 | 勾选后以 `-H 0.0.0.0` 重启服务，托盘提示 `http://<内网IP>:3210` |
| 开机自启 | `app.setLoginItemSettings({ openAtLogin })`，仅 `app.isPackaged` 时可用（托盘项在开发模式下禁用） |
| 外链 | `window.open` / `target=_blank` / 站外跳转一律 `shell.openExternal`，只放行 http(s)，其余（file:/javascript: 等）直接拒绝 |
| 快捷键 | F5 / Ctrl+R 刷新、Ctrl+Shift+R 强刷、F11 全屏、Esc 退出全屏、Ctrl+加号/减号/0 缩放、Ctrl+Shift+I 或 F12 开发者工具（仅未打包版本）、Ctrl+H 回首页 |
| 崩溃兜底 | 渲染进程崩溃 → 弹窗可重载；服务意外退出 → 弹窗可重启；`server-guard.cjs` 防止 Lumina.exe 被强杀后残留 node 抢端口 |
| 退出命令 | `Lumina.exe --quit` 让正在运行的实例优雅退出（清理子进程、释放端口） |

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `LUMINA_ROOT` | 强制指定 Next.js 项目根目录（默认从 exe 位置逐级向上找含 `package.json` + `next.config` + `.next\BUILD_ID` 的目录） |
| `LUMINA_PORT` | 覆盖端口（默认 3210） |
| `LUMINA_NODE` | 指定 node.exe |
| `LUMINA_APP_TOKEN` | 指定访问令牌（优先级高于 `.env*` 里的 `APP_ACCESS_TOKEN`） |
| `LUMINA_DEVTOOLS=1` | 在打包版本里也允许打开开发者工具 |
| `LUMINA_SPLASH_MIN_MS` | splash 最短显示时长（默认 700ms） |

## 验证（本地自证）

```powershell
$env:LUMINA_PORT = '3212'      # 验证时避开 3210/3211
Start-Process '...\desktop\dist\Lumina-win32-x64\Lumina.exe'
Start-Sleep 12
Get-Process Lumina | Where-Object MainWindowTitle | Select-Object Id, MainWindowTitle
Invoke-WebRequest 'http://127.0.0.1:3212/api/health' -UseBasicParsing | Select-Object -Expand Content
# 优雅退出（含子进程清理）+ 确认端口释放
& '...\Lumina.exe' --quit
netstat -ano | Select-String ':3212'      # 应无 LISTENING
```

## 需要加到根 package.json 的脚本（建议）

```json
"desktop": "npm --prefix desktop run start",
"desktop:build": "npm --prefix desktop run build",
"desktop:shortcut": "powershell -NoProfile -ExecutionPolicy Bypass -File desktop/install-shortcut.ps1"
```