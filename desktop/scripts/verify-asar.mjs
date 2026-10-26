// quick sanity check of the packaged asar (dev tool, not shipped)
import fs from 'node:fs';
import path from 'node:path';
import * as asar from '@electron/asar';

const asarPath = path.resolve('dist/Lumina-win32-x64/resources/app.asar');
const main = asar.extractFile(asarPath, 'src/main.js').toString('utf8');
const guard = asar.extractFile(asarPath, 'src/server-guard.cjs').toString('utf8');
const splash = asar.extractFile(asarPath, 'splash.html').toString('utf8');
const pkg = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'));

const checks = {
  'asar exists': fs.existsSync(asarPath),
  'main: ENV_PORT honoured': main.includes('ENV_PORT') && main.includes('serverPort = ENV_PORT'),
  'main: guard wired': main.includes('materializeGuard') && main.includes("LUMINA_PARENT_PID"),
  'main: --quit switch': main.includes('--quit'),
  'main: single instance lock': main.includes('requestSingleInstanceLock'),
  'main: menu removed': main.includes('Menu.setApplicationMenu(null)'),
  'main: tray menu': main.includes('允许局域网访问') && main.includes('开机自启'),
  'main: openExternal handler': main.includes('setWindowOpenHandler') && main.includes('? ') === false || main.includes('setWindowOpenHandler'),
  'main: health probe': main.includes('/api/health'),
  'main: default port 3210': main.includes('const DEFAULT_PORT = 3210'),
  'guard: parent polling': guard.includes('LUMINA_PARENT_PID'),
  'splash: loaded': splash.includes('LUMINA'),
  'pkg main': pkg.main === 'src/main.js',
};
let failed = 0;
for (const [name, ok] of Object.entries(checks)) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);