import * as fs from "fs/promises";
import * as path from "path";
import type { Tool, ToolContext, ToolResult } from "./types";
import { displayPath } from "./paths";
import { IGNORE_DIRS } from "./ignore";

const MAX_RESULTS = 300;

export const globTool: Tool = {
  name: "glob",
  category: "search",
  description:
    "Dosya adı/yol deseniyle (glob) dosya bulur. Örn: '**/*.ts', 'src/**/test_*.py', '*.json'. İçerik değil, dosya adı araması yapar.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob deseni (** = her derinlik, * = segment, ? = tek karakter)." },
      path: { type: "string", description: "Arama kökü (opsiyonel, varsayılan workspace kökü)." },
    },
    required: ["pattern"],
  },
  summarize: (a) => `Bulunuyor: ${a.pattern}`,
  async invoke(args, ctx, token): Promise<ToolResult> {
    const root = ctx.resolvePath(args.path ? String(args.path) : ".");
    const re = globToRegExp(String(args.pattern));
    const results: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      if (results.length >= MAX_RESULTS || token.isCancellationRequested) return;
      let entries: import("fs").Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (results.length >= MAX_RESULTS || token.isCancellationRequested) return;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!IGNORE_DIRS.has(e.name)) await walk(full);
          continue;
        }
        const rel = displayPath(ctx.workspaceRoot, full);
        if (re.test(rel)) results.push(rel);
      }
    };

    await walk(root);
    if (results.length === 0) {
      return { ok: true, content: "Eşleşen dosya yok.", detail: "0 dosya" };
    }
    results.sort();
    const capped = results.length >= MAX_RESULTS ? `\n… (ilk ${MAX_RESULTS})` : "";
    return { ok: true, content: results.join("\n") + capped, detail: `${results.length} dosya` };
  },
};

function globToRegExp(glob: string): RegExp {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  re += "$";
  return new RegExp(re);
}
