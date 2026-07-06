import * as fs from "fs/promises";

interface Checkpoint {
  absPath: string;
  before: string | null;
}

export class CheckpointManager {
  private groups: Checkpoint[][] = [];
  private current: Checkpoint[] | null = null;

  begin(): void {
    this.current = [];
    this.groups.push(this.current);
  }

  record(absPath: string, before: string | null): void {
    if (!this.current) this.begin();
    if (this.current!.some((c) => c.absPath === absPath)) return;
    this.current!.push({ absPath, before });
  }

  hasUndo(): boolean {
    return this.groups.some((g) => g.length > 0);
  }

  async undoLast(): Promise<number> {
    while (this.groups.length) {
      const g = this.groups.pop();
      if (g && g.length) {
        for (let i = g.length - 1; i >= 0; i--) {
          const c = g[i];
          if (c.before === null) {
            try {
              await fs.rm(c.absPath);
            } catch {
            }
          } else {
            await fs.writeFile(c.absPath, c.before, "utf8");
          }
        }
        if (this.current === g) this.current = null;
        return g.length;
      }
    }
    return 0;
  }

  clear(): void {
    this.groups = [];
    this.current = null;
  }
}
