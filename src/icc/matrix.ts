import type { VirtualGamutPreset } from '../color/gamutPresets';

export type Matrix3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export interface XyzNumber {
  x: number;
  y: number;
  z: number;
}

export const ICC_D50_XYZ: XyzNumber = { x: 0.9642, y: 1, z: 0.8249 };

export function xyToXyz(x: number, y: number): XyzNumber {
  return {
    x: x / y,
    y: 1,
    z: (1 - x - y) / y,
  };
}

export function multiplyMatrixVector(matrix: Matrix3, vector: [number, number, number]): [number, number, number] {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

export function multiplyMatrices(left: Matrix3, right: Matrix3): Matrix3 {
  return [
    [
      left[0][0] * right[0][0] + left[0][1] * right[1][0] + left[0][2] * right[2][0],
      left[0][0] * right[0][1] + left[0][1] * right[1][1] + left[0][2] * right[2][1],
      left[0][0] * right[0][2] + left[0][1] * right[1][2] + left[0][2] * right[2][2],
    ],
    [
      left[1][0] * right[0][0] + left[1][1] * right[1][0] + left[1][2] * right[2][0],
      left[1][0] * right[0][1] + left[1][1] * right[1][1] + left[1][2] * right[2][1],
      left[1][0] * right[0][2] + left[1][1] * right[1][2] + left[1][2] * right[2][2],
    ],
    [
      left[2][0] * right[0][0] + left[2][1] * right[1][0] + left[2][2] * right[2][0],
      left[2][0] * right[0][1] + left[2][1] * right[1][1] + left[2][2] * right[2][1],
      left[2][0] * right[0][2] + left[2][1] * right[1][2] + left[2][2] * right[2][2],
    ],
  ];
}

export function invertMatrix(matrix: Matrix3): Matrix3 {
  const [
    [a, b, c],
    [d, e, f],
    [g, h, i],
  ] = matrix;
  const determinant =
    a * (e * i - f * h) -
    b * (d * i - f * g) +
    c * (d * h - e * g);

  if (Math.abs(determinant) < 1e-12) {
    throw new Error('Matrix is not invertible');
  }

  const inv = 1 / determinant;
  return [
    [(e * i - f * h) * inv, (c * h - b * i) * inv, (b * f - c * e) * inv],
    [(f * g - d * i) * inv, (a * i - c * g) * inv, (c * d - a * f) * inv],
    [(d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv],
  ];
}

export function buildRgbToXyzD65Matrix(gamut: VirtualGamutPreset): Matrix3 {
  const red = xyToXyz(gamut.red.x, gamut.red.y);
  const green = xyToXyz(gamut.green.x, gamut.green.y);
  const blue = xyToXyz(gamut.blue.x, gamut.blue.y);
  const white = xyToXyz(gamut.white.x, gamut.white.y);
  const primaries: Matrix3 = [
    [red.x, green.x, blue.x],
    [red.y, green.y, blue.y],
    [red.z, green.z, blue.z],
  ];
  const scales = multiplyMatrixVector(invertMatrix(primaries), [white.x, white.y, white.z]);

  return [
    [red.x * scales[0], green.x * scales[1], blue.x * scales[2]],
    [red.y * scales[0], green.y * scales[1], blue.y * scales[2]],
    [red.z * scales[0], green.z * scales[1], blue.z * scales[2]],
  ];
}

export function matrixColumnsToXyz(matrix: Matrix3): [XyzNumber, XyzNumber, XyzNumber] {
  return [
    { x: matrix[0][0], y: matrix[1][0], z: matrix[2][0] },
    { x: matrix[0][1], y: matrix[1][1], z: matrix[2][1] },
    { x: matrix[0][2], y: matrix[1][2], z: matrix[2][2] },
  ];
}
