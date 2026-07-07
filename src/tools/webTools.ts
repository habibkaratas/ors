import { lookup } from "dns/promises";
import type { Tool, ToolResult } from "./types";

const MAX_TEXT = 12_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function isPrivateIp(ip: string): boolean {
  const low = ip.toLowerCase();
  const v4 = low.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("fe80")) return true;
  if (low.startsWith("fc") || low.startsWith("fd")) return true;
  if (low.startsWith("::ffff:")) return isPrivateIp(low.slice(7));
  return false;
}

function looksLikeIp(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

async function assertPublicUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Geçersiz URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Yalnızca http(s) desteklenir.");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("SSRF engellendi: localhost hedefi.");
  }
  if (looksLikeIp(host)) {
    if (isPrivateIp(host)) {
      throw new Error(`SSRF engellendi: özel/iç ağ adresi (${host}).`);
    }
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`Ad çözümlenemedi: ${host}`);
  }
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new Error(`SSRF engellendi: ${host} özel adrese çözümleniyor (${a.address}).`);
    }
  }
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, MAX_BYTES);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= MAX_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

export const webFetchTool: Tool = {
  name: "web_fetch",
  category: "search",
  description:
    "Verilen URL'nin içeriğini indirir ve okunabilir metne çevirir (HTML temizlenir). Dokümantasyon, API referansı, sayfa içeriği okumak için kullan.",
  parameters: {
    type: "object",
    properties: { url: { type: "string", description: "Çekilecek tam URL (http/https)." } },
    required: ["url"],
  },
  summarize: (a) => `Çekiliyor: ${a.url}`,
  async invoke(args, _ctx, token): Promise<ToolResult> {
    const url = String(args.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, content: "Geçerli bir http(s) URL ver." };
    }
    const controller = new AbortController();
    const sub = token.onCancellationRequested(() => controller.abort());
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      let current = url;
      let res: Response | null = null;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertPublicUrl(current);
        const r = await fetch(current, {
          signal: controller.signal,
          redirect: "manual",
          headers: { "User-Agent": "Mozilla/5.0 (Ors VSCode agent)" },
        });
        if (r.status >= 300 && r.status < 400) {
          const loc = r.headers.get("location");
          if (!loc) {
            res = r;
            break;
          }
          if (hop === MAX_REDIRECTS) {
            return { ok: false, content: "Çok fazla yönlendirme." };
          }
          current = new URL(loc, current).toString();
          continue;
        }
        res = r;
        break;
      }
      if (!res) return { ok: false, content: "Yanıt alınamadı." };
      if (!res.ok) return { ok: false, content: `HTTP ${res.status} — ${current}` };
      const ctype = res.headers.get("content-type") ?? "";
      const body = await readCapped(res);
      const text = ctype.includes("html") ? htmlToText(body) : body;
      return {
        ok: true,
        content: text.slice(0, MAX_TEXT) + (text.length > MAX_TEXT ? "\n… (kırpıldı)" : ""),
        detail: `${Math.min(text.length, MAX_TEXT)} karakter`,
      };
    } catch (e) {
      return { ok: false, content: `Çekme hatası: ${(e as Error).message}` };
    } finally {
      clearTimeout(timer);
      sub.dispose();
    }
  },
};

export const webSearchTool: Tool = {
  name: "web_search",
  category: "search",
  description:
    "İnternette arama yapar (DuckDuckGo). Başlık, URL ve kısa özet listesi döndürür. Güncel bilgi, hata çözümü, dokümantasyon bulmak için kullan; sonra web_fetch ile detay oku.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "Arama sorgusu." } },
    required: ["query"],
  },
  summarize: (a) => `Web araması: ${a.query}`,
  async invoke(args, _ctx, token): Promise<ToolResult> {
    const query = String(args.query ?? "").trim();
    if (!query) return { ok: false, content: "Boş sorgu." };
    const controller = new AbortController();
    const sub = token.onCancellationRequested(() => controller.abort());
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch("https://html.duckduckgo.com/html/", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Ors VSCode agent)",
        },
        body: `q=${encodeURIComponent(query)}`,
      });
      if (!res.ok) return { ok: false, content: `Arama HTTP ${res.status}` };
      const html = await res.text();
      const results = parseDdgResults(html);
      if (results.length === 0) {
        return { ok: true, content: "Sonuç bulunamadı.", detail: "0 sonuç" };
      }
      const text = results
        .slice(0, 8)
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join("\n\n");
      return { ok: true, content: text, detail: `${results.length} sonuç` };
    } catch (e) {
      return { ok: false, content: `Arama hatası: ${(e as Error).message}` };
    } finally {
      clearTimeout(timer);
      sub.dispose();
    }
  },
};

function parseDdgResults(html: string): { title: string; url: string; snippet: string }[] {
  const out: { title: string; url: string; snippet: string }[] = [];
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html))) snippets.push(stripTags(sm[1]));
  let lm: RegExpExecArray | null;
  let i = 0;
  while ((lm = linkRe.exec(html))) {
    out.push({
      title: stripTags(lm[2]),
      url: decodeDdgUrl(lm[1]),
      snippet: snippets[i] ?? "",
    });
    i++;
  }
  return out;
}

function decodeDdgUrl(href: string): string {
  const m = /[?&]uddg=([^&]+)/.exec(href);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
    }
  }
  return href.startsWith("//") ? "https:" + href : href;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
