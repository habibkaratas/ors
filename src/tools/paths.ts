import * as path from "path";
import * as fs from "fs";

export function makeResolvePath(
  workspaceRoot: string,
  restrict = true
): (rel: string) => string {
  const root = path.resolve(workspaceRoot);
  return (rel: string): string => {
    if (typeof rel !== "string" || rel.length === 0) {
      throw new Error("Geçersiz yol: boş.");
    }
    const abs = path.isAbsolute(rel)
      ? path.resolve(rel)
      : path.resolve(root, rel);
    if (restrict) {
      const relToRoot = path.relative(root, abs);
      if (
        relToRoot === ".." ||
        relToRoot.startsWith(".." + path.sep) ||
        path.isAbsolute(relToRoot)
      ) {
        throw new Error(
          `Güvenlik: '${rel}' kök dizin dışına çıkıyor. ` +
            `Tüm diske erişim için ayarlardan 'ors.workspaceOnly' seçeneğini kapat.`
        );
      }
      try {
        const realRoot = fs.realpathSync(root);
        let existing = abs;
        while (!fs.existsSync(existing)) {
          const parent = path.dirname(existing);
          if (parent === existing) break;
          existing = parent;
        }
        const realExisting = fs.realpathSync(existing);
        const tail = path.relative(existing, abs);
        const realAbs = tail ? path.resolve(realExisting, tail) : realExisting;
        const relReal = path.relative(realRoot, realAbs);
        if (
          relReal === ".." ||
          relReal.startsWith(".." + path.sep) ||
          path.isAbsolute(relReal)
        ) {
          throw new Error(
            `Güvenlik: '${rel}' sembolik bağ üzerinden kök dizin dışına çıkıyor.`
          );
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    return abs;
  };
}

export function displayPath(workspaceRoot: string, abs: string): string {
  const rel = path.relative(workspaceRoot, abs);
  return rel && !rel.startsWith("..") ? rel.split(path.sep).join("/") : abs;
}
