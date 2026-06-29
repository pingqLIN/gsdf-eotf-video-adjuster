# ICC and EIZO LUT Archive

This folder collects the design inputs for two derivative lines:

- `dynamic-icc-profile`: static Matrix/TRC ICC profile snapshots generated from extension settings.
- `eizo-cg-1d-lut`: EIZO ColorNavigator-compatible one-dimensional Gamma/EOTF LUT CSV output for CG displays.

## Files

| Path | Role |
|---|---|
| `implementation-spec.zh-tw.md` | Detailed Traditional Chinese implementation spec for dynamic ICC and EIZO LUT generation. |
| `virtual-icc-csv-schema.zh-tw.md` | CSV schema notes for virtual ICC TRC, vcgt/calibration, neutral measurements, and compensation-curve inputs. |
| `templates/virtual-icc-curve-minimal-template.csv` | Minimal input template for converting an extension remap curve into ICC-ready curve data. |
| `../../tools/icc-lut/convert_raw_curve_to_virtual_icc_csv.py` | Converts a raw extension remap curve into compensation or descriptive ICC TRC CSV. |
| `../../tools/icc-lut/convert_icc_curve_csv.py` | Parses DisplayCAL/Argyll ICC, CAL, and TI3 curve data into normalized CSV files. |

The duplicate agent package zip is preserved locally under `.clean/icc-lut-agent-package/` and is intentionally not tracked because the diffable source files above contain the useful content.

## Curve Boundaries

- `M(c)` is the browser extension code remap.
- `E(c)` is the target EOTF curve.
- `D(d)` is the ICC compensation or descriptive TRC.
- EIZO Gamma/EOTF CSV output should use the target EOTF, with 256 numeric lines, no header, no commas, monotonic values, and the last row as the maximum.

These outputs are static setting snapshots. Changing luminance, black point, display gamma, gamut, transfer formula, or filter strength requires regenerating the files.
