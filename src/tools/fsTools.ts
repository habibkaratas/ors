import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";

import type {
  ApprovalPreview,
  FileChange,
  Tool,
  ToolContext,
  ToolResult,
} from "./types";
import { displayPath } from "./paths";
import { lineDiff, renderDiff } from "./diff";

const MAX_READ_BYTES = 256 * 1024;

export const readFileTool: Tool = {
  name: "read_file",
  category: "read",
  description:
    "Workspace içindeki bir dosyanın içeriğini okur. Büyük dosyalar için offset/limit ile satır aralığı verilebilir.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace köküne göre dosya yolu." },
      offset: { type: "number", description: "Başlangıç satırı (1-tabanlı, opsiyonel)." },
      limit: { type: "number", description: "Okunacak satır sayısı (opsiyonel)." },
    },
    required: ["path"],
  },
  summarize: (a) => `Okunuyor: ${a.path}`,
  async invoke(args, ctx): Promise<ToolResult> {
    const abs = ctx.resolvePath(String(args.path));
    let stat: fsSync.Stats;
    try {
      stat = await fs.stat(abs);
    } catch {
      return { ok: false, content: `Dosya bulunamadı: ${args.path}` };
    }
    if (stat.isDirectory()) {
      return { ok: false, content: `${args.path} bir dizin, dosya değil. list_dir kullan.` };
    }
    if (stat.size > MAX_READ_BYTES) {
      return {
        ok: false,
        content: `Dosya çok büyük (${Math.round(stat.size / 1024)} KB). offset/limit ile aralık oku.`,
      };
    }
    const buf = await fs.readFile(abs);
    if (buf.includes(0x00)) {
      return {
        ok: false,
        content: `'${args.path}' ikili (binary) dosya — metin olarak okunamaz. Boyut: ${Math.round(stat.size / 1024)} KB.`,
        detail: "ikili dosya",
      };
    }
    const raw = buf.toString("utf8");
    if (raw.includes("�")) {
      return {
        ok: false,
        content: `'${args.path}' geçerli UTF-8 metin değil — şifreli veya binary içerik. Boyut: ${Math.round(stat.size / 1024)} KB.`,
        detail: "ikili dosya",
      };
    }
    const lines = raw.split("\n");
    const offset = typeof args.offset === "number" ? Math.max(1, args.offset) : 1;
    const limit = typeof args.limit === "number" ? args.limit : lines.length;
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const numbered = slice
      .map((l, i) => `${String(offset + i).padStart(5)}\t${l}`)
      .join("\n");
    return {
      ok: true,
      content: numbered || "(boş dosya)",
      detail: `${slice.length} satır`,
    };
  },
};

export const writeFileTool: Tool = {
  name: "write_file",
  category: "write",
  description:
    "Bir dosyayı verilen içerikle oluşturur veya tamamen üzerine yazar. Var olan dosyayı değiştirmek için genelde edit_file tercih edilir.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace köküne göre dosya yolu." },
      content: { type: "string", description: "Dosyaya yazılacak tam içerik." },
    },
    required: ["path", "content"],
  },
  summarize: (a) => `Yazılıyor: ${a.path}`,
  async preview(args, ctx): Promise<ApprovalPreview> {
    const ch = await computeWriteChange(args, ctx);
    return {
      title: `${ch.original === null ? "Yeni dosya" : "Üzerine yaz"}: ${displayPath(
        ctx.workspaceRoot,
        ch.absPath
      )}`,
      kind: "diff",
      text: renderDiff(lineDiff(ch.original ?? "", ch.proposed)),
    };
  },
  previewChange: computeWriteChange,
  async invoke(args, ctx): Promise<ToolResult> {
    const ch = await computeWriteChange(args, ctx);
    ctx.recordCheckpoint?.(ch.absPath, ch.original);
    await fs.mkdir(path.dirname(ch.absPath), { recursive: true });
    await fs.writeFile(ch.absPath, ch.proposed, "utf8");
    const lines = ch.proposed.split("\n").length;
    return {
      ok: true,
      content: `Yazıldı: ${args.path} (${lines} satır).`,
      detail: `${lines} satır yazıldı`,
    };
  },
};

export const editFileTool: Tool = {
  name: "edit_file",
  category: "write",
  description:
    "Bir dosyada old_string metnini new_string ile değiştirir. old_string dosyada BİREBİR ve TEK olmalıdır; değiştirilecek yeri benzersiz kılmaya yetecek kadar bağlam (çevre satırlar) içermelidir. Satır numarası KULLANMA. " +
    "Alternatif: tüm dosyayı değiştirmek istiyorsan old_string/new_string yerine content ver (dosyanın tamamı yeni içerikle değişir).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace köküne göre dosya yolu." },
      old_string: { type: "string", description: "Değiştirilecek mevcut metin (benzersiz, bağlamlı)." },
      new_string: { type: "string", description: "Yerine yazılacak yeni metin." },
      content: { type: "string", description: "Alternatif: dosyanın TAMAMI için yeni içerik (old_string/new_string yerine)." },
    },
    required: ["path"],
  },
  summarize: (a) => `Düzenleniyor: ${a.path}`,
  async preview(args, ctx): Promise<ApprovalPreview> {
    const ch = await computeEditChange(args, ctx);
    return {
      title: `Düzenle: ${displayPath(ctx.workspaceRoot, ch.absPath)}`,
      kind: "diff",
      text: renderDiff(lineDiff(ch.original ?? "", ch.proposed)),
    };
  },
  previewChange: computeEditChange,
  async invoke(args, ctx): Promise<ToolResult> {
    let ch: FileChange;
    try {
      ch = await computeEditChange(args, ctx);
    } catch (e) {
      return { ok: false, content: (e as Error).message };
    }
    ctx.recordCheckpoint?.(ch.absPath, ch.original);
    await fs.writeFile(ch.absPath, ch.proposed, "utf8");
    return { ok: true, content: `Düzenlendi: ${args.path}.`, detail: "1 değişiklik uygulandı" };
  },
};

