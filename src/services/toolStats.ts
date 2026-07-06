export interface ToolStat {
  name: string;
  calls: number;
  ok: number;
  fail: number;
  totalMs: number;
}

export class ToolStats {
  private readonly stats = new Map<string, ToolStat>();
  private readonly timers = new Map<string, number[]>();

  begin(toolName: string): void {
    const arr = this.timers.get(toolName);
    if (arr) arr.push(Date.now());
    else this.timers.set(toolName, [Date.now()]);
    if (!this.stats.has(toolName)) {
      this.stats.set(toolName, { name: toolName, calls: 0, ok: 0, fail: 0, totalMs: 0 });
    }
    this.stats.get(toolName)!.calls++;
  }

  end(toolName: string, ok: boolean): void {
    const s = this.stats.get(toolName);
    if (!s) return;
    if (ok) s.ok++; else s.fail++;
    const arr = this.timers.get(toolName);
    const started = arr?.shift();
    if (started !== undefined) {
      s.totalMs += Date.now() - started;
    }
  }

  list(): ToolStat[] {
    return [...this.stats.values()].sort((a, b) => b.calls - a.calls);
  }

  clear(): void {
    this.stats.clear();
    this.timers.clear();
  }
}
