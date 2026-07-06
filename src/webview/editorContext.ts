import * as vscode from "vscode";
import * as path from "path";

const MAX_MENTION_BYTES = 32 * 1024;

export async function collectContext(
  workspaceRoot: string,
  userText: string
): Promise<string> {
  const parts: string[] = [];

  const active = activeFileContext(workspaceRoot);
  if (active) parts.push(active);

  const mentions = await mentionContext(workspaceRoot, userText);
  if (mentions) parts.push(mentions);

  if (parts.length === 0) return "";
  return `# Bağlam (otomatik)\n${parts.join("\n\n")}\n\n# İstek\n`;
}

function activeFileContext(workspaceRoot: string): string | undefined {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return undefined;
  const rel = relIfInside(workspaceRoot, ed.document.uri.fsPath);
  if (!rel) return undefined;

  const sel = ed.selection;
  if (!sel.isEmpty) {
    const text = ed.document.getText(sel);
    const startLine = sel.start.line + 1;
    const endLine = sel.end.line + 1;
    return (
      `Aktif dosya: ${rel} (seçili satırlar ${startLine}-${endLine}):\n` +
      "```\n" +
      clip(text, 4000) +
      "\n```"
    );
  }
  return `Aktif dosya: ${rel} (imleç satırı ${ed.selection.active.line + 1}).`;
}

async function mentionContext(
  workspaceRoot: string,
  userText: string
): Promise<string | undefined> {
  const mentions = [...userText.matchAll(/@([^\s@]+)/g)].map((m) => m[1]);
  if (mentions.length === 0) return undefined;
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const m of mentions) {
    if (seen.has(m)) continue;
    seen.add(m);
    const abs = path.resolve(workspaceRoot, m);
    if (!relIfInside(workspaceRoot, abs)) continue;
    try {
      const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(abs));
      if (buf.byteLength > MAX_MENTION_BYTES) {
        blocks.push(`@${m}: (dosya çok büyük, atlandı)`);
        continue;
      }
      blocks.push(`@${m}:\n\`\`\`\n${clip(Buffer.from(buf).toString("utf8"), 8000)}\n\`\`\``);
    } catch {
    }
  }
  return blocks.length ? blocks.join("\n\n") : undefined;
}

function relIfInside(root: string, abs: string): string | undefined {
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
  return rel.split(path.sep).join("/");
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "\n… (kırpıldı)" : s;
}