export const listDirTool: Tool = {
  name: "list_dir",
  category: "list",
  description: "Bir dizinin içeriğini (dosya/klasör) listeler.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace köküne göre dizin yolu (varsayılan: kök '.')." },
    },
  },
  summarize: (a) => `Listeleniyor: ${a.path ?? "."}`,
  async invoke(args, ctx): Promise<ToolResult> {
    const rel = args.path ? String(args.path) : ".";
    const abs = ctx.resolvePath(rel);
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return { ok: false, content: `Dizin bulunamadı: ${rel}` };
    }
    const ignore = new Set([".git", "node_modules", ".vscode-test", "out", "dist"]);
    const listed = entries
      .filter((e) => !ignore.has(e.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    return {
      ok: true,
      content: listed.length ? listed.join("\n") : "(boş dizin)",
      detail: `${listed.length} öğe`,
    };
  },
};

async function computeWriteChange(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<FileChange> {
  const abs = ctx.resolvePath(String(args.path));
  const proposed = String(args.content ?? "");
  let original: string | null = null;
  try {
    original = await fs.readFile(abs, "utf8");
  } catch {
    original = null;
  }
  return { absPath: abs, original, proposed };
}

async function computeEditChange(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<FileChange> {
  const abs = ctx.resolvePath(String(args.path));
  let original: string;
  try {
    original = await fs.readFile(abs, "utf8");
  } catch {
    throw new Error(`Dosya bulunamadı: ${args.path}`);
  }
  const oldString = typeof args.old_string === "string" ? args.old_string : "";
  const newString = typeof args.new_string === "string" ? args.new_string : null;

  if (oldString !== "" && newString !== null) {
    const match = findMatch(original, oldString);
    if (!match) {
      throw new Error(
        "old_string dosyada bulunamadı. Dosyayı read_file ile tekrar oku ve metni birebir (girinti dahil) kopyala."
      );
    }
    if (match.count > 1) {
      throw new Error(
        `old_string dosyada ${match.count} kez geçiyor; benzersiz değil. Daha fazla çevre satır ekleyerek tek eşleşme sağla.`
      );
    }
    const proposed =
      original.slice(0, match.index) +
      newString +
      original.slice(match.index + match.matched.length);
    return { absPath: abs, original, proposed };
  }

  const full = firstString(args.content, args.new_content, args.full_content, args.text);
  if (full !== undefined) {
    return { absPath: abs, original, proposed: full };
  }

  if (oldString === "") {
    throw new Error(
      "edit_file: değiştirilecek metni old_string ile ver (yerine new_string). " +
        "Tüm dosyayı değiştireceksen content ver ya da write_file kullan."
    );
  }
  throw new Error("edit_file: new_string gerekli (old_string'in yerine yazılacak metin).");
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === "string") return v;
  return undefined;
}

function stripLineNumberGutter(text: string): string {
  const gutter = /^\s*\d+(?:\t| {1,2})/;
  const lines = text.split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0 || !nonEmpty.every((l) => gutter.test(l))) {
    return text;
  }
  return lines.map((l) => l.replace(gutter, "")).join("\n");
}

function findMatch(
  haystack: string,
  rawNeedle: string
): { index: number; matched: string; count: number } | null {
  const needle = stripLineNumberGutter(rawNeedle);

  const first = haystack.indexOf(needle);
  if (first >= 0) {
    let count = 0;
    let idx = first;
    while (idx >= 0) {
      count++;
      idx = haystack.indexOf(needle, idx + 1);
    }
    return { index: first, matched: needle, count };
  }
  const normLine = (s: string) => s.replace(/[ \t]+$/gm, "");
  const hNorm = normLine(haystack);
  const nNorm = normLine(needle);
  const ni = hNorm.indexOf(nNorm);
  if (ni < 0) {
    return null;
  }
  const startsAtLine = ni === 0 || hNorm[ni - 1] === "\n";
  const endsAtLine = ni + nNorm.length === hNorm.length || hNorm[ni + nNorm.length] === "\n";
  if (!startsAtLine || !endsAtLine) {
    return null;
  }
  let count = 0;
  let idx = ni;
  while (idx >= 0) {
    count++;
    idx = hNorm.indexOf(nNorm, idx + 1);
  }
  const before = hNorm.slice(0, ni);
  const startLine = before.split("\n").length - 1;
  const needleLines = nNorm.split("\n").length;
  const origLines = haystack.split("\n");
  const matched = origLines.slice(startLine, startLine + needleLines).join("\n");
  const index =
    origLines.slice(0, startLine).join("\n").length + (startLine > 0 ? 1 : 0);
  return { index, matched, count };
}
