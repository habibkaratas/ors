import { spawn } from "child_process";
import type { CancellationToken } from "vscode";
import { buildSafeEnv } from "./safeEnv";
import { treeKill } from "./procKill";

export interface ShellResult {
  code: number | null;
  output: string;
  killed: boolean;
  truncated: boolean;
  error?: string;
}

export function runShellCapture(
  command: string,
  opts: { cwd?: string; timeoutMs: number; maxChars: number; token?: CancellationToken }
): Promise<ShellResult> {
  const isWin = process.platform === "win32";
  const shell = isWin ? "powershell.exe" : "/bin/sh";
  const shellArgs = isWin ? ["-NoProfile", "-Command", command] : ["-c", command];

  return new Promise<ShellResult>((resolve) => {
    const child = spawn(shell, shellArgs, { cwd: opts.cwd, env: buildSafeEnv() });
    let out = "";
    let truncated = false;
    let killed = false;

    const append = (d: Buffer) => {
      if (out.length < opts.maxChars) out += d.toString();
      else truncated = true;
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    const timer = setTimeout(() => {
      killed = true;
      treeKill(child);
    }, opts.timeoutMs);
    const sub = opts.token?.onCancellationRequested(() => {
      killed = true;
      treeKill(child);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      sub?.dispose();
      resolve({ code: null, output: out, killed, truncated, error: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      sub?.dispose();
      resolve({ code, output: out.slice(0, opts.maxChars), killed, truncated });
    });
  });
}
