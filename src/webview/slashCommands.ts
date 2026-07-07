import { exec } from "child_process";

export interface SlashResult {
  prompt: string;
  info?: string;
}

function gitOutput(cmd: string, cwd?: string): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout: 5_000, maxBuffer: 4_000_000 }, (err, stdout) => {
      resolve(err ? "" : stdout.trim());
    });
  });
}

type CommandFn = (arg: string, cwd?: string) => Promise<SlashResult>;

const COMMANDS: Record<string, CommandFn> = {
  test: async () => ({
    prompt:
      "Projenin testlerini çalıştır (uygun test komutunu kendin bul). Başarısız olan " +
      "testleri incele, sebebini bul ve düzelt; sonra testleri tekrar çalıştırıp geçtiğini doğrula.",
  }),

  commit: async (arg, cwd) => {
    const [status, diff] = await Promise.all([
      gitOutput("git status --short", cwd),
      gitOutput("git diff HEAD --stat", cwd),
    ]);
    const ctx =
      status || diff
        ? `\n\n## Mevcut değişiklikler\n\`\`\`\n${status}\n\`\`\`\n\`\`\`\n${diff}\n\`\`\``
        : "";
    return {
      prompt:
        "Değişiklikleri gözden geçir (git status, git diff), mantıklı bir commit mesajı yaz ve " +
        "değişiklikleri stage'leyip commit et." +
        (arg ? ` Ek not: ${arg}` : "") +
        ctx,
    };
  },

  review: async (arg, cwd) => {
    const diff = await gitOutput("git diff HEAD", cwd);
    const ctx = diff
      ? `\n\n## Değişiklikler\n\`\`\`diff\n${diff.slice(0, 3000)}\n\`\`\``
      : "";
    return {
      prompt:
        "Değişiklikleri (git diff) veya aktif dosyayı gözden geçir; hataları, riskleri ve " +
        "iyileştirme fırsatlarını maddeler halinde raporla." +
        (arg ? ` Odak: ${arg}` : "") +
        ctx,
    };
  },

  explain: async (arg) => ({
    prompt: arg
      ? `Şunu açıkla: ${arg}`
      : "Aktif dosyayı (veya seçili kodu) oku ve ne yaptığını sade bir dille açıkla.",
  }),

  fix: async (arg) => ({
    prompt: arg
      ? `Şu sorunu bul ve düzelt: ${arg}`
      : "Aktif dosyadaki hataları/sorunları bul ve düzelt.",
  }),

  help: async () => ({
    prompt: "",
    info:
      "Slash komutları: /test, /commit [not], /review [odak], /explain [konu], /fix [sorun]. " +
      "/commit ve /review git durumunu otomatik ekler. @dosya ile dosya bağlamı ekleyebilirsin.",
  }),
};

export async function expandSlash(text: string, cwd?: string): Promise<SlashResult> {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return { prompt: text };
  const m = /^\/(\w+)\s*([\s\S]*)$/.exec(trimmed);
  if (!m) return { prompt: text };
  const cmd = COMMANDS[m[1].toLowerCase()];
  if (!cmd) return { prompt: text };
  return cmd(m[2].trim(), cwd);
}
