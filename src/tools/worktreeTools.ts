import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import { buildSafeEnv } from "./safeEnv";
import type { Tool, ToolResult } from "./types";

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile(
      "git",
      args,
      { cwd, env: buildSafeEnv(), timeout: 30_000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message).trim()));
        else resolve(stdout.trim());
      }
    );
  });
}

export const enterWorktreeTool: Tool = {
  name: "enter_worktree",
  category: "command",
  description:
    "Mevcut HEAD'den yeni bir git worktree oluşturur ve çalışma dizinini ona yönlendirir. " +
    "Deney/özellik geliştirme için ana workspace'i bozmadan izole bir alan sağlar. " +
    "Git deposu olan dizinlerde çalışır.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Worktree adı (ör. 'feature-auth'). Verilmezse 'wt-<zaman damgası>' kullanılır.",
      },
    },
    required: [],
  },
  summarize: (a) => `Worktree oluştur: ${a.name ?? "otomatik"}`,

  preview: async (args, ctx) => {
    const name = String(args.name ?? `wt-<timestamp>`).replace(/[^\w-]/g, "_");
    return {
      title: "Git worktree oluştur",
      kind: "command" as const,
      text: `git worktree add .ors/worktrees/${name} HEAD\ncwd: ${ctx.workspaceRoot}`,
    };
  },

  async invoke(args, ctx): Promise<ToolResult> {
    const name = String(args.name ?? `wt-${Date.now()}`).replace(/[^\w-]/g, "_");
    const worktreeDir = path.join(ctx.workspaceRoot, ".ors", "worktrees", name);

    try {
      fs.mkdirSync(path.join(ctx.workspaceRoot, ".ors", "worktrees"), { recursive: true });
      await runGit(["worktree", "add", worktreeDir, "HEAD"], ctx.workspaceRoot);
      ctx.setWorktreeRoot?.(worktreeDir);
      return {
        ok: true,
        content:
          `Worktree oluşturuldu: ${worktreeDir}\n` +
          "Çalışma dizini bu worktree'ye yönlendirildi. " +
          "Bitince exit_worktree aracını çağır.",
        detail: worktreeDir,
      };
    } catch (e) {
      return { ok: false, content: `Worktree oluşturulamadı: ${(e as Error).message}` };
    }
  },
};

export const exitWorktreeTool: Tool = {
  name: "exit_worktree",
  category: "command",
  description:
    "Aktif worktree'den çıkıp orijinal workspace'e döner. " +
    "remove=true verilirse worktree dizini de silinir (git worktree remove --force).",
  parameters: {
    type: "object",
    properties: {
      worktree_path: {
        type: "string",
        description: "Worktree'nin mutlak dizin yolu (enter_worktree çıktısından al).",
      },
      remove: {
        type: "boolean",
        description: "true = worktree'yi sil (varsayılan: false).",
      },
    },
    required: ["worktree_path"],
  },
  summarize: (a) => `Worktree'den çık${a.remove ? " (sil)" : ""}: ${a.worktree_path}`,

  preview: async (args) => ({
    title: "Git worktree'den çık",
    kind: "command" as const,
    text: args.remove
      ? `git worktree remove --force ${args.worktree_path}`
      : `Orijinal workspace'e dön — worktree korunur\n(${args.worktree_path})`,
  }),

  async invoke(args, ctx): Promise<ToolResult> {
    const worktreePath = String(args.worktree_path ?? "").trim();
    if (!worktreePath) return { ok: false, content: "worktree_path zorunludur." };

    if (args.remove) {
      const wtRoot = path.resolve(ctx.workspaceRoot, ".ors", "worktrees");
      const resolved = path.resolve(worktreePath);
      const relToWt = path.relative(wtRoot, resolved);
      if (relToWt === "" || relToWt.startsWith("..") || path.isAbsolute(relToWt)) {
        return {
          ok: false,
          content:
            "Güvenlik: worktree_path .ors/worktrees altında bir dizin olmalı. " +
            "Silme reddedildi.",
        };
      }
      const mainRoot = path.resolve(resolved, "../../..");
      try {
        await runGit(["worktree", "remove", "--force", resolved], mainRoot);
      } catch {
      }
      await fsp.rm(resolved, { recursive: true, force: true }).catch(() => {});
      ctx.setWorktreeRoot?.(null);
      return {
        ok: true,
        content: `Orijinal workspace'e dönüldü. Worktree silindi: ${worktreePath}`,
      };
    }

    ctx.setWorktreeRoot?.(null);
    return {
      ok: true,
      content: `Orijinal workspace'e dönüldü. Worktree korundu: ${worktreePath}`,
    };
  },
};
