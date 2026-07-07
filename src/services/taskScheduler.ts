export interface ScheduledTask {
  id: string;
  description: string;
  schedule: string;
  prompt: string;
  lastRun?: number;
  nextRun: number;
  enabled: boolean;
}

export type TaskRunCallback = (prompt: string) => Promise<void>;

export class TaskScheduler {
  private readonly tasks = new Map<string, ScheduledTask>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private seq = 0;
  private onRun?: TaskRunCallback;

  setRunCallback(cb: TaskRunCallback): void {
    this.onRun = cb;
  }

  static validate(schedule: string): string | null {
    const s = schedule.trim();
    if (s === "once") return null;
    const every = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/.exec(s);
    if (every) return parseInt(every[1]) >= 1 ? null : "Aralık en az 1 dakika olmalı.";
    if (/^\d{1,2}:\d{2}$/.test(s)) return null;
    return "Geçersiz zamanlama. Kullan: '*/N * * * *' (N≥1), 'HH:MM' veya 'once'.";
  }

  add(description: string, schedule: string, prompt: string): ScheduledTask {
    const err = TaskScheduler.validate(schedule);
    if (err) throw new Error(err);
    const id = `task_${++this.seq}`;
    const next = this.computeNext(schedule);
    const task: ScheduledTask = { id, description, schedule, prompt, nextRun: next, enabled: true };
    this.tasks.set(id, task);
    this.scheduleTimer(task);
    return task;
  }

  list(): ScheduledTask[] {
    return [...this.tasks.values()];
  }

  cancel(id: string): boolean {
    const t = this.tasks.get(id);
    if (!t) return false;
    t.enabled = false;
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.tasks.delete(id);
    return true;
  }

  disposeAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.tasks.clear();
  }

  private scheduleTimer(task: ScheduledTask): void {
    const delay = Math.max(500, task.nextRun - Date.now());
    const timer = setTimeout(async () => {
      if (!task.enabled) return;
      task.lastRun = Date.now();
      if (this.onRun) {
        await this.onRun(task.prompt).catch(console.error);
      }
      if (task.schedule !== "once" && task.enabled) {
        task.nextRun = this.computeNext(task.schedule);
        this.scheduleTimer(task);
      } else {
        this.tasks.delete(task.id);
        this.timers.delete(task.id);
      }
    }, delay);
    this.timers.set(task.id, timer);
  }

  private computeNext(schedule: string): number {
    if (schedule === "once") return Date.now() + 1_000;
    const every = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/.exec(schedule.trim());
    if (every) return Date.now() + parseInt(every[1]) * 60_000;
    const hm = /^(\d{1,2}):(\d{2})$/.exec(schedule.trim());
    if (hm) {
      const now = new Date();
      const next = new Date();
      next.setHours(parseInt(hm[1]), parseInt(hm[2]), 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next.getTime();
    }
    return Date.now() + 60_000;
  }
}
