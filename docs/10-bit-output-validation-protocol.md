# 10-bit Output Validation Protocol

> **Purpose:** define the evidence required before a renderer can claim
> end-to-end 10-bit GSDF/CSDF output. Passing a model calculation, browser UI
> check, source-code inspection, monitor specification, or Windows HDR toggle
> alone is insufficient.

Traditional Chinese companion: [10-bit-output-validation-protocol.zh-tw.md](10-bit-output-validation-protocol.zh-tw.md).

## Applicability

Use this protocol for a proposed high-precision renderer. The current SVG
component-transfer extension path is a **baseline expected not to qualify**;
it remains useful as an 8-bit comparison route.

This protocol does not certify DICOM conformance, diagnostic-display fitness,
or a particular user's visual threshold. It validates a defined rendering path
on a recorded hardware/software configuration.

## Claim being tested

A pass supports this limited statement:

> On the recorded configuration, the named renderer preserved a high-precision
> GSDF/CSDF transfer path without a pre-presentation 8-bit transfer-table
> bottleneck, presented through a verified 10-bit-or-higher output path, and
> produced repeatable physical measurements for the declared test patterns.

Do not generalise this to other browsers, GPUs, drivers, displays, protected
content, operating-system states, or renderer modes without repeating the
applicable gates.

## Required test matrix

Run the minimum matrix below. A test row is invalid when a required datum is
missing or a tool silently substitutes a different renderer.

| Axis | Required values |
| --- | --- |
| Renderer | Current SVG baseline; each proposed high-precision renderer |
| Source | Known 8-bit ramp; known 10-bit, 1024-step ramp with codec and metadata recorded |
| Transfer | GSDF and CSDF, with recorded luminance/gamma/black/white settings |
| HDR state | Off and on, where the platform supports it |
| Dither state | Off and on when the renderer offers it |
| Capture | GPU/surface inspection plus a capture method that declares its own bit depth; physical photometer measurement |
| Bands | 0–31, 32–127, 128–191, and 192–255 8-bit-equivalent code ranges; use the matching 10-bit ranges for the 1024-step ramp |

Keep a raw, immutable copy of every source pattern. Test patterns must identify
their dimensions, frame rate, codec, transfer characteristics, mastering data,
and nominal code values. Do not use a screenshot as the source of truth for a
10-bit pattern.

## Evidence gates

All gates are required for a 10-bit-output claim.

### G0 — Configuration record

Record, without secret values:

- renderer build, commit, mode, and settings export;
- browser/host executable version and command-line mode when relevant;
- OS build, HDR/AutoHDR state, GPU model, driver version, cable/output path,
  display model, selected refresh rate, and display colour configuration;
- source pattern hash and complete media metadata;
- measurement instruments, firmware, calibration date, aperture, integration
  time, geometry, room lighting, and capture-tool version.

**Pass:** the configuration is sufficient for another operator to reproduce
the same test environment.
**Fail:** any format, driver, HDR, source, or instrument field is unknown.

### G1 — Renderer-path proof

Show the selected renderer receives the declared source and performs the
GSDF/CSDF transfer in a high-precision representation. Suitable evidence is a
source-level trace plus runtime capture or shader/pipeline inspection. Name the
format and precision; do not infer it from an API name alone.

**Pass:** the transfer stage is positively identified and no 8-bit LUT or
equivalent quantising transfer stage precedes presentation.
**Fail:** the transfer-stage format is unknown, or the route passes through a
256-entry/8-bit table before output.

### G2 — Presentation-surface proof

Use RenderDoc, PIX, ETW, a driver tool, or an equivalent instrumented trace to
capture the actual output/presentation surface. Record the surface format,
colour space, HDR metadata when relevant, and whether composition or overlay
was used.

**Pass:** the evidence identifies a 10-bit-or-higher presentation surface (or
a higher-precision surface with a separately identified final conversion) for
the renderer and scenario under test.
**Fail:** only a possible format is known, the trace is unavailable, or the
actual path falls back to 8-bit.

### G3 — Code-level retention

With the known 10-bit ramp, capture a lossless representation that preserves
the claimed bit depth or inspect the renderer before the final panel. Analyse
the declared ramp range for plateaus and distinct code values. A capture
pipeline that quantises to 8-bit is useful only as a visual comparison and
cannot satisfy this gate.

**Pass:** the analysis method can distinguish the expected 10-bit code steps
and reports no unexplained pre-presentation collapse to 256 levels.
**Fail:** analysis observes an 8-bit cap, cannot retain the necessary depth, or
cannot identify where observed plateaus originate.

### G4 — Physical display measurement

Measure a sequence of adjacent codes in every required band with a calibrated
photometer or equivalent instrument. Record at least repeated samples, mean,
standard deviation, and the instrument's resolution/noise floor. Derive
DDL-to-nit and the declared JND metric without silently replacing missing
measurements with the source model.

**Pass:** measurements distinguish the selected adjacent codes within the
instrument's uncertainty and are repeatable across the declared runs.
**Fail:** observed differences are below the instrument's resolution, results
are not repeatable, or panel FRC/dithering cannot be separated from the claim.

### G5 — Comparison and regression

Compare the candidate with the SVG baseline under the same source, settings,
display state, and measurement process. Repeat every candidate gate after a
renderer, browser/host, GPU-driver, or display-mode change.

**Pass:** the report clearly separates candidate evidence, SVG-baseline
evidence, and UNKNOWN observations.
**Fail:** a baseline model result is presented as candidate runtime proof, or
results from different configurations are mixed.

## Result record

Use one record per matrix row. Preserve raw trace/capture/measurement files in
the project-approved evidence store; do not include private display identifiers
or unrelated system data in publishable documentation.

```text
Run ID:
Date / operator:
Renderer / commit / mode:
Source pattern / hash / codec / bit depth / metadata:
GSDF or CSDF settings:
OS / browser-or-host / GPU driver / display state:
Presentation evidence tool / surface format / colour space / HDR metadata:
Capture method / confirmed capture bit depth:
Photometer / calibration / geometry / repeats:
Band measurements and uncertainty:
G0: pass | fail | blocked
G1: pass | fail | blocked
G2: pass | fail | blocked
G3: pass | fail | blocked
G4: pass | fail | blocked
G5: pass | fail | blocked
Verdict:
Unknowns and deviations:
Raw-evidence locations:
```

`blocked` is not a pass. A 10-bit-output claim is allowed only when every gate
is `pass`; otherwise report the renderer as unverified for that claim.

## Current SVG baseline outcome

The architecture reference documents the current SVG component-transfer route
as failing G1 by design on the checked Chromium implementation: its transfer
table becomes a per-channel 256-entry `uint8_t` LUT before presentation. The
baseline may still be tested for compatibility, hard-8 optimisation, and dither
appearance, but it must not be used as affirmative evidence of end-to-end
10-bit GSDF/CSDF output.

## Related material

- [Rendering and bit-depth architecture reference](rendering-bit-depth-architecture.md)
- [Current GSDF model](gsdf-model.md)
- [Current bit-depth model report](gsdf-csdf-bit-depth-report.html)
