#!/usr/bin/env node
/**
 * Lumina server guard (loaded with `node -r server-guard.cjs ...`).
 *
 * The Next.js server is a child of Lumina.exe. On Windows, killing a parent does
 * NOT kill its children, so a hard crash / Task Manager "End task" of the shell
 * would leave an orphaned node.exe holding port 3210 forever.
 *
 * This guard polls the parent process once every two seconds and exits as soon as
 * the parent is gone, which releases the port. It also forwards SIGTERM/SIGINT.
 */
'use strict';

const parentPid = Number(process.env.LUMINA_PARENT_PID || process.ppid || 0);

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM => process exists but we may not signal it
    return err && err.code === 'EPERM';
  }
}

if (parentPid && parentPid !== process.pid) {
  const timer = setInterval(() => {
    if (!alive(parentPid)) {
      // parent (Lumina.exe) is gone -> do not keep the port hostage
      try {
        console.error(`[guard] parent ${parentPid} exited, shutting down server`);
      } catch {
        /* ignore */
      }
      process.exit(0);
    }
  }, 2000);
  timer.unref();
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => process.exit(0));
}