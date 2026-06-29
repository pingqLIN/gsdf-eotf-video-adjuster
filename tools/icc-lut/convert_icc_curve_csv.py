#!/usr/bin/env python3
"""
Convert DisplayCAL / Argyll ICC, CAL and TI3 curve data into normalized CSV files
for virtual ICC / Matrix-TRC generators.

Outputs:
- exact ICC rTRC/gTRC/bTRC table extracted from .icm
- high resolution interpolated TRC table
- calibration / vcgt-style table extracted from .cal
- neutral measurement table extracted from .bpc.ti3 or .ti3
"""
from __future__ import annotations

import csv
import json
import math
import pathlib
import struct
import zipfile
from typing import Dict, Iterable, List, Tuple

BASE = pathlib.Path('/mnt/data')
ICM_PATH = BASE / 'mile_20210712_STD_Curve.icm'
CAL_PATH = BASE / 'mile_20210712_STD_Curve.cal'
TI3_PATH = BASE / 'mile_20210712_STD_Curve.bpc.ti3'
if not TI3_PATH.exists():
    TI3_PATH = BASE / 'mile_20210712_STD_Curve.ti3'

OUT_DIR = BASE / 'virtual_icc_csv_converted'
OUT_DIR.mkdir(exist_ok=True)


def q(v: float, digits: int = 10) -> str:
    return f'{v:.{digits}f}'


def clamp01(x: float) -> float:
    if x < 0:
        return 0.0
    if x > 1:
        return 1.0
    return x


def u16(x: float) -> int:
    return int(round(clamp01(x) * 65535.0))


def parse_icc_tags(path: pathlib.Path) -> Dict[str, Tuple[int, int]]:
    data = path.read_bytes()
    if len(data) < 132:
        raise ValueError(f'{path} is too small to be an ICC profile')
    count = struct.unpack('>I', data[128:132])[0]
    tags: Dict[str, Tuple[int, int]] = {}
    for i in range(count):
        off = 132 + i * 12
        sig = data[off:off+4].decode('latin1')
        tag_off, tag_size = struct.unpack('>II', data[off+4:off+12])
        tags[sig] = (tag_off, tag_size)
    return tags


def read_icc_curve(path: pathlib.Path, tag: str) -> List[int]:
    data = path.read_bytes()
    tags = parse_icc_tags(path)
    if tag not in tags:
        raise KeyError(f'Missing {tag} tag in {path.name}')
    off, size = tags[tag]
    block = data[off:off+size]
    typ = block[0:4].decode('latin1')
    if typ != 'curv':
        raise ValueError(f'{tag} is {typ}, expected curv')
    count = struct.unpack('>I', block[8:12])[0]
    if count == 0:
        return []
    if count == 1:
        # Gamma encoded in u8Fixed8Number. Expand to 256 for convenience.
        gamma_u8 = struct.unpack('>H', block[12:14])[0]
        gamma = gamma_u8 / 256.0
        return [u16((i / 255.0) ** gamma) for i in range(256)]
    return [struct.unpack('>H', block[12 + 2*i:14 + 2*i])[0] for i in range(count)]


def read_xyz_tag(path: pathlib.Path, tag: str) -> Tuple[float, float, float] | None:
    data = path.read_bytes()
    tags = parse_icc_tags(path)
    if tag not in tags:
        return None
    off, size = tags[tag]
    block = data[off:off+size]
    if block[0:4] != b'XYZ ' or len(block) < 20:
        return None
    vals = []
    for i in range(3):
        raw = struct.unpack('>i', block[8+4*i:12+4*i])[0]
        vals.append(raw / 65536.0)
    return tuple(vals)  # type: ignore[return-value]


def write_icc_trc_csv(path: pathlib.Path, curves: Dict[str, List[int]]) -> None:
    n = len(next(iter(curves.values())))
    for k, values in curves.items():
        if len(values) != n:
            raise ValueError(f'Curve {k} has length {len(values)}; expected {n}')
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow([
            'index',
            'input_norm',
            'input_code_8bit',
            'rTRC_norm',
            'gTRC_norm',
            'bTRC_norm',
            'rTRC_u16',
            'gTRC_u16',
            'bTRC_u16',
        ])
        for i in range(n):
            x = i / (n - 1) if n > 1 else 0.0
            w.writerow([
                i,
                q(x),
                round(x * 255),
                q(curves['rTRC'][i] / 65535.0),
                q(curves['gTRC'][i] / 65535.0),
                q(curves['bTRC'][i] / 65535.0),
                curves['rTRC'][i],
                curves['gTRC'][i],
                curves['bTRC'][i],
            ])


