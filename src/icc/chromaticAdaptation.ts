import {
  type Matrix3,
  type XyzNumber,
  ICC_D50_XYZ,
  invertMatrix,
  multiplyMatrices,
  multiplyMatrixVector,
  xyToXyz,
} from './matrix';

const BRADFORD: Matrix3 = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];

const BRADFORD_INVERSE = invertMatrix(BRADFORD);

export const D65_XYZ = xyToXyz(0.3127, 0.3290);

export function buildBradfordAdaptationMatrix(sourceWhite: XyzNumber = D65_XYZ, destinationWhite: XyzNumber = ICC_D50_XYZ): Matrix3 {
  const sourceCone = multiplyMatrixVector(BRADFORD, [sourceWhite.x, sourceWhite.y, sourceWhite.z]);
  const destinationCone = multiplyMatrixVector(BRADFORD, [destinationWhite.x, destinationWhite.y, destinationWhite.z]);
  const scale: Matrix3 = [
    [destinationCone[0] / sourceCone[0], 0, 0],
    [0, destinationCone[1] / sourceCone[1], 0],
    [0, 0, destinationCone[2] / sourceCone[2]],
  ];

  return multiplyMatrices(multiplyMatrices(BRADFORD_INVERSE, scale), BRADFORD);
}

export function adaptMatrixToD50(rgbToXyzD65: Matrix3): { matrix: Matrix3; adaptationMatrix: Matrix3 } {
  const adaptationMatrix = buildBradfordAdaptationMatrix();
  return {
    matrix: multiplyMatrices(adaptationMatrix, rgbToXyzD65),
    adaptationMatrix,
  };
}
