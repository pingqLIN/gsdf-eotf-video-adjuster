# GSDF EOTF Video Adjuster

Reshape video grayscale into steadier JND steps so subtle tonal detail stays easier to tell apart.

GSDF EOTF Video Adjuster is a compact Chrome Manifest V3 extension and local preview tool for display-side perceptual luminance rescue. When a video looks crushed, washed out, or uneven because the grading, display EOTF, or viewing environment does not line up, it gives you direct control over gamma compensation, target luminance, and GSDF-inspired grayscale redistribution that helps brightness differences remain consistently distinguishable.

The premise is deliberately display-side: the tool optimizes the signal that has already reached the display path, rather than reinterpreting the source material's coding. After the normal gamma viewing baseline, the GSDF stage reshapes the available grayscale signal into more perceptually even JND steps across dark, mid, and bright ranges.

Use it as a practical viewing aid for special cases, not as a replacement for proper color grading, calibrated mastering, or medical display certification. The app can run as a standalone local preview, and the production path packages the same UI into a Chrome extension iframe that injects managed SVG filters onto detected video elements.

## What It Gives You

- Display-side tonal rescue for video that loses shadow, midtone, or highlight separation.
- JND-oriented GSDF redistribution for steadier grayscale detail discrimination.
- Pre-GSDF gamma compensation centered at `0 = gamma 2.2`, with left-side dark-environment compensation up to gamma 3.0 and right-side linear compensation down to gamma 1.0.
- Logarithmic target-luminance control from 10 to 500 nits.
- Filter amount control for blending the full GSDF output with the gamma-adjusted signal.
- RGB and YCbCr/luma-only filter paths for different viewing priorities.
- Black point, white point, sharpness, and color-temperature controls for practical rescue tuning.
- Compact and expanded GSDF stripe test views for visual inspection.
- Chrome extension fallback activation when a page reloads or the content script is not ready.

## Requirements

- Node.js 22 or newer is recommended.
- npm.
- Google Chrome is required only for `npm run smoke:ext`.

No Gemini or other cloud API key is required for the current app.

## Development

Install dependencies:

```powershell
npm ci
```

Run the standalone Vite app:

```powershell
npm run dev
```

Open `http://127.0.0.1:3000` or `http://localhost:3000`.

## Chrome Extension Build

Build the web app and copy the generated UI into `extension/ui`:

```powershell
npm run build:ext
```

Then load the `extension` folder in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this repo's `extension` directory.

Click the extension action on a supported web page to toggle the GSDF control panel.

## GSDF Model

The luminance model is documented in [docs/gsdf-model.md](docs/gsdf-model.md). It covers the purpose, DICOM PS3.14 source formula, implementation flow, project-specific choices, and limits.

The formula and UI application review is documented in [docs/gsdf-application-and-ui-review.md](docs/gsdf-application-and-ui-review.md).

## Verification

Run the fast test suite:

```powershell
npm test
```

Run TypeScript validation:

```powershell
npm run lint
```

Run the production web build:

```powershell
npm run build
```

Run the extension smoke test after building the extension UI:

```powershell
npm run build:ext
npm run smoke:ext
```

`smoke:ext` launches Chromium or Chrome with a temporary profile, loads the unpacked extension, toggles the panel, and writes a screenshot under `output/playwright`. It uses `CHROME_PATH` when set, otherwise it tries the newest local Playwright Chromium before falling back to the default Google Chrome path.

If the browser is installed somewhere else, set `CHROME_PATH` first:

```powershell
$env:CHROME_PATH = 'C:\Path\To\chrome.exe'
npm run smoke:ext
```

On machines where managed Google Chrome blocks command-line unpacked extension loading, point `CHROME_PATH` at a local Chromium build instead:

```powershell
$env:CHROME_PATH = "$env:LOCALAPPDATA\ms-playwright\chromium-1217\chrome-win64\chrome.exe"
npm run smoke:ext
```

## Project Layout

- `src/` contains the standalone React UI and shared GSDF model helpers.
- `extension/manifest.json` defines the Manifest V3 extension.
- `extension/background.js` owns action-click activation and injection fallback.
- `extension/content.js` injects the iframe UI and applies managed video filters.
- `scripts/buildExt.js` copies the Vite build into the extension package.
- `scripts/smokeExtensionChrome.mjs` runs the real Chrome extension smoke test.
- `tests/` contains Node-based regression tests for the model, content script, background script, manifest, and panel layout.