def interpolate_table_float(values: List[int], sample_count: int) -> List[float]:
    """Interpolate ICC u16 curve samples into normalized float values.

    The *_norm columns keep sub-u16 interpolation precision; *_u16 columns
    are quantized only at CSV write time.
    """
    if sample_count < 2:
        raise ValueError('sample_count must be >= 2')
    n = len(values)
    if n < 2:
        raise ValueError('source curve must have at least 2 entries')
    src = [v / 65535.0 for v in values]
    out: List[float] = []
    for i in range(sample_count):
        x = i / (sample_count - 1)
        pos = x * (n - 1)
        lo = int(math.floor(pos))
        hi = min(n - 1, lo + 1)
        t = pos - lo
        y = (1 - t) * src[lo] + t * src[hi]
        out.append(y)
    out[0] = src[0]
    out[-1] = src[-1]
    for i in range(1, len(out)):
        if out[i] < out[i-1]:
            out[i] = out[i-1]
    return out


def write_icc_trc_float_csv(path: pathlib.Path, curves: Dict[str, List[float]]) -> None:
    n = len(next(iter(curves.values())))
    for k, values in curves.items():
        if len(values) != n:
            raise ValueError(f'Curve {k} has length {len(values)}; expected {n}')
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow([
            'index',
            'input_norm',
            'input_code_8bit',
            'rTRC_norm',
            'gTRC_norm',
            'bTRC_norm',
            'rTRC_u16',
            'gTRC_u16',
            'bTRC_u16',
        ])
        for i in range(n):
            x = i / (n - 1) if n > 1 else 0.0
            r = clamp01(curves['rTRC'][i])
            g = clamp01(curves['gTRC'][i])
            b = clamp01(curves['bTRC'][i])
            w.writerow([
                i,
                q(x),
                round(x * 255),
                q(r),
                q(g),
                q(b),
                u16(r),
                u16(g),
                u16(b),
            ])


def parse_argyll_data_blocks(path: pathlib.Path) -> List[Tuple[List[str], List[List[str]]]]:
    text = path.read_text(encoding='utf-8', errors='replace').splitlines()
    blocks: List[Tuple[List[str], List[List[str]]]] = []
    fields: List[str] | None = None
    i = 0
    while i < len(text):
        line = text[i].strip()
        if line == 'BEGIN_DATA_FORMAT':
            if i + 1 >= len(text):
                raise ValueError(f'BEGIN_DATA_FORMAT at EOF in {path}')
            fields = text[i + 1].strip().split()
            i += 1
        elif line == 'BEGIN_DATA':
            if fields is None:
                raise ValueError(f'BEGIN_DATA without data format in {path}')
            rows: List[List[str]] = []
            i += 1
            while i < len(text) and text[i].strip() != 'END_DATA':
                row = text[i].strip()
                if row:
                    rows.append(row.split())
                i += 1
            blocks.append((fields, rows))
        i += 1
    return blocks


def extract_cal_table(path: pathlib.Path) -> List[Dict[str, float]]:
    blocks = parse_argyll_data_blocks(path)
    for fields, rows in blocks:
        if fields == ['RGB_I', 'RGB_R', 'RGB_G', 'RGB_B']:
            out = []
            for row in rows:
                vals = [float(x) for x in row]
                out.append(dict(zip(fields, vals)))
            return out
    raise ValueError(f'No CAL RGB_I/R/G/B block found in {path}')


def write_cal_vcgt_csv(path: pathlib.Path, cal_rows: List[Dict[str, float]]) -> None:
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow([
            'index',
            'input_norm',
            'input_code_8bit',
            'vcgt_r_norm',
            'vcgt_g_norm',
            'vcgt_b_norm',
            'vcgt_r_u16',
            'vcgt_g_u16',
            'vcgt_b_u16',
        ])
        n = len(cal_rows)
        for i, row in enumerate(cal_rows):
            x = row['RGB_I']
            r, g, b = row['RGB_R'], row['RGB_G'], row['RGB_B']
            w.writerow([i, q(x), round(x * 255), q(r), q(g), q(b), u16(r), u16(g), u16(b)])


def extract_ti3_rgb_xyz(path: pathlib.Path) -> List[Dict[str, float]]:
    blocks = parse_argyll_data_blocks(path)
    for fields, rows in blocks:
        if fields == ['SAMPLE_ID', 'RGB_R', 'RGB_G', 'RGB_B', 'XYZ_X', 'XYZ_Y', 'XYZ_Z']:
            out: List[Dict[str, float]] = []
            for row in rows:
                d: Dict[str, float] = {}
                for key, value in zip(fields, row):
                    d[key] = float(value) if key != 'SAMPLE_ID' else int(float(value))
                out.append(d)
            return out
    raise ValueError(f'No RGB_XYZ block found in {path}')


