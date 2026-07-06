import * as fs from "fs";
import type { Tool, ToolResult } from "./types";

const SUPPORTED = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
const MAX_B64 = 4 * 1024 * 1024;

export const describeImageTool: Tool = {
  name: "describe_image",
  category: "read",
  description:
    "Bir resim dosyasını Ollama vision modeliyle okuyup metin açıklaması döndürür. " +
    "llava, qwen2-vl gibi vision destekli bir model seçili olmalıdır. " +
    "Ekran görüntüsü analizi, UI incelemesi, diyagram okuma için kullan.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Resim dosyasının yolu (workspace göreli veya mutlak).",
      },
      prompt: {
        type: "string",
        description: "Modele sorulacak soru (opsiyonel; varsayılan: genel açıklama).",
      },
    },
    required: ["path"],
  },
  summarize: (a) => `Resim: ${a.path}`,
  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.ollamaBaseUrl) {
      return {
        ok: false,
        content: "Vision aracı için Ollama bağlantısı gerekli (ollamaBaseUrl yok).",
      };
    }
    const pathArg = String(args.path ?? "");
    const prompt = String(args.prompt ?? "Bu resimi ayrıntılı olarak açıkla. Ne görüyorsun?");
    let absPath: string;
    try {
      absPath = ctx.resolvePath(pathArg);
    } catch (e) {
      return { ok: false, content: (e as Error).message };
    }
    const ext = absPath.slice(absPath.lastIndexOf(".")).toLowerCase();
    if (!SUPPORTED.has(ext)) {
      return {
        ok: false,
        content: `Desteklenmeyen format: ${ext}. Desteklenenler: ${[...SUPPORTED].join(", ")}`,
      };
    }
    let buf: Buffer;
    try {
      buf = fs.readFileSync(absPath);
    } catch (e) {
      return { ok: false, content: `Dosya okunamadı: ${(e as Error).message}` };
    }
    if (buf.length > MAX_B64) {
      return {
        ok: false,
        content: `Resim çok büyük (${(buf.length / 1024 / 1024).toFixed(1)} MB > 4 MB). Daha küçük bir resim kullanın.`,
      };
    }
    const imageBase64 = buf.toString("base64");

    let model: string;
    try {
      model = await pickVisionModel(ctx.ollamaBaseUrl, ctx.visionModel);
    } catch (e) {
      return { ok: false, content: (e as Error).message };
    }

    try {
      const res = await fetch(`${ctx.ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          images: [imageBase64],
          stream: false,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const hint = body.includes("does not support") || body.includes("multimodal") || body.includes("vision")
          ? ` Model (${model}) görsel desteklemiyor. Ollama'dan qwen2.5vl, llava veya llava-llama3 gibi bir vision modeli indirin.`
          : "";
        return {
          ok: false,
          content: `Ollama vision ${res.status}: ${body.slice(0, 300)}${hint}`,
        };
      }
      const data = (await res.json()) as { response?: string };
      return {
        ok: true,
        content: data.response?.trim() ?? "(boş yanıt)",
        detail: `vision: ${model}`,
      };
    } catch (e) {
      return {
        ok: false,
        content: `Vision API hatası: ${(e as Error).message}`,
      };
    }
  },
};

async function pickVisionModel(baseUrl: string, preferred?: string): Promise<string> {
  type TagModel = { name: string; model?: string; capabilities?: string[] };
  let models: TagModel[] = [];
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (res.ok) {
      const data = (await res.json()) as { models?: TagModel[] };
      models = data.models ?? [];
    }
  } catch {
  }
  const hasVision = (m: TagModel) =>
    Array.isArray(m.capabilities) && m.capabilities.includes("vision");
  const findByName = (name?: string) =>
    name ? models.find((m) => m.name === name || m.model === name) : undefined;

  const pref = findByName(preferred);
  if (preferred && pref && hasVision(pref)) return preferred;
  const vision = models.find(hasVision);
  if (vision) return vision.name;
  if (preferred && !models.some((m) => Array.isArray(m.capabilities))) return preferred;
  throw new Error(
    "Yüklü hiçbir model görsel (vision) desteklemiyor. " +
      "Ollama'dan bir vision modeli indir: `ollama pull qwen2.5vl` (veya llava)."
  );
}
