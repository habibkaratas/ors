import type { Tool, ToolResult } from "./types";

function fmtLocation(loc: unknown): string {
  const l = loc as {
    uri?: { fsPath?: string; path?: string };
    range?: { start?: { line?: number; character?: number } };
  };
  const file = l?.uri?.fsPath ?? l?.uri?.path ?? "(bilinmeyen)";
  const line = (l?.range?.start?.line ?? 0) + 1;
  const char = (l?.range?.start?.character ?? 0) + 1;
  return `${file}:${line}:${char}`;
}

export const lspGoToDefinitionTool: Tool = {
  name: "lsp_go_to_definition",
  category: "read",
  description:
    "Verilen dosya+konumdaki sembolün tanımına (definition) gider ve konumu döner. " +
    "TypeScript/JavaScript, Python, Rust vb. diller için çalışır; " +
    "ilgili dil sunucusunun yüklü olması gerekir.",
  parameters: {
    type: "object",
    properties: {
      path:      { type: "string", description: "Sembolün bulunduğu dosya yolu." },
      line:      { type: "number", description: "Satır numarası (1-tabanlı)." },
      character: { type: "number", description: "Sütun numarası (1-tabanlı)." },
    },
    required: ["path", "line", "character"],
  },
  summarize: (a) => `Tanıma git: ${a.path}:${a.line}:${a.character}`,

  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.lspExecute) {
      return { ok: false, content: "LSP bu ortamda desteklenmiyor." };
    }
    try {
      const absPath = ctx.resolvePath(String(args.path));
      const line = Math.max(0, Number(args.line ?? 1) - 1);
      const character = Math.max(0, Number(args.character ?? 1) - 1);
      const locs = (await ctx.lspExecute(
        "vscode.executeDefinitionProvider",
        absPath,
        line,
        character
      )) as unknown[];
      if (!Array.isArray(locs) || locs.length === 0) {
        return { ok: true, content: "Tanım bulunamadı.", detail: "0 sonuç" };
      }
      const lines = locs.map(fmtLocation);
      return { ok: true, content: lines.join("\n"), detail: `${lines.length} sonuç` };
    } catch (e) {
      return { ok: false, content: `LSP hatası: ${(e as Error).message}` };
    }
  },
};

export const lspFindReferencesTool: Tool = {
  name: "lsp_find_references",
  category: "read",
  description:
    "Verilen konumdaki sembolün proje genelindeki tüm kullanım yerlerini (referansları) bulur. " +
    "Refactoring yapmadan önce etki alanını anlamak için kullan.",
  parameters: {
    type: "object",
    properties: {
      path:      { type: "string", description: "Sembolün bulunduğu dosya yolu." },
      line:      { type: "number", description: "Satır numarası (1-tabanlı)." },
      character: { type: "number", description: "Sütun numarası (1-tabanlı)." },
    },
    required: ["path", "line", "character"],
  },
  summarize: (a) => `Referansları bul: ${a.path}:${a.line}:${a.character}`,

  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.lspExecute) {
      return { ok: false, content: "LSP bu ortamda desteklenmiyor." };
    }
    try {
      const absPath = ctx.resolvePath(String(args.path));
      const line = Math.max(0, Number(args.line ?? 1) - 1);
      const character = Math.max(0, Number(args.character ?? 1) - 1);
      const locs = (await ctx.lspExecute(
        "vscode.executeReferenceProvider",
        absPath,
        line,
        character
      )) as unknown[];
      if (!Array.isArray(locs) || locs.length === 0) {
        return { ok: true, content: "Referans bulunamadı.", detail: "0 referans" };
      }
      const lines = locs.map(fmtLocation);
      return { ok: true, content: lines.join("\n"), detail: `${lines.length} referans` };
    } catch (e) {
      return { ok: false, content: `LSP hatası: ${(e as Error).message}` };
    }
  },
};

