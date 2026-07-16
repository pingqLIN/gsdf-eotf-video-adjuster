import { luminanceToGsdfJnd } from './perceptualLuminance';

const JND_ZERO_EPSILON = 1e-9;

export interface Hard8DisplayModel {
  blackNits: number;
  whiteNits: number;
  displayGamma: number;
  deviceLevelCount?: number;
}

export interface Hard8JndStatistics {
  uniqueLevels: number;
  mergedTransitions: number;
  skippedDeviceCodes: number;
  discernibleTransitions: number;
  subJndTransitions: number;
  allJndStepMean: number;
  allJndStepSd: number;
  nonzeroJndStepMean: number;
  nonzeroJndStepSd: number;
  nonzeroJndStepMin: number;
  nonzeroJndStepMax: number;
  jndSteps: number[];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function assertFiniteIncreasingJndIndex(deviceJndIndex: number[]): void {
  if (deviceJndIndex.length < 2) {
    throw new Error('The device JND index must contain at least two levels.');
  }

  for (let index = 0; index < deviceJndIndex.length; index += 1) {
    const value = deviceJndIndex[index];
    if (!Number.isFinite(value)) {
      throw new Error(`The device JND index contains a non-finite value at ${index}.`);
    }
    if (index > 0 && value <= deviceJndIndex[index - 1]) {
      throw new Error('The device JND index must be strictly increasing.');
    }
  }
}

export function buildHard8DeviceJndIndex({
  blackNits,
  whiteNits,
  displayGamma,
  deviceLevelCount = 256,
}: Hard8DisplayModel): number[] {
  if (!Number.isFinite(blackNits) || blackNits <= 0) {
    throw new Error('blackNits must be a positive finite value.');
  }
  if (!Number.isFinite(whiteNits) || whiteNits <= blackNits) {
    throw new Error('whiteNits must be greater than blackNits.');
  }
  if (!Number.isFinite(displayGamma) || displayGamma <= 0) {
    throw new Error('displayGamma must be a positive finite value.');
  }
  if (!Number.isInteger(deviceLevelCount) || deviceLevelCount < 2) {
    throw new Error('deviceLevelCount must be an integer of at least two.');
  }

  const maximumCode = deviceLevelCount - 1;
  const luminanceSpan = whiteNits - blackNits;
  return Array.from({ length: deviceLevelCount }, (_, code) => {
    const normalizedCode = code / maximumCode;
    const luminance = blackNits + luminanceSpan * (normalizedCode ** displayGamma);
    return luminanceToGsdfJnd(luminance);
  });
}

export function analyzeHard8DeviceCodeMapping(
  deviceCodes: number[],
  deviceJndIndex: number[],
): Hard8JndStatistics {
  assertFiniteIncreasingJndIndex(deviceJndIndex);
  if (deviceCodes.length < 2) {
    throw new Error('The device-code mapping must contain at least two inputs.');
  }

  const maximumCode = deviceJndIndex.length - 1;
  for (let index = 0; index < deviceCodes.length; index += 1) {
    const code = deviceCodes[index];
    if (!Number.isInteger(code) || code < 0 || code > maximumCode) {
      throw new Error(`Device code ${code} at ${index} is outside 0-${maximumCode}.`);
    }
    if (index > 0 && code < deviceCodes[index - 1]) {
      throw new Error('The device-code mapping must be monotonic.');
    }
  }

  const jndSteps = deviceCodes.slice(1).map((code, index) => (
    deviceJndIndex[code] - deviceJndIndex[deviceCodes[index]]
  ));
  const nonzeroJndSteps = jndSteps.filter((value) => value > JND_ZERO_EPSILON);
  if (nonzeroJndSteps.length === 0) {
    throw new Error('The device-code mapping must contain at least one non-zero transition.');
  }
  const mergedTransitions = jndSteps.length - nonzeroJndSteps.length;
  const skippedDeviceCodes = deviceCodes.slice(1).reduce((sum, code, index) => (
    sum + Math.max(0, code - deviceCodes[index] - 1)
  ), 0);

  return {
    uniqueLevels: new Set(deviceCodes).size,
    mergedTransitions,
    skippedDeviceCodes,
    discernibleTransitions: jndSteps.filter((value) => value >= 1).length,
    subJndTransitions: jndSteps.filter((value) => value < 1).length,
    allJndStepMean: mean(jndSteps),
    allJndStepSd: standardDeviation(jndSteps),
    nonzeroJndStepMean: mean(nonzeroJndSteps),
    nonzeroJndStepSd: standardDeviation(nonzeroJndSteps),
    nonzeroJndStepMin: Math.min(...nonzeroJndSteps),
    nonzeroJndStepMax: Math.max(...nonzeroJndSteps),
    jndSteps,
  };
}

/**
 * Selects a strictly increasing subset of device codes that minimizes the
 * population standard deviation of the retained (non-zero) JND intervals.
 * The first and last device codes are always retained.
 */
export function optimizeHard8JndDeviceLevels(
  deviceJndIndex: number[],
  uniqueLevelCount: number,
): number[] {
  assertFiniteIncreasingJndIndex(deviceJndIndex);
  if (!Number.isInteger(uniqueLevelCount)
    || uniqueLevelCount < 2
    || uniqueLevelCount > deviceJndIndex.length) {
    throw new Error(`uniqueLevelCount must be between 2 and ${deviceJndIndex.length}.`);
  }

  const deviceLevelCount = deviceJndIndex.length;
  const lastDeviceCode = deviceLevelCount - 1;
  const targetJndStep = (
    deviceJndIndex[lastDeviceCode] - deviceJndIndex[0]
  ) / (uniqueLevelCount - 1);
  let previousCosts = new Float64Array(deviceLevelCount);
  previousCosts.fill(Number.POSITIVE_INFINITY);
  previousCosts[0] = 0;
  const parents = Array.from(
    { length: uniqueLevelCount },
    () => new Int16Array(deviceLevelCount).fill(-1),
  );

  for (let selectedIndex = 1; selectedIndex < uniqueLevelCount; selectedIndex += 1) {
    const nextCosts = new Float64Array(deviceLevelCount);
    nextCosts.fill(Number.POSITIVE_INFINITY);
    const minimumCode = selectedIndex;
    const remainingSelections = uniqueLevelCount - 1 - selectedIndex;
    const maximumCode = lastDeviceCode - remainingSelections;

    for (let code = minimumCode; code <= maximumCode; code += 1) {
      let bestCost = Number.POSITIVE_INFINITY;
      let bestPreviousCode = -1;

      for (let previousCode = selectedIndex - 1; previousCode < code; previousCode += 1) {
        const previousCost = previousCosts[previousCode];
        if (!Number.isFinite(previousCost)) {
          continue;
        }

        const jndStep = deviceJndIndex[code] - deviceJndIndex[previousCode];
        const candidateCost = previousCost + (jndStep - targetJndStep) ** 2;
        if (candidateCost < bestCost) {
          bestCost = candidateCost;
          bestPreviousCode = previousCode;
        }
      }

      nextCosts[code] = bestCost;
      parents[selectedIndex][code] = bestPreviousCode;
    }

    previousCosts = nextCosts;
  }

  if (!Number.isFinite(previousCosts[lastDeviceCode])) {
    throw new Error('Unable to construct the requested hard 8-bit JND level set.');
  }

  const selectedCodes = new Array<number>(uniqueLevelCount);
  let code = lastDeviceCode;
  selectedCodes[uniqueLevelCount - 1] = code;
  for (let selectedIndex = uniqueLevelCount - 1; selectedIndex > 0; selectedIndex -= 1) {
    code = parents[selectedIndex][code];
    if (code < 0) {
      throw new Error('The hard 8-bit JND optimizer produced an incomplete path.');
    }
    selectedCodes[selectedIndex - 1] = code;
  }

  return selectedCodes;
}

/**
 * Finds the monotonic input-to-device mapping that minimizes the population
 * standard deviation across every input interval, including merged intervals.
 * The black and white endpoints are fixed, so the interval mean is fixed too.
 */
export function optimizeHard8AllStepMapping(
  deviceJndIndex: number[],
  inputLevelCount = 256,
): number[] {
  assertFiniteIncreasingJndIndex(deviceJndIndex);
  if (!Number.isInteger(inputLevelCount) || inputLevelCount < 2) {
    throw new Error('inputLevelCount must be an integer of at least two.');
  }

  const deviceLevelCount = deviceJndIndex.length;
  const lastDeviceCode = deviceLevelCount - 1;
  const targetJndStep = (
    deviceJndIndex[lastDeviceCode] - deviceJndIndex[0]
  ) / (inputLevelCount - 1);
  let previousCosts = new Float64Array(deviceLevelCount);
  previousCosts.fill(Number.POSITIVE_INFINITY);
  previousCosts[0] = 0;
  const parents = Array.from(
    { length: inputLevelCount },
    () => new Int16Array(deviceLevelCount).fill(-1),
  );

  for (let inputIndex = 1; inputIndex < inputLevelCount; inputIndex += 1) {
    const nextCosts = new Float64Array(deviceLevelCount);
    nextCosts.fill(Number.POSITIVE_INFINITY);
    const isLastInput = inputIndex === inputLevelCount - 1;
    const minimumCode = isLastInput ? lastDeviceCode : 0;

    for (let code = minimumCode; code <= lastDeviceCode; code += 1) {
      let bestCost = Number.POSITIVE_INFINITY;
      let bestPreviousCode = -1;

      for (let previousCode = 0; previousCode <= code; previousCode += 1) {
        const previousCost = previousCosts[previousCode];
        if (!Number.isFinite(previousCost)) {
          continue;
        }

        const jndStep = deviceJndIndex[code] - deviceJndIndex[previousCode];
        const candidateCost = previousCost + (jndStep - targetJndStep) ** 2;
        if (candidateCost < bestCost) {
          bestCost = candidateCost;
          bestPreviousCode = previousCode;
        }
      }

      nextCosts[code] = bestCost;
      parents[inputIndex][code] = bestPreviousCode;
    }

    previousCosts = nextCosts;
  }

  if (!Number.isFinite(previousCosts[lastDeviceCode])) {
    throw new Error('Unable to construct the requested hard 8-bit input mapping.');
  }

  const deviceCodes = new Array<number>(inputLevelCount);
  let code = lastDeviceCode;
  deviceCodes[inputLevelCount - 1] = code;
  for (let inputIndex = inputLevelCount - 1; inputIndex > 0; inputIndex -= 1) {
    code = parents[inputIndex][code];
    if (code < 0) {
      throw new Error('The hard 8-bit all-step optimizer produced an incomplete path.');
    }
    deviceCodes[inputIndex - 1] = code;
  }

  return deviceCodes;
}

export function expandHard8JndLevelsToInputMapping(
  selectedDeviceCodes: number[],
  inputLevelCount = 256,
): number[] {
  if (selectedDeviceCodes.length < 2) {
    throw new Error('At least two selected device codes are required.');
  }
  if (!Number.isInteger(inputLevelCount) || inputLevelCount < selectedDeviceCodes.length) {
    throw new Error('inputLevelCount must be an integer no smaller than the selected level count.');
  }

  return Array.from({ length: inputLevelCount }, (_, inputIndex) => {
    const selectedIndex = Math.round(
      (inputIndex * (selectedDeviceCodes.length - 1)) / (inputLevelCount - 1),
    );
    return selectedDeviceCodes[selectedIndex];
  });
}
