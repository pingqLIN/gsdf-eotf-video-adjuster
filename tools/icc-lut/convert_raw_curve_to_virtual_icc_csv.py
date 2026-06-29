#!/usr/bin/env python3
"""
Convert a raw extension/CSDF remap CSV into a virtual ICC-ready curve CSV.

Expected raw input formats, in priority order:
1. input_norm,remap_output_norm
2. input_norm,output_norm
3. input,output          # values are auto-normalized if they exceed 1
4. code,output_code      # values are auto-normalized by detected max or --code-max

Recommended output for system display compensation ICC:
    D(d) = S(M^-1(d))
where M is extension output-code remap and S is source TRC linearization.

Example:
    python convert_raw_curve_to_virtual_icc_csv.py raw_curve.csv out.csv \
      --mode compensation --source-trc srgb --samples 8192
"""
from __future__ import annotations

import argparse
import csv
import math
from pathlib import Path
from typing import Iterable, List, Tuple


def clamp01(x: float) -> float:
    if x < 0:
        return 0.0
    if x > 1:
        return 1.0
    return x


def u16(x: float) -> int:
    return int(round(clamp01(x) * 65535.0))


def srgb_to_linear(x: float) -> float:
    x = clamp01(x)
    if x <= 0.04045:
        return x / 12.92
    return ((x + 0.055) / 1.055) ** 2.4


def source_trc(x: float, kind: str, gamma: float) -> float:
    x = clamp01(x)
    if kind == 'srgb':
        return srgb_to_linear(x)
    if kind == 'gamma':
        return x ** gamma
    if kind == 'identity':
        return x
    raise ValueError(f'Unsupported source TRC: {kind}')


def read_raw_curve(path: Path, code_max: float | None = None) -> Tuple[List[float], List[float]]:
    with path.open('r', newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise ValueError('CSV has no header')
        names = [n.strip() for n in reader.fieldnames]
        rows = [{k.strip(): v for k, v in row.items()} for row in reader]

    pairs = [
        ('input_norm', 'remap_output_norm'),
        ('input_norm', 'output_norm'),
        ('input', 'output'),
        ('code', 'output_code'),
    ]
    selected = None
    for a, b in pairs:
        if a in names and b in names:
            selected = (a, b)
            break
    if selected is None:
        raise ValueError(
            'Cannot detect curve columns. Use one of: '
            'input_norm/remap_output_norm, input_norm/output_norm, input/output, code/output_code.'
        )

    xs: List[float] = []
    ys: List[float] = []
    a, b = selected
    for row in rows:
        if row.get(a, '') == '' or row.get(b, '') == '':
            continue
        xs.append(float(row[a]))
        ys.append(float(row[b]))
    if len(xs) < 2:
        raise ValueError('Curve must contain at least 2 valid rows')

    max_seen = max(max(xs), max(ys))
    norm = code_max if code_max is not None else (255.0 if max_seen > 1.0 and max_seen <= 255.0 else 1023.0 if max_seen > 255.0 else 1.0)
    xs = [clamp01(x / norm) for x in xs]
    ys = [clamp01(y / norm) for y in ys]

    points = sorted(zip(xs, ys), key=lambda p: p[0])
    # Remove duplicate input positions by keeping the last occurrence.
    compact: List[Tuple[float, float]] = []
    for x, y in points:
        if compact and abs(compact[-1][0] - x) < 1e-12:
            compact[-1] = (x, y)
        else:
            compact.append((x, y))
    xs, ys = [p[0] for p in compact], [p[1] for p in compact]

    # Ensure endpoints exist for stable inversion.
    if xs[0] > 0.0:
        xs.insert(0, 0.0)
        ys.insert(0, 0.0)
    if xs[-1] < 1.0:
        xs.append(1.0)
        ys.append(1.0)
    xs[0], ys[0], xs[-1], ys[-1] = 0.0, clamp01(ys[0]), 1.0, clamp01(ys[-1])

    # Monotonic repair of remap output M(c).
    for i in range(1, len(ys)):
        if ys[i] < ys[i - 1]:
            ys[i] = ys[i - 1]
    ys[-1] = 1.0
    return xs, ys


def interp(xs: List[float], ys: List[float], x: float) -> float:
    x = clamp01(x)
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    lo = 0
    hi = len(xs) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if xs[mid] <= x:
            lo = mid
        else:
            hi = mid
    x0, x1 = xs[lo], xs[hi]
    y0, y1 = ys[lo], ys[hi]
    t = 0.0 if x1 == x0 else (x - x0) / (x1 - x0)
    return y0 + (y1 - y0) * t


def invert_monotonic(xs: List[float], ys: List[float], y: float) -> float:
    y = clamp01(y)
    if y <= ys[0]:
        return xs[0]
    if y >= ys[-1]:
        return xs[-1]
    j = 0
    while j < len(ys) - 2 and ys[j + 1] < y:
        j += 1
    y0, y1 = ys[j], ys[j + 1]
    x0, x1 = xs[j], xs[j + 1]
    t = 0.0 if y1 <= y0 else (y - y0) / (y1 - y0)
    return x0 + (x1 - x0) * t


def convert(raw_csv: Path, out_csv: Path, samples: int, mode: str, trc_kind: str, gamma: float, code_max: float | None) -> None:
    xs, ys = read_raw_curve(raw_csv, code_max=code_max)
    with out_csv.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow([
            'index',
            'input_norm',
            'remap_output_norm',
            'inverse_source_norm',
            'icc_trc_norm',
            'icc_trc_u16',
            'mode',
            'source_trc',
            'gamma',
        ])
        for i in range(samples):
            d = i / (samples - 1)
            remap = interp(xs, ys, d)
            inv = invert_monotonic(xs, ys, d)
            if mode == 'compensation':
                trc = source_trc(inv, trc_kind, gamma)
            elif mode == 'descriptive':
                trc = remap
            else:
                raise ValueError(f'Unsupported mode: {mode}')
            w.writerow([
                i,
                f'{d:.10f}',
                f'{remap:.10f}',
                f'{inv:.10f}',
                f'{trc:.10f}',
                u16(trc),
                mode,
                trc_kind,
                f'{gamma:.6f}',
            ])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('input_csv', type=Path)
    parser.add_argument('output_csv', type=Path)
    parser.add_argument('--samples', type=int, default=8192)
    parser.add_argument('--mode', choices=['compensation', 'descriptive'], default='compensation')
    parser.add_argument('--source-trc', choices=['srgb', 'gamma', 'identity'], default='srgb')
    parser.add_argument('--gamma', type=float, default=2.2)
    parser.add_argument('--code-max', type=float, default=None)
    args = parser.parse_args()
    if args.samples < 2:
        raise SystemExit('--samples must be >= 2')
    convert(args.input_csv, args.output_csv, args.samples, args.mode, args.source_trc, args.gamma, args.code_max)


if __name__ == '__main__':
    main()
