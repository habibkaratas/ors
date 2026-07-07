import type { Tool, ToolResult } from "./types";
import type { TaskScheduler } from "../services/taskScheduler";

export function makeSchedulerTools(scheduler: TaskScheduler): Tool[] {
  return [
    {
      name: "schedule_task",
      category: "command",
      description:
        "Bir görevi belirli aralıklarla veya saatte çalışacak şekilde zamanlar. " +
        "schedule formatları: '*/5 * * * *' (her 5 dakika), '09:00' (günlük 09:00), 'once' (bir kez). " +
        "Görev zamanı gelince prompt ajana otomatik gönderilir.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Görev açıklaması (takip için)." },
          schedule: {
            type: "string",
            description: "Zamanlama: '*/N * * * *', 'HH:MM', 'once'.",
          },
          prompt: {
            type: "string",
            description: "Zamanı gelince ajana gönderilecek istem metni.",
          },
        },
        required: ["description", "schedule", "prompt"],
      },
      summarize: (a) => `Zamanla [${a.schedule}]: ${a.description}`,
      async invoke(args): Promise<ToolResult> {
        const desc = String(args.description ?? "").trim();
        const sched = String(args.schedule ?? "once").trim();
        const prompt = String(args.prompt ?? "").trim();
        if (!desc || !prompt) {
          return { ok: false, content: "description ve prompt zorunludur." };
        }
        let task;
        try {
          task = scheduler.add(desc, sched, prompt);
        } catch (e) {
          return { ok: false, content: (e as Error).message };
        }
        const nextTime = new Date(task.nextRun).toLocaleString("tr-TR");
        return {
          ok: true,
          content: `Görev zamanlandı (ID: ${task.id})\nZamanlama: ${sched}\nİlk çalışma: ${nextTime}`,
          detail: task.id,
        };
      },
    },

    {
      name: "list_scheduled_tasks",
      category: "list",
      description: "Aktif zamanlanmış görevleri listeler (ID, zamanlama, sonraki çalışma).",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      summarize: () => "Zamanlanmış görevler",
      async invoke(): Promise<ToolResult> {
        const tasks = scheduler.list();
        if (tasks.length === 0) {
          return {
            ok: true,
            content: "Zamanlanmış görev yok.",
            detail: "0 görev",
          };
        }
        const lines = tasks.map((t) => {
          const next = new Date(t.nextRun).toLocaleString("tr-TR");
          const last = t.lastRun ? `Son: ${new Date(t.lastRun).toLocaleString("tr-TR")}` : "Henüz çalışmadı";
          return `[${t.id}] ${t.description}\n  Zamanlama: ${t.schedule} | Sonraki: ${next} | ${last}`;
        });
        return {
          ok: true,
          content: lines.join("\n\n"),
          detail: `${tasks.length} görev`,
        };
      },
    },

    {
      name: "cancel_task",
      category: "command",
      description: "ID'si verilen zamanlanmış görevi iptal eder.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Görev ID'si (list_scheduled_tasks ile görülür)." },
        },
        required: ["id"],
      },
      summarize: (a) => `Görevi iptal et: ${a.id}`,
      async invoke(args): Promise<ToolResult> {
        const id = String(args.id ?? "").trim();
        const ok = scheduler.cancel(id);
        return ok
          ? { ok: true, content: `Görev iptal edildi: ${id}` }
          : { ok: false, content: `'${id}' ID'li görev bulunamadı.` };
      },
    },
  ];
}
