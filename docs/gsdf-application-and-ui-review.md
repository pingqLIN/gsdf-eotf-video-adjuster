# GSDF Application and UI Review

Date: 2026-06-02

## Scope

This review checks whether the project applies the GSDF formula in a reasonable way, identifies practical optimization paths, and records the browser/UI redesign review for the Chrome extension panel.

Sources reviewed:

- DICOM PS3.14 current HTML/PDF: https://dicom.nema.org/medical/dicom/current/output/html/part14.html
- DICOM PS3.14 GSDF coefficients and luminance model: https://dicom.nema.org/medical/dicom/current/output/chtml/part14/chapter_B.html
- Barten model context in medical display calibration literature: https://pmc.ncbi.nlm.nih.gov/articles/PMC3043865/
- GSDF validation/caveat context for complex backgrounds: https://pmc.ncbi.nlm.nih.gov/articles/PMC3447097/
- Current implementation: [src/types.ts](../src/types.ts), [extension/content.js](../extension/content.js)
- Current model notes: [docs/gsdf-model.md](gsdf-model.md)

## Formula Review

The original research path is Barten-style human visual contrast sensitivity modeling, which DICOM PS3.14 turns into the normative GSDF luminance/JND relationship. This project implements the DICOM polynomial, not the raw psychophysical experiment or a clinical calibration workflow.

The core `gsdfJndToLuminance(jndIndex)` implementation is a reasonable use of the DICOM PS3.14 GSDF interpolation formula. The coefficient set in `src/types.ts` and `extension/content.js` matches the PS3.14 `log10(L(j))` relationship, and the current tests verify both the standard endpoint range and now additional midrange/monotonic samples.

The inverse path, `luminanceToGsdfJnd(luminance)`, uses binary search instead of the standard's approximate inverse polynomial. That is acceptable for this project because the forward function is monotonic, the table size is small, and using the forward equation as the source of truth avoids coefficient drift between two polynomial approximations.

## Application Review

The project applies GSDF as a browser-video preview model, not as a DICOM calibration system. This is reasonable if the project remains explicit about its limits:

- The extension does not measure physical display luminance, black level, ambient light, or page/video pipeline behavior.
- The SVG `feComponentTransfer` table operates in browser rendering space and is only an approximation of a calibrated display response.
- The `pow(level, 1 / 2.2)` output step is an extension-specific browser encoding approximation, not a DICOM PS3.14 requirement.
- The UI should expose one full GSDF path. The table should be generated for the selected target luminance first, then blended globally by a filter amount. No target luminance should act as a neutral no-compensation point.
- Stronger filter amounts can create a subjective clarity effect. The UI and docs should frame that as a preview/caveat, not as a calibration score or an image-quality improvement.
- Barten/GSDF assumptions are strongest for controlled grayscale viewing conditions; complex imagery, scene adaptation, color video, and browser rendering reduce the strength of any conformance-style claim.

## Optimization Paths

Recommended, low-risk improvements:

- Keep the current forward GSDF equation as the authoritative model.
- Add regression tests for midrange JND luminance and monotonicity.
- Document the browser transfer approximation next to the model flow.
- Preserve a future option for a configurable output transfer assumption, such as exact sRGB OETF or display-gamma presets, without changing the current default until browser evidence justifies it.

Higher-risk ideas that need measurement first:

- Detect or select SDR/HDR transfer assumptions per page.
- Add display-profile or meter-assisted calibration input.
- Replace the browser SVG approximation with a fully color-managed, display-profile-aware pipeline. This is likely outside a lightweight MV3 extension's reliable browser surface.

## UI Review Inputs

Three read-only reviewers were used:

- Formula reviewer: no blocking formula issue; recommended a clearer browser-approximation note and midrange/monotonic tests.
- UI/UX reviewer: the basic tab was too inspection-heavy for a compact popup; typography was too dim; the research pattern needed to stay on demand.
- Visual/accessibility reviewer: disabled states needed native `disabled` semantics; the chart needed to resize instead of using fixed `291x192` dimensions.

Browser baseline:

- Tool: Playwright
- URL: `http://127.0.0.1:3107/?mode=extension`
- Viewport: `1280x900`
- Baseline evidence kept under `.clean/verification-screenshots/`
- Observed issue: the old panel was 380px wide, visually dim in standby, and hid model/status context behind the advanced tab.

## Implemented Corrections

- Redesigned the extension panel as a compact instrument-control surface with stronger status hierarchy, visible active/standby state, one GSDF path, and a clearer daily path.
- Removed target-luminance neutral anchoring entirely; `strength` now acts as a global filter amount over the full GSDF table.
- Moved caveats into hover tooltips so the compact panel can prioritize status, key controls, and visual inspection.
- Removed the pure GSDF UI path and kept filter amount as the user-facing adjustment.
- Collapsed the calibration stripe details behind an on-demand control, kept the compact stripe preview inside the panel bounds, and preserved the full multi-frequency overlay.
- Added native disabled semantics for segmented buttons and range sliders.
- Replaced fixed chart sizing with width-aware rendering and added a full chart overlay so the curve can be viewed outside the compact extension panel constraints.
- Added chart captions that explain the axes, GSDF remap line, and Standard sRGB reference.
- Removed the remote Google Fonts dependency and switched to local/system font stacks suitable for an extension.
- Added midrange and monotonic GSDF regression coverage.
- Clarified in model docs that the browser output step is an approximation outside DICOM PS3.14.

## Post-Correction Review

Post-correction verification completed:

- `npm test`: 23/23 passing.
- `npm run lint`: TypeScript check passed.
- `npm run build:ext`: Vite build passed and copied rebuilt assets into `extension/ui`.
- Playwright `?mode=extension` basic view on `http://127.0.0.1:3108`: panel rendered at `400x680px`, with visible `STANDBY`, `GSDF`, filter amount, and display-gamut state.
- Playwright DOM check: no visible `Pure`, `純 GSDF`, `曲線模式`, target-luminance neutral-anchor text, caveat paragraph, manual save button, body scrollbar, page scrollbar, or panel overflow remained.
- Playwright tooltip check: full-GSDF and filter-amount explanations were present as hover `title` text.
- Playwright stripe check: compact rows measured `284x28px` and stayed inside the fixed control panel; the larger inspection pattern remained in the overlay.
- Playwright autosave check: initial load left `localStorage` untouched after 1.2 seconds; changing the display gamut wrote the setting after the 1 second debounce and showed the autosave toast.
- Playwright advanced standby DOM: display-gamut buttons had native `disabled` state.
- Playwright advanced active DOM: disabled controls cleared after enabling, chart text was present, and the chart surface rendered at `319x192`.
- Playwright full chart overlay DOM: full chart button was present, the overlay rendered, the chart surface measured `1535x420`, and the caption text was visible.
- Final browser console: no UI runtime errors and no Recharts sizing warnings; only the React DevTools development info message and the local dev server's missing `favicon.ico` request were present.

Screenshot evidence is kept locally under `.clean/verification-screenshots/`.
