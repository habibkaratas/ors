import * as fs from "fs";
import type { Tool, ToolResult } from "./types";

const MAX_CHARS = 20_000;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

export const readPdfTool: Tool = {
  name: "read_pdf",
  category: "read",
  description:
    "Bir PDF dosyasından metin çıkarır. Basit/düz PDF'lerde çalışır. " +
    "Taranmış veya sıkıştırılmış PDF'lerde metin alınamayabilir. " +
    "Dokümantasyon, rapor, teknik belge okumak için kullan.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "PDF dosya yolu." },
    },
    required: ["path"],
  },
  summarize: (a) => `PDF: ${a.path}`,
  async invoke(args, ctx): Promise<ToolResult> {
    const pathArg = String(args.path ?? "");
    let absPath: string;
    try {
      absPath = ctx.resolvePath(pathArg);
    } catch (e) {
      return { ok: false, content: (e as Error).message };
    }
    if (!absPath.toLowerCase().endsWith(".pdf")) {
      return { ok: false, content: "Dosya .pdf ile bitmelidir." };
    }
    try {
      const st = fs.statSync(absPath);
      if (st.size > MAX_PDF_BYTES) {
        return {
          ok: false,
          content: `PDF çok büyük (${Math.round(st.size / 1048576)} MB > ${MAX_PDF_BYTES / 1048576} MB sınırı).`,
        };
      }
    } catch (e) {
      return { ok: false, content: `Dosya okunamadı: ${(e as Error).message}` };
    }
    let buf: Buffer;
    try {
      buf = fs.readFileSync(absPath);
    } catch (e) {
      return { ok: false, content: `Dosya okunamadı: ${(e as Error).message}` };
    }
    const text = extractPdfText(buf);
    if (!text.trim()) {
      return {
        ok: false,
        content:
          "PDF'den metin çıkarılamadı. " +
          "Dosya taranmış, resim tabanlı veya sıkıştırılmış (FlateDecode) olabilir. " +
          "pdftotext gibi bir araç ile önce TXT'ye dönüştürün.",
      };
    }
    return {
      ok: true,
      content: text.slice(0, MAX_CHARS) + (text.length > MAX_CHARS ? "\n… (kırpıldı)" : ""),
      detail: `${Math.min(text.length, MAX_CHARS)} karakter`,
    };
  },
};

function extractPdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const parts: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let sm: RegExpExecArray | null;
  while ((sm = streamRe.exec(raw))) {
    const stream = sm[1];
    if (
      stream.length > 0 &&
      stream.charCodeAt(0) < 32 &&
      stream.charCodeAt(0) !== 10 &&
      stream.charCodeAt(0) !== 13
    ) {
      continue;
    }
    const tjRe = /\(([^)]*)\)\s*(?:Tj|'|")|(\[[\s\S]*?\])\s*TJ/g;
    let tm: RegExpExecArray | null;
    while ((tm = tjRe.exec(stream))) {
      if (tm[1] !== undefined) {
        parts.push(decodePdfString(tm[1]));
      } else if (tm[2]) {
        const arrRe = /\(([^)]*)\)/g;
        let am: RegExpExecArray | null;
        while ((am = arrRe.exec(tm[2]))) {
          parts.push(decodePdfString(am[1]));
        }
        parts.push(" ");
      }
    }
  }
  return parts
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\\\/g, "\\")
    .replace(/\\([()\\])/g, "$1");
}