export const lspHoverTool: Tool = {
  name: "lsp_hover",
  category: "read",
  description:
    "Bir konumdaki sembolün hover bilgisini (tip tanımı, JSDoc/belgeleme) döner. " +
    "TypeScript tip bilgisi, fonksiyon imzası, yorum açıklamaları için kullan.",
  parameters: {
    type: "object",
    properties: {
      path:      { type: "string", description: "Dosya yolu." },
      line:      { type: "number", description: "Satır numarası (1-tabanlı)." },
      character: { type: "number", description: "Sütun numarası (1-tabanlı)." },
    },
    required: ["path", "line", "character"],
  },
  summarize: (a) => `Hover: ${a.path}:${a.line}:${a.character}`,

  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.lspExecute) {
      return { ok: false, content: "LSP bu ortamda desteklenmiyor." };
    }
    try {
      const absPath = ctx.resolvePath(String(args.path));
      const line = Math.max(0, Number(args.line ?? 1) - 1);
      const character = Math.max(0, Number(args.character ?? 1) - 1);
      const result = (await ctx.lspExecute(
        "vscode.executeHoverProvider",
        absPath,
        line,
        character
      )) as unknown[];
      if (!Array.isArray(result) || result.length === 0) {
        return { ok: true, content: "Hover bilgisi yok.", detail: "boş" };
      }
      const texts: string[] = [];
      for (const h of result as { contents?: { value?: string; language?: string }[] }[]) {
        for (const c of h.contents ?? []) {
          if (c.value) texts.push(c.value);
        }
      }
      const content = texts.join("\n---\n") || "(içerik yok)";
      return { ok: true, content, detail: `${texts.length} öğe` };
    } catch (e) {
      return { ok: false, content: `LSP hatası: ${(e as Error).message}` };
    }
  },
};

export const lspRenameSymbolTool: Tool = {
  name: "lsp_rename_symbol",
  category: "write",
  description:
    "Verilen konumdaki sembolü proje genelinde atomik olarak yeniden adlandırır. " +
    "Kullanıcı onayı gerektirir. Tüm referanslar dil sunucusu tarafından güncellenir. " +
    "Önce lsp_find_references ile etki alanını doğrulamak iyi pratiktir.",
  parameters: {
    type: "object",
    properties: {
      path:      { type: "string", description: "Sembolün bulunduğu dosya yolu." },
      line:      { type: "number", description: "Satır numarası (1-tabanlı)." },
      character: { type: "number", description: "Sütun numarası (1-tabanlı)." },
      new_name:  { type: "string", description: "Sembolün yeni adı." },
    },
    required: ["path", "line", "character", "new_name"],
  },
  summarize: (a) =>
    `Yeniden adlandır → '${a.new_name}' (${a.path}:${a.line}:${a.character})`,

  preview: async (args) => ({
    title: `Sembolü yeniden adlandır → '${args.new_name}'`,
    kind: "text" as const,
    text:
      `Dosya  : ${args.path}\n` +
      `Konum  : satır ${args.line}, sütun ${args.character}\n` +
      `Yeni ad: ${args.new_name}\n\n` +
      "Tüm referanslar dil sunucusu tarafından atomik olarak güncellenecek.",
  }),

  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.lspApplyRename) {
      return { ok: false, content: "LSP rename bu ortamda desteklenmiyor." };
    }
    const newName = String(args.new_name ?? "").trim();
    if (!newName) return { ok: false, content: "new_name zorunludur." };
    try {
      const absPath = ctx.resolvePath(String(args.path));
      const line = Math.max(0, Number(args.line ?? 1) - 1);
      const character = Math.max(0, Number(args.character ?? 1) - 1);
      const result = await ctx.lspApplyRename(absPath, line, character, newName);
      return { ok: true, content: result };
    } catch (e) {
      return { ok: false, content: `LSP rename hatası: ${(e as Error).message}` };
    }
  },
};
