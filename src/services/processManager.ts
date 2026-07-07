import { spawn, ChildProcess } from "child_process";
import { buildSafeEnv } from "../tools/safeEnv";
import { treeKill } from "../tools/procKill";

const MAX_BUFFER = 60_000;

interface BgProcess {
  id: string;
  command: string;
  child: ChildProcess;
  output: string;
  running: boolean;
  code: number | null;
}

export class ProcessManager {
  private readonly procs = new Map<string, BgProcess>();
  private seq = 0;

  start(command: string, cwd: string): { id: string } {
    const id = `proc_${++this.seq}`;
    const isWin = process.platform === "win32";
    const shell = isWin ? "powershell.exe" : "/bin/sh";
    const args = isWin ? ["-NoProfile", "-Command", command] : ["-c", command];
    const child = spawn(shell, args, { cwd, env: buildSafeEnv(), detached: !isWin });

    const proc: BgProcess = { id, command, child, output: "", running: true, code: null };
    const append = (d: Buffer) => {
      proc.output = (proc.output + d.toString()).slice(-MAX_BUFFER);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (e) => {
      append(Buffer.from(`\n[süreç hatası] ${e.message}\n`));
      proc.running = false;
      if (proc.code === null) proc.code = -1;
    });
    child.on("close", (code) => {
      proc.running = false;
      proc.code = code;
    });

    this.procs.set(id, proc);
    return { id };
  }

  check(id: string): { found: boolean; running: boolean; code: number | null; output: string } {
    const p = this.procs.get(id);
    if (!p) return { found: false, running: false, code: null, output: "" };
    return { found: true, running: p.running, code: p.code, output: p.output };
  }

  list(): { id: string; command: string; running: boolean }[] {
    return [...this.procs.values()].map((p) => ({
      id: p.id,
      command: p.command,
      running: p.running,
    }));
  }

  stop(id: string): boolean {
    const p = this.procs.get(id);
    if (!p) return false;
    if (p.running) {
      treeKill(p.child, { group: true });
    }
    this.procs.delete(id);
    return true;
  }

  disposeAll(): void {
    for (const p of this.procs.values()) {
      if (p.running) {
        try {
          treeKill(p.child, { group: true });
        } catch {
        }
      }
    }
    this.procs.clear();
  }
}
