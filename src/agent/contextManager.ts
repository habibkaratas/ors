import type { ChatMessage } from "../llm/types";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 128) {
      tokens += 0.25;
    } else if (c < 0x500) {
      tokens += 0.38;
    } else if (c < 0x3000) {
      tokens += 0.7;
    } else {
      tokens += 1.0;
    }
  }
  return Math.ceil(tokens * 1.15) + 4;
}

const IMAGE_TOKEN_ESTIMATE = 1200;

function messageTokens(m: ChatMessage): number {
  let t = estimateTokens(m.content);
  if (m.tool_calls?.length) {
    t += estimateTokens(JSON.stringify(m.tool_calls));
  }
  if (m.images?.length) {
    t += m.images.length * IMAGE_TOKEN_ESTIMATE;
  }
  return t + 8;
}

export interface FitResult {
  kept: ChatMessage[];
  droppedCount: number;
}

const RECENT_TOOL_FULL = 4;
const OLD_TOOL_HEAD = 600;
const OLD_TOOL_TAIL = 300;

export function compressToolResults(history: ChatMessage[]): ChatMessage[] {
  const toolIdx: number[] = [];
  for (let i = 0; i < history.length; i++) {
    if (history[i].role === "tool") toolIdx.push(i);
  }
  const keepFull = new Set(toolIdx.slice(-RECENT_TOOL_FULL));
  const limit = OLD_TOOL_HEAD + OLD_TOOL_TAIL + 40;
  return history.map((m, i) => {
    if (m.role !== "tool" || keepFull.has(i) || m.content.length <= limit) return m;
    const head = m.content.slice(0, OLD_TOOL_HEAD);
    const tail = m.content.slice(-OLD_TOOL_TAIL);
    return {
      ...m,
      content: `${head}\n…[${m.content.length} karakterlik araç çıktısı kısaltıldı]…\n${tail}`,
    };
  });
}

export function fitHistory(history: ChatMessage[], budgetTokens: number): FitResult {
  const kept: ChatMessage[] = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = messageTokens(history[i]);
    if (kept.length > 0 && total + t > budgetTokens) break;
    kept.unshift(history[i]);
    total += t;
  }
  while (kept.length > 0 && kept[0].role === "tool") {
    kept.shift();
  }
  return { kept, droppedCount: history.length - kept.length };
}

export function buildSummaryPrompt(
  existingSummary: string,
  dropped: ChatMessage[]
): ChatMessage[] {
  const transcript = dropped
    .map((m) => {
      if (m.role === "tool") return `[araç sonucu] ${truncate(m.content, 500)}`;
      if (m.role === "assistant" && m.tool_calls?.length) {
        const names = m.tool_calls.map((c) => c.name).join(", ");
        return `[asistan araç çağrısı: ${names}] ${truncate(m.content, 300)}`;
      }
      return `[${m.role}] ${truncate(m.content, 800)}`;
    })
    .join("\n");
  const sys: ChatMessage = {
    role: "system",
    content:
      "Bir kodlama oturumunun eski kısmını özetliyorsun. Mevcut özet ve yeni mesajları " +
      "birleştirip TEK, kısa (en fazla ~200 kelime) ama bilgi-koruyan bir özet üret: " +
      "hangi dosyalara dokunuldu, alınan kararlar, tamamlanan/bekleyen işler, önemli bulgular. " +
      "Sadece özeti yaz.",
  };
  const usr: ChatMessage = {
    role: "user",
    content:
      (existingSummary ? `Mevcut özet:\n${existingSummary}\n\n` : "") +
      `Yeni mesajlar:\n${transcript}`,
  };
  return [sys, usr];
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
