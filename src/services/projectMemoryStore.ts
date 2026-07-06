import type { Memento } from "vscode";
import { createHash } from "crypto";

const PROJECT_KEY_PREFIX = "ors.projectMemory.";
const MAX_PROJECTS = 50;
const MAX_FACTS = 50;

export interface ProjectMemory {
  root: string;
  updatedAt: string;
  summary: string;
  facts: string[];
}

export class ProjectMemoryStore {
  constructor(private readonly memento: Memento) {}

  get(root: string): ProjectMemory | undefined {
    return this.memento.get<ProjectMemory>(this.makeKey(root));
  }

  setSummary(root: string, summary: string): void {
    const mem = this.getOrInit(root);
    mem.summary = summary.trim();
    this.save(mem);
  }

  addFact(root: string, fact: string): boolean {
    const t = fact.trim();
    if (!t) return false;
    const mem = this.getOrInit(root);
    if (mem.facts.includes(t)) return false;
    mem.facts.push(t);
    if (mem.facts.length > MAX_FACTS) mem.facts = mem.facts.slice(-MAX_FACTS);
    this.save(mem);
    return true;
  }

  removeFact(root: string, index: number): boolean {
    const mem = this.get(root);
    if (!mem || index < 0 || index >= mem.facts.length) return false;
    mem.facts.splice(index, 1);
    this.save(mem);
    return true;
  }

  clear(root: string): void {
    this.update(this.makeKey(root), undefined);
  }

  roots(): string[] {
    return this.allEntries().map((m) => m.root);
  }

  private getOrInit(root: string): ProjectMemory {
    return (
      this.get(root) ?? {
        root,
        updatedAt: new Date().toISOString(),
        summary: "",
        facts: [],
      }
    );
  }

  private save(mem: ProjectMemory): void {
    mem.updatedAt = new Date().toISOString();
    this.evictIfNeeded(mem.root);
    this.update(this.makeKey(mem.root), mem);
  }

  private evictIfNeeded(incomingRoot: string): void {
    const entries = this.allEntries();
    if (entries.some((m) => m.root === incomingRoot)) return;
    if (entries.length < MAX_PROJECTS) return;
    const oldest = entries.reduce((a, b) => (a.updatedAt <= b.updatedAt ? a : b));
    this.update(this.makeKey(oldest.root), undefined);
  }

  private allEntries(): ProjectMemory[] {
    return this.memento
      .keys()
      .filter((k) => k.startsWith(PROJECT_KEY_PREFIX))
      .map((k) => this.memento.get<ProjectMemory>(k))
      .filter((m): m is ProjectMemory => m !== undefined);
  }

  private update(key: string, value: ProjectMemory | undefined): void {
    this.memento.update(key, value).then(
      undefined,
      (err) => console.error("[ProjectMemoryStore] yazma başarısız:", err)
    );
  }

  private makeKey(root: string): string {
    const h = createHash("sha1").update(root).digest("hex");
    return `${PROJECT_KEY_PREFIX}${h}`;
  }
}