def write_neutral_measurements_csv(path: pathlib.Path, ti3_rows: List[Dict[str, float]]) -> None:
    neutrals = [r for r in ti3_rows if abs(r['RGB_R'] - r['RGB_G']) < 1e-7 and abs(r['RGB_R'] - r['RGB_B']) < 1e-7]
    # Remove repeated white measurements if present; keep first black and tonal ramp order.
    unique: List[Dict[str, float]] = []
    seen = set()
    for r in neutrals:
        key = round(r['RGB_R'], 6)
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)
    unique.sort(key=lambda r: r['RGB_R'])
    if not unique:
        raise ValueError('No neutral rows found')
    y_black = unique[0]['XYZ_Y']
    y_white = unique[-1]['XYZ_Y']
    denom = max(1e-12, y_white - y_black)
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow([
            'sample_id',
            'input_percent',
            'input_norm',
            'input_code_8bit',
            'XYZ_X_normY100',
            'XYZ_Y_normY100',
            'XYZ_Z_normY100',
            'Y_abs_norm',
            'Y_black_relative_norm',
            'estimated_gamma_abs',
            'estimated_gamma_black_relative',
        ])
        for r in unique:
            x = r['RGB_R'] / 100.0
            y_abs = r['XYZ_Y'] / max(1e-12, y_white)
            y_rel = (r['XYZ_Y'] - y_black) / denom
            gamma_abs = '' if x <= 0 or y_abs <= 0 else q(math.log(y_abs) / math.log(x), 6) if x < 1 else ''
            gamma_rel = '' if x <= 0 or y_rel <= 0 else q(math.log(y_rel) / math.log(x), 6) if x < 1 else ''
            w.writerow([
                int(r['SAMPLE_ID']),
                q(r['RGB_R'], 6),
                q(x),
                round(x * 255),
                q(r['XYZ_X'], 6),
                q(r['XYZ_Y'], 6),
                q(r['XYZ_Z'], 6),
                q(clamp01(y_abs)),
                q(clamp01(y_rel)),
                gamma_abs,
                gamma_rel,
            ])


def write_correct_schema(path: pathlib.Path) -> None:
    text = """# Virtual ICC curve CSV 正確欄位格式

本資料夾內的 CSV 採用 normalized Matrix/TRC profile 產生器格式。

## 1. ICC TRC CSV：`*_icc_trc_*.csv`

欄位：

```csv
index,input_norm,input_code_8bit,rTRC_norm,gTRC_norm,bTRC_norm,rTRC_u16,gTRC_u16,bTRC_u16
```

說明：

- `input_norm`：ICC curveType 的輸入 domain，固定 0..1，必須遞增。
- `rTRC_norm/gTRC_norm/bTRC_norm`：channel response curve，0..1，必須單調 non-decreasing。
- `*_u16`：直接可寫入 ICC `curv` tag 的 16-bit table value。
- 若是中性灰階 virtual ICC，可讓 RGB 三通道相同；若要保留實測 DisplayCAL profile，可使用三通道各自的 TRC。

## 2. Calibration / vcgt CSV：`*_cal_vcgt_256.csv`

欄位：

```csv
index,input_norm,input_code_8bit,vcgt_r_norm,vcgt_g_norm,vcgt_b_norm,vcgt_r_u16,vcgt_g_u16,vcgt_b_u16
```

說明：

- 這是 GPU / video LUT calibration curve，不是 ICC display rTRC/gTRC/bTRC。
- 若要做 profile 的 `vcgt` tag 或 debug DisplayCAL `.cal`，用這個表。
- 若要做 ICC Matrix/TRC 的 display shaper，通常用 `*_icc_trc_*.csv`。

## 3. Neutral measurement CSV：`*_neutral_measurements.csv`

欄位包含原始 RGB% 與 XYZ，並額外計算：

- `Y_abs_norm = Y / Ywhite`
- `Y_black_relative_norm = (Y - Yblack) / (Ywhite - Yblack)`

## 4. 用於「製作虛擬 ICC 曲線」的最小輸入

如果要從 extension/CSDF 曲線輸出建立 compensation ICC，建議先整理成：

```csv
index,input_norm,remap_output_norm
```

再由轉換器產生：

```csv
index,input_norm,remap_output_norm,inverse_source_norm,icc_trc_norm,icc_trc_u16
```

其中 compensation ICC 的 TRC 應是：

```text
D(d) = S(M^-1(d))
```

- `M(c)`：extension 目前的 output-code remap。
- `M^-1(d)`：反解後的來源 code。
- `S(x)`：來源標準 TRC，例如 sRGB linearization 或 gamma 2.2。

不要把 `remap_output_norm` 直接塞進系統顯示器 ICC 的 TRC，否則 CMM 會用反向補償，結果通常不等於 extension 的視覺輸出。
"""
    path.write_text(text, encoding='utf-8')


