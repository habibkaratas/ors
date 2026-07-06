import { spawn, type ChildProcess } from "child_process";

export function treeKill(child: ChildProcess, opts: { group?: boolean } = {}): void {
  const pid = child.pid;
  if (pid === undefined) {
    try { child.kill(); } catch {}
    return;
  }
  if (process.platform === "win32") {
    try {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
      killer.on("error", () => { try { child.kill(); } catch {} });
    } catch {
      try { child.kill(); } catch {}
    }
    return;
  }
  if (opts.group) {
    try { process.kill(-pid, "SIGTERM"); return; } catch {}
  }
  try { child.kill(); } catch {}
}
