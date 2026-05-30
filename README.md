# GSDF EOTF Video Adjuster

GSDF EOTF Video Adjuster is a Vite/React control panel and Chrome Manifest V3 extension for applying perceptual luminance correction to web video. It targets workflows where a display is being reviewed at a known peak luminance and the video response should be shaped toward DICOM GSDF-style contrast behavior.

The app can run as a standalone local preview, and the production path packages the same UI into a Chrome extension iframe that injects managed SVG filters onto detected video elements.

## Capabilities

- Logarithmic target-luminance control from 10 to 500 nits.
- Relative compensation mode that keeps 500 nits neutral and increases correction at lower luminance.
- Pure GSDF mode for applying the full transfer curve.
- RGB and YCbCr/luma-only filter paths.
- Black point, white point, sharpness, and color-temperature controls.
- Compact and expanded GSDF stripe test views.
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
