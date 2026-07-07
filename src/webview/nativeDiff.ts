import * as vscode from "vscode";
import * as path from "path";
import type { FileChange } from "../tools/types";

const SCHEME = "local-llm-proposed";

export class NativeDiffService {
  private readonly contents = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();

  register(): vscode.Disposable {
    const provider: vscode.TextDocumentContentProvider = {
      onDidChange: this.emitter.event,
      provideTextDocumentContent: (uri) => this.contents.get(uri.path) ?? "",
    };
    return vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider);
  }

  async show(change: FileChange): Promise<void> {
    const name = path.basename(change.absPath);
    const slug = change.absPath.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const rightKey = `/${slug}.proposed`;
    this.contents.set(rightKey, change.proposed);
    const right = vscode.Uri.from({ scheme: SCHEME, path: rightKey });
    this.emitter.fire(right);

    let left: vscode.Uri;
    if (change.original === null) {
      const leftKey = `/${slug}.empty`;
      this.contents.set(leftKey, "");
      left = vscode.Uri.from({ scheme: SCHEME, path: leftKey });
    } else {
      left = vscode.Uri.file(change.absPath);
    }

    const title = `${name} — önerilen değişiklik (onay bekliyor)`;
    await vscode.commands.executeCommand("vscode.diff", left, right, title, {
      preview: true,
      preserveFocus: true,
    });
  }
}
