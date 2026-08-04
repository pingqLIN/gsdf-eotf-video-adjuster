# Rendering and Bit-depth Architecture Reference

> **Status: technical reference, not an output certification.** This document
> describes the checked source path and its evidence boundary. It does not prove
> a particular computer, display, driver, browser build, or protected-video path
> emits 10-bit output.

Traditional Chinese companion: [rendering-bit-depth-architecture.zh-tw.md](rendering-bit-depth-architecture.zh-tw.md).

## Scope and terminology

Three different properties are often all called “10-bit.” They must be kept
separate:

| Property | Question answered | Current evidence |
| --- | --- | --- |
| Source and decode precision | Is the media source or decode surface 10-bit? | Not controlled by this extension. |
| Tone-renderer precision | Can GSDF/CSDF preserve more than 256 independently controlled levels through its transfer stage? | No for the current Chromium SVG component-transfer route. |
| Presentation precision | Does the final operating-system/display path present at least 10 bits? | Hardware- and runtime-dependent; unverified here. |

The phrase **effective 8-bit component-transfer** in this reference only
describes the second property. It is not a claim that every upstream or
downstream surface is 8-bit.

## Checked current path

```text
HTMLVideoElement
  -> CSS filter: url(#gsdf-eotf-...)
  -> Blink SVG filter / Skia table colour filter
  -> Chromium compositor / Viz / GPU process
  -> operating-system compositor
  -> display
```

The extension owns the first transition only. It builds SVG filters, then
assigns the managed CSS filter chain to each target `HTMLVideoElement`.

| Checked implementation fact | Evidence |
| --- | --- |
| The managed chain places the selected GSDF or CSDF transfer filter before levels, temperature, colour, and optional dither. | [`extension/content.js`](../extension/content.js), `buildManagedFilterChain()` |
| The GSDF RGB and CSDF routes use SVG `<feComponentTransfer>` `table` functions; the GSDF YCbCr route applies its table to the converted luma component. | [`extension/content.js`](../extension/content.js), `injectSVGFilter()` |
| The extension builds a 256-sample active transfer table. | [`extension/content.js`](../extension/content.js), `GSDF_TABLE_SIZE = 256` and `buildActiveTransferTableValues()` |
| The filter is applied as `video.style.filter`; the extension does not supply a custom WebGL, WebGPU, WebCodecs, Worker, or OffscreenCanvas video renderer. | [`extension/content.js`](../extension/content.js), `applyVideoFilter()` and source-tree inspection |
| The existing regression suite checks the managed-filter selection and ordering. | [`tests/content-effects.test.mjs`](../tests/content-effects.test.mjs) |

`will-change: filter` is only a compositing hint. It does not select a fixed
GPU backend, direct overlay, swap-chain format, or display bit depth.

## The component-transfer bottleneck

The project supplies 256 floating-point table values to SVG. In the Chromium
snapshot examined for this project (`ad8089d25cba75a1719cec2af9063383edce811c`),
Blink's `FEComponentTransfer` interpolates the table into per-channel
`uint8_t[256]` arrays and creates a Skia `MakeTableARGB` colour filter.

- [Float table conversion in the checked Chromium snapshot](https://github.com/chromium/chromium/blob/ad8089d25cba75a1719cec2af9063383edce811c/third_party/blink/renderer/platform/graphics/filters/fe_component_transfer.cc#L43-L61)
- [256-entry `uint8_t` tables and `MakeTableARGB`](https://github.com/chromium/chromium/blob/ad8089d25cba75a1719cec2af9063383edce811c/third_party/blink/renderer/platform/graphics/filters/fe_component_transfer.cc#L134-L146)

For that current project path and checked Chromium revision, this is the first
known stage that merges component-transfer levels to 8-bit precision. A later
P010 decode surface, HDR desktop mode, RGB10A2 swap chain, panel FRC, or
10-bit display cannot recover levels already merged at this stage.

This statement is deliberately version-scoped. A Chromium implementation
change must be rechecked before relying on it for a new browser version.

## What the current bit-depth report does and does not show

[`gsdf-csdf-bit-depth-report.html`](gsdf-csdf-bit-depth-report.html) compares
the model's ideal floating-point curve with nearest-code 8-bit and 10-bit
quantisation. It usefully shows the value of a higher-precision transfer model:

- hard 8-bit GSDF: 225 unique output levels and 31 merged adjacent transitions;
- hard 8-bit CSDF: 227 unique output levels and 29 merged adjacent transitions;
- simulated hard 10-bit: all 256 input samples remain distinct in the reported
  model cases.

Those numbers are **model results**, not a measurement of the browser output.
They do not prove that this extension writes a 10-bit surface. The hard-8 JND
optimiser likewise redistributes 8-bit device codes and returns to the same
256-entry SVG transfer-table route; it is not a 10-bit renderer.

The optional Dither Beta filter uses fixed-seed SVG `feTurbulence` as spatial
noise. It may change the visibility of banding, but it has not been verified as
temporal dithering and cannot restore independently controlled transfer levels.

## Decision boundary

The existing extension should be described as a high-compatibility,
effective-8-bit component-transfer viewing aid. Do not describe it as an
end-to-end 10-bit GSDF/CSDF renderer based only on source metadata, monitor
specifications, Windows HDR state, a 10-bit swap-chain possibility, or the
mathematical bit-depth report.

The following are separate, unimplemented research directions rather than a
selected architecture:

| Direction | Potential benefit | Material boundary |
| --- | --- | --- |
| Keep SVG component transfer | Keeps the extension's current compatibility model. | Retains the checked 8-bit component-transfer bottleneck. |
| WebGL2 or WebGPU shader | Can preserve high-precision intermediate arithmetic. | Browser canvas/output precision, protected playback, and page integration still need proof. |
| WebGPU plus WebCodecs renderer | Gives more control of decode/frame processing. | CORS, DRM, subtitles, controls, and website-player compatibility must be rebuilt or deliberately excluded. |
| Native D3D11/D3D12 renderer | Can explicitly manage P010/FP16, RGB10A2, HDR metadata, and presentation. | It is a separate product/runtime with its own security, playback, and validation scope. |

No renderer replacement is authorised by this reference. Any candidate that
claims genuine 10-bit output must meet the evidence gates in
[10-bit-output-validation-protocol.md](10-bit-output-validation-protocol.md).

## Evidence status

### VERIFIED

- The extension applies the managed CSS/SVG filter chain to `HTMLVideoElement`
  targets and uses 256-entry transfer tables.
- The checked Chromium source snapshot converts component-transfer tables into
  per-channel 256-entry `uint8_t` LUTs before constructing a Skia table filter.
- The current project source contains no custom GPU/video-frame renderer.

### INFERRED

- Fixed spatial noise can reduce the apparent visibility of some bands. Its
  result depends on content, scaling, composition, and the display.
- A CSS/SVG filter generally requires a page composition/filter pass. Actual
  overlay eligibility remains a Chromium runtime decision.

### UNKNOWN

- The active Chrome/GPU raster backend and feature status on a target machine.
- Decode and intermediate-surface formats before and after the SVG filter.
- Windows HDR/AutoHDR state, GPU-driver presentation format, OS colour
  management, compositor dithering, panel native depth, and panel FRC.
- Behaviour for DRM/protected video or a given website's player pipeline.
- Physical DDL-to-nit response and JND spacing on a particular display.

## Related material

- [GSDF model and current browser approximation](gsdf-model.md)
- [GSDF/CSDF bit-depth model report](gsdf-csdf-bit-depth-report.html)
- [10-bit output validation protocol](10-bit-output-validation-protocol.md)
