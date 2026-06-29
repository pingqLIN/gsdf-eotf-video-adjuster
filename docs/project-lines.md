# Project Lines and Archive Map

This repo keeps the Chrome extension as the main product line and archives derivative work under explicit folders instead of leaving loose files at the repository root.

| Line | Purpose | Git/worktree intent | Primary paths |
|---|---|---|---|
| `main` | Browser extension for dynamic-video viewing assistance and human-vision-oriented detail separation. | Keep `main` releasable as the extension line. Feature work can continue on `codex/*` branches before merging. | `src/`, `extension/`, `scripts/buildExt.js`, `tests/`, `docs/gsdf-model.md` |
| `test-pattern` | Dynamic samples derived from paper-style visual test patterns, used to inspect tone loss and extension target handling. | Use a dedicated `test-pattern` branch/worktree only when this line becomes isolated from extension UI work. | `src/components/ToneLossTestPage.tsx`, `tests/tone-loss-test-page.test.mjs`, `docs/test-patterns.md` |
| `dynamic-icc-profile` | Generate static ICC profile snapshots that match the current extension settings. | Keep design inputs and conversion tools separate until the exporter is implemented in the app. | `docs/icc-lut/`, `tools/icc-lut/` |
| `eizo-cg-1d-lut` | Generate EIZO ColorNavigator-compatible one-dimensional Gamma/EOTF LUT CSV files for CG displays. | Treat this as a special-display derivative, not as the browser-extension runtime. | `docs/icc-lut/`, `docs/icc-lut/templates/`, `tools/icc-lut/` |

## Archiving Rules

- Runtime extension code stays in `src/` and `extension/`.
- Paper-style and visual-check pages stay in `src/components/` with focused route tests under `tests/`.
- ICC/EIZO specifications stay in `docs/icc-lut/`.
- Reusable conversion scripts stay in `tools/icc-lut/`.
- Generated or duplicate bundles stay local under `.clean/` unless there is an explicit reason to version them.
- Before merging any line back into the main extension branch, run `npm run lint`, `npm test`, and `npm run build:ext` when feasible.
