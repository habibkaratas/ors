export interface ParsedCall {
  name: string;
  arguments: Record<string, unknown>;
}

export function parseTextToolCalls(content: string, known?: Set<string>): ParsedCall[] {
  if (!content || !content.includes("{")) return [];
  const calls: ParsedCall[] = [];
  for (const value of extractJsonValues(content)) {
    collect(value, calls, known);
  }
  return calls;
}

function collect(value: unknown, out: ParsedCall[], known?: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out, known);
    return;
  }
  if (!value || typeof value !== "object") return;
  const o = value as Record<string, any>;
  if (Array.isArray(o.tool_calls)) {
    for (const c of o.tool_calls) collect(c, out, known);
    return;
  }
  const fn = o.function && typeof o.function === "object" ? o.function : undefined;
  const name = o.name ?? o.tool ?? o.tool_name ?? fn?.name;
  let args = o.arguments ?? o.parameters ?? o.args ?? o.input ?? fn?.arguments;
  if (typeof name !== "string" || !name) return;
  if (known && !known.has(name)) return;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }
  out.push({
    name,
    arguments: args && typeof args === "object" ? (args as Record<string, unknown>) : {},
  });
}

function extractJsonValues(text: string): unknown[] {
  const values: unknown[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === "{" || c === "[") {
      const end = matchBalanced(text, i);
      if (end > i) {
        const slice = text.slice(i, end + 1);
        const parsed = tryParseLenient(slice);
        if (parsed !== undefined) values.push(parsed);
        i = end + 1;
        continue;
      }
    }
    i++;
  }
  return values;
}

function tryParseLenient(slice: string): unknown {
  try {
    return JSON.parse(slice);
  } catch {
  }
  try {
    const repaired = slice.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    return JSON.parse(repaired);
  } catch {
    return undefined;
  }
}

function matchBalanced(text: string, start: number): number {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
