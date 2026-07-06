export interface DiffLine {
  type: "ctx" | "add" | "del";
  text: string;
}

export function lineDiff(oldText: string, newText: string, context = 3): DiffLine[] {
  const a = oldText.length ? oldText.split("\n") : [];
  const b = newText.length ? newText.split("\n") : [];

  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const full: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      full.push({ type: "ctx", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      full.push({ type: "del", text: a[i] });
      i++;
    } else {
      full.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) full.push({ type: "del", text: a[i++] });
  while (j < m) full.push({ type: "add", text: b[j++] });

  return trimContext(full, context);
}

function trimContext(lines: DiffLine[], context: number): DiffLine[] {
  const keep = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== "ctx") {
      for (
        let k = Math.max(0, i - context);
        k <= Math.min(lines.length - 1, i + context);
        k++
      ) {
        keep[k] = true;
      }
    }
  }
  const out: DiffLine[] = [];
  let gap = false;
  for (let i = 0; i < lines.length; i++) {
    if (keep[i]) {
      out.push(lines[i]);
      gap = false;
    } else if (!gap) {
      out.push({ type: "ctx", text: "…" });
      gap = true;
    }
  }
  return out;
}

export function renderDiff(lines: DiffLine[]): string {
  return lines
    .map((l) => (l.type === "add" ? "+" : l.type === "del" ? "-" : " ") + l.text)
    .join("\n");
}