def write_template(path: pathlib.Path, rows: int = 17) -> None:
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['index', 'input_norm', 'remap_output_norm'])
        for i in range(rows):
            x = i / (rows - 1)
            w.writerow([i, q(x), q(x)])


def write_metadata(path: pathlib.Path, curves: Dict[str, List[int]], cal_rows: List[Dict[str, float]], ti3_rows: List[Dict[str, float]]) -> None:
    xyz_tags = {tag: read_xyz_tag(ICM_PATH, tag) for tag in ['wtpt', 'bkpt', 'rXYZ', 'gXYZ', 'bXYZ', 'lumi']}
    tags = parse_icc_tags(ICM_PATH)
    data = ICM_PATH.read_bytes()
    version_raw = data[8:12]
    major = version_raw[0]
    minor = version_raw[1] >> 4
    bugfix = version_raw[1] & 0x0F
    meta = {
        'source_files': {
            'icc_profile': ICM_PATH.name,
            'calibration': CAL_PATH.name,
            'measurements': TI3_PATH.name,
        },
        'icc_header': {
            'size_bytes': len(data),
            'version': f'{major}.{minor}.{bugfix}',
            'device_class': data[12:16].decode('latin1'),
            'color_space': data[16:20].decode('latin1'),
            'pcs': data[20:24].decode('latin1'),
            'creator': data[80:84].decode('latin1'),
        },
        'icc_tag_count': len(tags),
        'icc_tags': sorted(tags.keys()),
        'curve_counts': {k: len(v) for k, v in curves.items()},
        'curve_endpoints_u16': {k: {'first': v[0], 'last': v[-1]} for k, v in curves.items()},
        'xyz_tags': {k: None if v is None else [round(x, 10) for x in v] for k, v in xyz_tags.items()},
        'cal_rows': len(cal_rows),
        'ti3_rgb_xyz_rows': len(ti3_rows),
        'notes': [
            'icc_trc_256.csv extracts exact curv tag samples from the uploaded ICM.',
            'icc_trc_8192.csv linearly interpolates the 256-sample TRCs and enforces monotonic non-decreasing values.',
            'cal_vcgt_256.csv is calibration/video LUT data from the CAL file; do not confuse it with display profile TRC.',
            'neutral_measurements.csv is parsed from the BPC TI3 when available, matching DisplayCAL neutral shaper extraction.',
        ],
    }
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')


def main() -> None:
    curves = {tag: read_icc_curve(ICM_PATH, tag) for tag in ['rTRC', 'gTRC', 'bTRC']}
    exact_csv = OUT_DIR / 'mile_20210712_STD_Curve_icc_trc_256.csv'
    write_icc_trc_csv(exact_csv, curves)

    hi_curves = {k: interpolate_table_float(v, 8192) for k, v in curves.items()}
    hi_csv = OUT_DIR / 'mile_20210712_STD_Curve_icc_trc_8192.csv'
    write_icc_trc_float_csv(hi_csv, hi_curves)

    cal_rows = extract_cal_table(CAL_PATH)
    vcgt_csv = OUT_DIR / 'mile_20210712_STD_Curve_cal_vcgt_256.csv'
    write_cal_vcgt_csv(vcgt_csv, cal_rows)

    ti3_rows = extract_ti3_rgb_xyz(TI3_PATH)
    neutral_csv = OUT_DIR / 'mile_20210712_STD_Curve_neutral_measurements.csv'
    write_neutral_measurements_csv(neutral_csv, ti3_rows)

    schema_md = OUT_DIR / 'virtual_icc_csv_schema.md'
    write_correct_schema(schema_md)
    template_csv = OUT_DIR / 'virtual_icc_curve_minimal_template.csv'
    write_template(template_csv)

    meta_json = OUT_DIR / 'conversion_metadata.json'
    write_metadata(meta_json, curves, cal_rows, ti3_rows)

    zip_path = BASE / 'virtual_icc_csv_converted.zip'
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for p in sorted(OUT_DIR.iterdir()):
            z.write(p, arcname=p.name)
        z.write(BASE / 'convert_icc_curve_csv.py', arcname='convert_icc_curve_csv.py')

    print('Created:')
    for p in sorted(OUT_DIR.iterdir()):
        print(' ', p)
    print(' ', zip_path)


if __name__ == '__main__':
    main()
