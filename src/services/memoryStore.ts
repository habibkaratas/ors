import type { Memento } from "vscode";

const KEY = "ors.memories";
const MAX_ITEMS = 200;

export class MemoryStore {
  constructor(private readonly memento: Memento) {}

  list(): string[] {
    return this.memento.get<string[]>(KEY, []);
  }

  add(text: string): void {
    const t = text.trim();
    if (!t) return;
    const items = this.list();
    if (items.includes(t)) return;
    items.push(t);
    this.memento.update(KEY, items.slice(-MAX_ITEMS)).then(
      undefined,
      (err) => console.error("[MemoryStore] add başarısız:", err)
    );
  }

  remove(index: number): boolean {
    const items = this.list();
    if (index < 0 || index >= items.length) return false;
    items.splice(index, 1);
    this.memento.update(KEY, items).then(
      undefined,
      (err) => console.error("[MemoryStore] remove başarısız:", err)
    );
    return true;
  }

  clear(): void {
    this.memento.update(KEY, []).then(
      undefined,
      (err) => console.error("[MemoryStore] clear başarısız:", err)
    );
  }

  seedIfEmpty(notes: string[]): void {
    if (this.list().length > 0) return;
    for (const note of notes) {
      this.add(note);
    }
  }
}
