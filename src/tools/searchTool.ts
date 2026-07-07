import * as fs from "fs/promises";
import * as path from "path";
import type { Tool, ToolContext, ToolResult } from "./types";
import { displayPath } from "./paths";
import { IGNORE_DIRS } from "./ignore";

const MAX_MATCHES = 200;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_LINE_LEN = 5000;
const NUL = String.fromCharCode(0);

export const searchTool: Tool = {
  name: "search",
  category: "search",
  description:
    "Workspace içindeki dosyalarda regex (JavaScript regex) ile metin arar. İsteğe bağlı path ile alt dizine, include ile dosya uzantısına (ör. '.ts') daraltılır. Kod tabanında bir şey bulmanın en hızlı yoludur.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Aranacak JavaScript regex deseni." },
      path: { type: "string", description: "Alt dizine daralt (opsiyonel, varsayılan kök)." },
      include: {
        type: "string",
        description: "Sadece bu uzantı/sonek ile biten dosyalar (ör. '.ts', '.py'). Opsiyonel.",
      },
    },
    required: ["pattern"],
  },
  summarize: (a) => `Aranıyor: /${a.pattern}/`,
  async invoke(args, ctx, token): Promise<ToolResult> {
    let regex: RegExp;
    try {
      regex = new RegExp(String(args.pattern), "g");
    } catch (e) {
      return { ok: false, content: `Geçersiz regex: ${(e as Error).message}` };
    }
    const root = ctx.resolvePath(args.path ? String(args.path) : ".");
    const include = args.include ? String(args.include) : undefined;

    const matches: string[] = [];
    let scanned = 0;

    const walk = async (dir: string): Promise<void> => {
      if (matches.length >= MAX_MATCHES || token.isCancellationRequested) return;
      let entries: import("fs").Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (matches.length >= MAX_MATCHES || token.isCancellationRequested) return;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!IGNORE_DIRS.has(e.name)) await walk(full);
          continue;
        }
        if (include && !e.name.endsWith(include)) continue;
        let stat;
        try {
          stat = await fs.stat(full);
        } catch {
          continue;
        }
        if (stat.size > MAX_FILE_BYTES) continue;
        scanned++;
        let text: string;
        try {
          text = await fs.readFile(full, "utf8");
        } catch {
          continue;
        }
        if (text.includes(NUL)) continue;
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if ((i & 0x3ff) === 0 && token.isCancellationRequested) return;
          const line = lines[i].length > MAX_LINE_LEN ? lines[i].slice(0, MAX_LINE_LEN) : lines[i];
          regex.lastIndex = 0;
          if (regex.test(line)) {
            const rel = displayPath(ctx.workspaceRoot, full);
            matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
            if (matches.length >= MAX_MATCHES) break;
          }
        }
      }
    };

    await walk(root);

    if (matches.length === 0) {
      return { ok: true, content: `Eşleşme yok (${scanned} dosya tarandı).`, detail: "0 eşleşme" };
    }
    const capped = matches.length >= MAX_MATCHES ? `\n… (ilk ${MAX_MATCHES} eşleşme)` : "";
    return {
      ok: true,
      content: matches.join("\n") + capped,
      detail: `${matches.length} eşleşme`,
    };
  },
};
