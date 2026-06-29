# Test Pattern Notes

The current derivative test-pattern line is implemented as a standalone React route that renders a dynamic 8-bit tone-loss pattern.

## Current Route

- Local app route: `/tone-loss-test`
- Query route: `?mode=tone-loss-test`
- Component: `src/components/ToneLossTestPage.tsx`
- Regression test: `tests/tone-loss-test-page.test.mjs`

## What It Checks

- Shadow code-value separation at the low end of 8-bit output.
- Highlight code-value separation at the high end of 8-bit output.
- Neutral, RGB primary, and CMY secondary patch rows.
- Moving scan-line emphasis so adjacent levels can be inspected dynamically.
- Optional `canvas.captureStream(60)` output into a real HTML `video` element, so the extension target picker and filter path can be checked against an actual video node.

This pattern is a visual inspection aid. It is not a display measurement, DICOM conformance test, or replacement for instrumented calibration.
