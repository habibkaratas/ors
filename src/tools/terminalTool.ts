import type { Tool, ToolResult } from "./types";

export const runInTerminalTool: Tool = {
  name: "run_in_terminal",
  category: "command",
  description:
    "Komutu VSCode'un entegre terminalinde GÖRÜNÜR şekilde çalıştırır. " +
    "Kullanıcının görmesi gereken uzun süreli işler için kullan (npm install, docker build, vb.). " +
    "Komut çıktısını yakalamanız gerekiyorsa run_command kullanın.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Çalıştırılacak komut." },
      name: {
        type: "string",
        description: "Terminal pencere adı (opsiyonel; varsayılan: 'Örs').",
      },
    },
    required: ["command"],
  },
  summarize: (a) => `Terminal: ${a.command}`,
  preview: async (args) => ({
    title: `Terminalde çalıştır`,
    kind: "command" as const,
    text: String(args.command ?? ""),
  }),
  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.runInTerminal) {
      return { ok: false, content: "Terminal API bu ortamda mevcut değil." };
    }
    const command = String(args.command ?? "").trim();
    if (!command) return { ok: false, content: "Komut boş." };
    const name = args.name ? String(args.name) : undefined;
    ctx.runInTerminal(command, name);
    return {
      ok: true,
      content: `Komut terminale gönderildi: ${command}`,
      detail: "terminal",
    };
  },
};
