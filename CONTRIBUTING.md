# Contributing Guide

Thanks for your interest in contributing to Örs. Örs is a **local-first** coding assistant;
contributions should preserve that philosophy (no cloud push, no lock-in, transparent
approval).

## Before you start

- For a large change or a new feature, **open an issue first** so we can discuss the
  approach. That avoids wasted effort.
- For small fixes (a typo, a clear bug), you can open a PR directly.

## Development setup

```bash
npm install
npm run compile     # development build (sourcemaps)
npm run watch       # watch for changes + rebuild automatically
```

Open the folder in VSCode and press **F5** → an Extension Development Host window opens.
Prerequisite: a local **Ollama** server must be running (see the README).

Packaging:

```bash
npm run package     # produces ors.vsix at the repo root
```

## Branch and PR flow

1. **Fork** the repo.
2. Create a branch for your change — **named by feature, not by layer**:
   - `feat/short-description` — a new feature
   - `fix/short-description` — a bug fix
   - `docs/…`, `refactor/…`, `chore/…`
   > A change usually touches several `src/` layers (e.g. a feature spans `webview/` +
   > `shared/` + `tools/`). That's normal; keep the branch scoped to the feature.
3. Open a **PR** against `master`. Fill in the PR template.
4. **CI** (tsc + build) must be green. A maintainer reviews and **squash-merges**.

`master` is protected: direct pushes and force-pushes are disabled; everything goes through
a PR.

## Code standards

- **Match the surrounding code style** — naming, density, language.
- **Don't write unnecessary comments.** Only explain the "why" that isn't clear from the
  code; comments that restate "what the code does" are not added.
- Before your change, these must pass:
  ```bash
  npx tsc --noEmit -p tsconfig.json
  node esbuild.js --production
  node --check media/main.js
  ```

## Security invariants (must not be weakened)

The following are deliberate security measures; a PR may not loosen them:

- Command-injection pattern: `/[;|`]|\$\(|&&|\|\|/`
- Path jail / symlink-escape protection (`resolvePath`, `realpathSync`)
- The approval gate (writes and commands go through a preview + approval)
- Stripping secrets from subprocess environments via `buildSafeEnv()`
- Tool categories: a code-executing tool is never labeled `read`

If you want to report a security vulnerability responsibly, contact the maintainer privately
instead of opening a public issue.

## What is not committed

Internal/temporary files covered by `.gitignore` are not committed: `node_modules/`,
`out/`, `e2e/` (test scripts), `ROADMAP.md`, and similar working/planning files.

## License

By submitting a contribution, you agree that it will be published under the project's
**MIT** license.
