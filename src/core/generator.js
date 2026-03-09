import generatorProfile from "../../profiles/generatorProfile.json";
import { createPrng } from "./prng.js";

const OPERATION_POLICIES = {
  directSignedIntro: {
    id: "directSignedIntro",
    allowNegativeDisplay: true,
    allowFiveComplement: false,
    allowTenComplement: false,
    allowNestedFive: false,
    weights: {
      direct: 12,
      fiveComplement: 0,
      tenComplement: 0,
      tenComplementNestedFive: 0,
      zero: 0
    },
    leadingZeroPenalty: 0.45,
    zeroRatioMax: 0,
    negativeWeight: 3.2,
    negativeProblemChance: 0.42,
    maxNegativeCount: 1,
    negativeStartIndex: 1
  },
  directIntro: {
    id: "directIntro",
    allowNegativeDisplay: false,
    allowFiveComplement: false,
    allowTenComplement: false,
    allowNestedFive: false,
    weights: {
      direct: 12,
      fiveComplement: 0,
      tenComplement: 0,
      tenComplementNestedFive: 0,
      zero: 0.02
    },
    leadingZeroPenalty: 0.45,
    zeroRatioMax: 0.12
  },
  fiveIntro: {
    id: "fiveIntro",
    allowNegativeDisplay: false,
    allowFiveComplement: true,
    allowTenComplement: false,
    allowNestedFive: false,
    weights: {
      direct: 10,
      fiveComplement: 6,
      tenComplement: 0,
      tenComplementNestedFive: 0,
      zero: 0.08
    },
    leadingZeroPenalty: 0.5,
    zeroRatioMax: 0.18
  },
  singleDigitCarryIntro: {
    id: "singleDigitCarryIntro",
    allowNegativeDisplay: false,
    allowFiveComplement: true,
    allowTenComplement: true,
    allowNestedFive: false,
    weights: {
      direct: 8,
      fiveComplement: 5,
      tenComplement: 4.5,
      tenComplementNestedFive: 0,
      zero: 0.1
    },
    leadingZeroPenalty: 0.6,
    zeroRatioMax: 0.18
  },
  twoDigitCarryIntro: {
    id: "twoDigitCarryIntro",
    allowNegativeDisplay: false,
    allowFiveComplement: true,
    allowTenComplement: true,
    allowNestedFive: false,
    weights: {
      direct: 8,
      fiveComplement: 5,
      tenComplement: 5,
      tenComplementNestedFive: 0,
      zero: 0.14
    },
    leadingZeroPenalty: 0.62,
    zeroRatioMax: 0.26
  },
  twoDigitCarryMix: {
    id: "twoDigitCarryMix",
    allowNegativeDisplay: false,
    allowFiveComplement: true,
    allowTenComplement: true,
    allowNestedFive: true,
    weights: {
      direct: 7,
      fiveComplement: 6,
      tenComplement: 6,
      tenComplementNestedFive: 2.5,
      zero: 0.12
    },
    leadingZeroPenalty: 0.62,
    zeroRatioMax: 0.24
  },
  twoDigitAdvanced: {
    id: "twoDigitAdvanced",
    allowNegativeDisplay: false,
    allowFiveComplement: true,
    allowTenComplement: true,
    allowNestedFive: true,
    weights: {
      direct: 6.5,
      fiveComplement: 6,
      tenComplement: 6.5,
      tenComplementNestedFive: 3,
      zero: 0.1
    },
    leadingZeroPenalty: 0.64,
    zeroRatioMax: 0.22
  },
  threeDigitCarryIntro: {
    id: "threeDigitCarryIntro",
    allowNegativeDisplay: false,
    allowFiveComplement: true,
    allowTenComplement: true,
    allowNestedFive: true,
    weights: {
      direct: 6,
      fiveComplement: 5.5,
      tenComplement: 6.5,
      tenComplementNestedFive: 3,
      zero: 0.14
    },
    leadingZeroPenalty: 0.7,
    zeroRatioMax: 0.28
  },
  threeDigitCarryMix: {
    id: "threeDigitCarryMix",
    allowNegativeDisplay: false,
    allowFiveComplement: true,
    allowTenComplement: true,
    allowNestedFive: true,
    weights: {
      direct: 5.5,
      fiveComplement: 5.8,
      tenComplement: 7,
      tenComplementNestedFive: 3.4,
      zero: 0.12
    },
    leadingZeroPenalty: 0.72,
    zeroRatioMax: 0.26
  },
  threeDigitHighSpeed: {
    id: "threeDigitHighSpeed",
    allowNegativeDisplay: false,
    allowFiveComplement: true,
    allowTenComplement: true,
    allowNestedFive: true,
    weights: {
      direct: 5,
      fiveComplement: 5.5,
      tenComplement: 7.5,
      tenComplementNestedFive: 3.8,
      zero: 0.1
    },
    leadingZeroPenalty: 0.76,
    zeroRatioMax: 0.22
  },
  threeDigitMaster: {
    id: "threeDigitMaster",
    allowNegativeDisplay: false,
    allowFiveComplement: true,
    allowTenComplement: true,
    allowNestedFive: true,
    weights: {
      direct: 4.8,
      fiveComplement: 5.2,
      tenComplement: 8,
      tenComplementNestedFive: 4,
      zero: 0.08
    },
    leadingZeroPenalty: 0.8,
    zeroRatioMax: 0.2
  }
};

const SPECIAL_SIGNED_IMAGE_RULES = {
  kyu_20: {
    id: "signedImage20",
    minAbs: 1,
    maxAbs: 4,
    minNegativeCount: 1,
    maxNegativeCount: 2,
    finalMin: 0,
    finalMax: 4,
    runningMin: 0,
    runningMax: 9,
    firstValuePositive: true,
    finalZeroPenalty: 0.58
  },
  kyu_19: {
    id: "signedImage19",
    minAbs: 1,
    maxAbs: 5,
    minNegativeCount: 1,
    maxNegativeCount: 1,
    finalMin: 0,
    finalMax: 9,
    runningMin: 0,
    runningMax: 9,
    firstValuePositive: true
  },
  kyu_18: {
    id: "signedImage18",
    minAbs: 1,
    maxAbs: 9,
    minNegativeCount: 2,
    maxNegativeCount: 2,
    finalMin: 0,
    finalMax: 9,
    runningMin: 0,
    runningMax: 9,
    firstValuePositive: true
  },
  kyu_17: {
    id: "signedImage17",
    minAbs: 1,
    maxAbs: 9,
    minNegativeCount: 3,
    maxNegativeCount: 4,
    finalMin: 0,
    finalMax: 9,
    runningMin: 0,
    runningMax: 9,
    firstValuePositive: true
  }
};

function createNumbersSignature(numbers) {
  return numbers.join(",");
}

function createAbsoluteNumbersSignature(numbers) {
  return numbers.map((value) => Math.abs(value)).join(",");
}

function createAbsoluteNumbersBagSignature(numbers) {
  return numbers
    .map((value) => Math.abs(value))
    .sort((left, right) => left - right)
    .join(",");
}

function sumNumbers(numbers) {
  return numbers.reduce((total, value) => total + value, 0);
}

function countDigitRuns(numbers) {
  let longest = 1;
  let current = 1;

  for (let index = 1; index < numbers.length; index += 1) {
    const previousTail = numbers[index - 1] % 10;
    const currentTail = numbers[index] % 10;
    if (previousTail === currentTail) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

function splitDigits(value, digits) {
  return String(value).padStart(digits, "0").split("").map(Number);
}

function joinDigits(digits) {
  return Number(digits.join(""));
}

function getKyuRank(grade) {
  const match = grade.label.match(/^(\d+)級$/);
  return match ? Number(match[1]) : null;
}

function getDanRank(grade) {
  if (grade.label === "初段") {
    return 1;
  }
  const match = grade.label.match(/^(\d+)段$/);
  return match ? Number(match[1]) : null;
}

function getSpecialSignedImageRule(grade) {
  return SPECIAL_SIGNED_IMAGE_RULES[grade.id] ?? null;
}

function isSignedImageGrade(grade) {
  return Boolean(getSpecialSignedImageRule(grade));
}

function estimateAnswerDomainSize(grade) {
  const signedRule = getSpecialSignedImageRule(grade);
  if (signedRule) {
    return signedRule.finalMax - signedRule.finalMin + 1;
  }

  if (grade.mode === "image") {
    return Number("9".repeat(grade.digits)) + 1;
  }

  const timedMax = grade.count * (10 ** grade.digits - 1);
  return Math.max(timedMax + 1, 1);
}

function getOperationPolicy(grade) {
  if (grade.operationPolicyId && OPERATION_POLICIES[grade.operationPolicyId]) {
    return OPERATION_POLICIES[grade.operationPolicyId];
  }
  const kyuRank = getKyuRank(grade);
  const danRank = getDanRank(grade);

  if (grade.label === "20段") {
    return OPERATION_POLICIES.threeDigitMaster;
  }

  if (danRank !== null) {
    if (danRank <= 5) {
      return OPERATION_POLICIES.threeDigitCarryIntro;
    }
    if (danRank <= 10) {
      return OPERATION_POLICIES.threeDigitCarryMix;
    }
    return OPERATION_POLICIES.threeDigitHighSpeed;
  }

  if (kyuRank !== null) {
    if (kyuRank === 20) {
      return OPERATION_POLICIES.directSignedIntro;
    }
    if (kyuRank >= 19) {
      return OPERATION_POLICIES.directIntro;
    }
    if (kyuRank >= 17) {
      return OPERATION_POLICIES.fiveIntro;
    }
    if (kyuRank >= 13) {
      return OPERATION_POLICIES.singleDigitCarryIntro;
    }
    if (kyuRank >= 10) {
      return OPERATION_POLICIES.twoDigitCarryIntro;
    }
    if (kyuRank >= 6) {
      return OPERATION_POLICIES.twoDigitCarryMix;
    }
    return OPERATION_POLICIES.twoDigitAdvanced;
  }

  return OPERATION_POLICIES.twoDigitAdvanced;
}

export function isNoCarryGrade(grade) {
  return !getOperationPolicy(grade).allowTenComplement;
}

function getAccumulatorWidth(grade) {
  const maxAnswer = grade.count * (10 ** grade.digits - 1);
  return String(maxAnswer).length;
}

function weightedChoice(prng, items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    throw new Error("Weighted choice requires positive total weight");
  }

  let threshold = prng() * totalWeight;
  for (const item of items) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
}

function getWeightedOrder(prng, items) {
  const pool = [...items];
  const ordered = [];

  while (pool.length) {
    const choice = weightedChoice(prng, pool);
    ordered.push(choice);
    pool.splice(pool.indexOf(choice), 1);
  }

  return ordered;
}

function classifySubtractionOperation(currentDigit, subtractDigit) {
  if (subtractDigit === 0) {
    return "direct";
  }

  const oneBeads = currentDigit % 5;
  if (subtractDigit < 5) {
    return subtractDigit <= oneBeads ? "direct" : "fiveComplement";
  }

  return currentDigit >= 5 && subtractDigit - 5 <= oneBeads ? "direct" : "fiveComplement";
}

function classifyAdditionOperation(currentDigit, addDigit) {
  if (addDigit === 0) {
    return {
      family: "zero",
      carry: false,
      nestedFamily: null
    };
  }

  if (currentDigit + addDigit < 10) {
    if (currentDigit < 5 && addDigit < 5 && currentDigit + addDigit >= 5) {
      return {
        family: "fiveComplement",
        carry: false,
        nestedFamily: null
      };
    }

    return {
      family: "direct",
      carry: false,
      nestedFamily: null
    };
  }

  const complement = 10 - addDigit;
  return {
    family: "tenComplement",
    carry: true,
    nestedFamily: classifySubtractionOperation(currentDigit, complement),
    complement
  };
}

function getOperationKey(operation) {
  if (operation.family === "zero") {
    return "zero";
  }
  if (operation.family === "tenComplement" && operation.nestedFamily === "fiveComplement") {
    return "tenComplementNestedFive";
  }
  return operation.family;
}

function isAllowedOperation(operation, policy) {
  if (operation.family === "zero") {
    return true;
  }

  if (operation.family === "direct") {
    return true;
  }

  if (operation.family === "fiveComplement") {
    return policy.allowFiveComplement;
  }

  if (operation.family === "tenComplement") {
    if (!policy.allowTenComplement) {
      return false;
    }
    if (operation.nestedFamily === "fiveComplement" && !policy.allowNestedFive) {
      return false;
    }
    return true;
  }

  return false;
}

function getCandidateWeight({
  digit,
  operation,
  position,
  grade,
  policy,
  currentDigits,
  previousNumber
}) {
  const key = getOperationKey(operation);
  let weight = policy.weights[key] ?? 0.05;

  if (digit === 0 && currentDigits.every((value) => value === 0)) {
    weight *= 0.2;
  }

  if (position === grade.digits - 1 && digit === 0) {
    weight *= policy.leadingZeroPenalty;
  }

  if (previousNumber !== null) {
    const prevDigitAtPos = Math.floor(Math.abs(previousNumber) / (10 ** position)) % 10;
    if (digit === prevDigitAtPos && digit !== 0) {
      weight *= position === 0 ? 0.38 : 0.58;
    }
  }

  if (digit > 0) {
    weight *= 1 + Math.min(digit, 9) * 0.02;
  }

  return Math.max(weight, 0.01);
}

function analyzeOperationMix(numbers, grade) {
  const accumulatorWidth = getAccumulatorWidth(grade);
  const accumulator = Array.from({ length: accumulatorWidth }, () => 0);
  const counts = {
    directCount: 0,
    fiveComplementCount: 0,
    tenComplementCount: 0,
    tenComplementNestedFiveCount: 0,
    carryCount: 0,
    zeroDigitCount: 0,
    nonZeroDigitCount: 0,
    displayedDigitCount: 0,
    carryChainMax: 0
  };

  for (const number of numbers) {
    if (number < 0) {
      const subtractDigit = Math.abs(number);
      const operationFamily = classifySubtractionOperation(accumulator[0], subtractDigit);

      counts.displayedDigitCount += 1;
      counts.nonZeroDigitCount += 1;
      if (operationFamily === "direct") {
        counts.directCount += 1;
      } else {
        counts.fiveComplementCount += 1;
      }

      accumulator[0] -= subtractDigit;
      continue;
    }

    const digits = splitDigits(number, grade.digits).reverse();
    let carryIn = 0;
    let carryChain = 0;

    for (let position = 0; position < accumulatorWidth; position += 1) {
      let currentDigit = accumulator[position] + carryIn;
      let carryCascade = 0;
      if (currentDigit >= 10) {
        currentDigit -= 10;
        carryCascade = 1;
      }

      const addDigit = position < grade.digits ? digits[position] : 0;
      if (position < grade.digits) {
        const operation = classifyAdditionOperation(currentDigit, addDigit);
        const key = getOperationKey(operation);
        counts.displayedDigitCount += 1;

        if (addDigit === 0) {
          counts.zeroDigitCount += 1;
        } else {
          counts.nonZeroDigitCount += 1;
          if (key === "direct") {
            counts.directCount += 1;
          } else if (key === "fiveComplement") {
            counts.fiveComplementCount += 1;
          } else if (key === "tenComplement") {
            counts.tenComplementCount += 1;
            counts.carryCount += 1;
          } else if (key === "tenComplementNestedFive") {
            counts.tenComplementCount += 1;
            counts.tenComplementNestedFiveCount += 1;
            counts.carryCount += 1;
          }
        }
      }

      const raw = currentDigit + addDigit;
      accumulator[position] = raw % 10;
      carryIn = carryCascade || raw >= 10 ? 1 : 0;
      carryChain = carryIn ? carryChain + 1 : 0;
      counts.carryChainMax = Math.max(counts.carryChainMax, carryChain);

      if (position >= grade.digits && !carryIn) {
        break;
      }
    }
  }

  counts.zeroDigitRatio = counts.displayedDigitCount === 0 ? 0 : counts.zeroDigitCount / counts.displayedDigitCount;
  counts.operationScore =
    counts.directCount +
    counts.fiveComplementCount * 1.7 +
    counts.tenComplementCount * 2.6 +
    counts.tenComplementNestedFiveCount * 0.9;

  return counts;
}

function getDifficultyMeta(numbers, grade) {
  const answer = sumNumbers(numbers);
  const uniqueNumbers = new Set(numbers).size;
  const operationMix = analyzeOperationMix(numbers, grade);

  return {
    answer,
    uniqueNumbers,
    tailRunMax: countDigitRuns(numbers),
    operationMix
  };
}

function validateOperationProfile(operationMix, grade, policy) {
  const kyuRank = getKyuRank(grade);
  const danRank = getDanRank(grade);

  if (policy.id === "directIntro") {
    return operationMix.fiveComplementCount === 0 && operationMix.tenComplementCount === 0;
  }

  if (policy.id === "directSignedIntro") {
    return operationMix.fiveComplementCount === 0 && operationMix.tenComplementCount === 0;
  }

  if (policy.id === "fiveIntro") {
    return operationMix.tenComplementCount === 0 && operationMix.fiveComplementCount >= 1;
  }

  if (policy.id === "singleDigitCarryIntro") {
    return operationMix.tenComplementCount >= 1 && operationMix.zeroDigitRatio <= policy.zeroRatioMax;
  }

  if (policy.id === "twoDigitCarryIntro") {
    return operationMix.tenComplementCount >= 1 && operationMix.zeroDigitRatio <= policy.zeroRatioMax;
  }

  if (policy.id === "twoDigitCarryMix") {
    return operationMix.tenComplementCount >= 2 && operationMix.fiveComplementCount >= 1;
  }

  if (policy.id === "twoDigitAdvanced") {
    return operationMix.tenComplementCount >= 2 && operationMix.fiveComplementCount >= 2;
  }

  if (policy.id === "threeDigitCarryIntro") {
    return operationMix.tenComplementCount >= 1 && operationMix.zeroDigitRatio <= policy.zeroRatioMax;
  }

  if (policy.id === "threeDigitCarryMix") {
    return operationMix.tenComplementCount >= 2 && operationMix.zeroDigitRatio <= policy.zeroRatioMax;
  }

  if (policy.id === "threeDigitHighSpeed") {
    const minimumTenCount = danRank !== null && danRank >= 15 ? 4 : 3;
    return operationMix.tenComplementCount >= minimumTenCount && operationMix.zeroDigitRatio <= policy.zeroRatioMax;
  }

  if (policy.id === "threeDigitMaster") {
    return (
      operationMix.tenComplementCount >= 4 &&
      operationMix.tenComplementNestedFiveCount >= 1 &&
      operationMix.zeroDigitRatio <= policy.zeroRatioMax
    );
  }

  if (kyuRank !== null) {
    return operationMix.zeroDigitRatio <= policy.zeroRatioMax;
  }

  return true;
}

function validateDifficultyBand(numbers, grade, familyConfig, meta, policy) {
  const answer = meta.answer;
  const maximum = policy.allowTenComplement
    ? grade.count * (10 ** grade.digits - 1)
    : Number("9".repeat(grade.digits));
  const normalized = maximum === 0 ? 0 : answer / maximum;
  const maxPatternRun = familyConfig.rejectionRules?.maxPatternRun ?? Infinity;

  if (meta.tailRunMax > maxPatternRun) {
    return false;
  }

  if (!validateOperationProfile(meta.operationMix, grade, policy)) {
    return false;
  }

  if (policy.id === "directIntro") {
    return normalized >= 0.15 && normalized <= 1;
  }

  if (policy.id === "directSignedIntro") {
    return normalized >= 0 && normalized <= 1;
  }

  if (policy.id === "fiveIntro") {
    return normalized >= 0.18 && normalized <= 1;
  }

  if (policy.id === "singleDigitCarryIntro") {
    return normalized >= 0.22 && normalized <= 0.92;
  }

  if (grade.label === "20段") {
    return normalized >= 0.22 && normalized <= 0.78;
  }

  if (grade.mode === "timed") {
    return normalized >= 0.12 && normalized <= 0.92;
  }

  return true;
}

function createNoTenNumber(prng, grade, policy, accumulator, existingNumbers) {
  const nextAccumulator = accumulator.slice();
  const digits = [];
  const previousNumber = existingNumbers.length ? existingNumbers[existingNumbers.length - 1] : null;

  for (let position = 0; position < grade.digits; position += 1) {
    const currentDigit = nextAccumulator[position];
    const maxDigit = 9 - currentDigit;
    const candidates = [];

    for (let digit = 0; digit <= maxDigit; digit += 1) {
      const operation = classifyAdditionOperation(currentDigit, digit);
      if (!isAllowedOperation(operation, policy)) {
        continue;
      }

      candidates.push({
        digit,
        operation,
        weight: getCandidateWeight({
          digit,
          operation,
          position,
          grade,
          policy,
          currentDigits: digits,
          previousNumber
        })
      });
    }

    if (!candidates.length) {
      return null;
    }

    const choice = weightedChoice(prng, candidates);
    digits[position] = choice.digit;
    nextAccumulator[position] += choice.digit;
  }

  if (digits.every((digit) => digit === 0)) {
    return null;
  }

  const remainingQuestions = grade.count - existingNumbers.length - 1;
  const remainingSlack = nextAccumulator.slice(0, grade.digits).reduce((sum, digit) => sum + (9 - digit), 0);
  if (remainingSlack < remainingQuestions) {
    return null;
  }

  return {
    value: joinDigits([...digits].reverse()),
    nextAccumulator,
    zeroDigits: digits.filter((digit) => digit === 0).length
  };
}

function createSingleDigitNoTenNumbers(prng, grade, policy, familyConfig) {
  const maxPatternRun = familyConfig.rejectionRules?.maxPatternRun ?? Infinity;
  const numbers = [];
  const requiresFiveComplement = policy.id === "fiveIntro";

  function backtrack(currentDigit, usedFiveComplement) {
    if (numbers.length === grade.count) {
      return !requiresFiveComplement || usedFiveComplement;
    }

    if (requiresFiveComplement && !usedFiveComplement && currentDigit >= 5) {
      return false;
    }

    const previousNumber = numbers.length ? numbers[numbers.length - 1] : null;
    const candidates = [];

    for (let digit = 1; digit <= 9 - currentDigit; digit += 1) {
      const operation = classifyAdditionOperation(currentDigit, digit);
      if (!isAllowedOperation(operation, policy)) {
        continue;
      }

      const nextNumbers = [...numbers, digit];
      if (countDigitRuns(nextNumbers) > maxPatternRun) {
        continue;
      }

      candidates.push({
        digit,
        operation,
        weight: getCandidateWeight({
          digit,
          operation,
          position: 0,
          grade,
          policy,
          currentDigits: [],
          previousNumber
        })
      });
    }

    for (const candidate of getWeightedOrder(prng, candidates)) {
      numbers.push(candidate.digit);
      const nextUsedFiveComplement =
        usedFiveComplement || getOperationKey(candidate.operation) === "fiveComplement";

      if (backtrack(currentDigit + candidate.digit, nextUsedFiveComplement)) {
        return true;
      }

      numbers.pop();
    }

    return false;
  }

  if (!backtrack(0, false)) {
    throw new Error(`Failed to build no-ten sequence for ${grade.label}`);
  }

  return numbers;
}

function createSingleDigitSignedDirectNumbers(prng, grade, policy, familyConfig) {
  const maxPatternRun = familyConfig.rejectionRules?.maxPatternRun ?? Infinity;
  const numbers = [];
  const wantsNegative = prng() < (policy.negativeProblemChance ?? 0.5);
  const maxNegativeCount = policy.maxNegativeCount ?? 1;
  const negativeStartIndex = policy.negativeStartIndex ?? 0;

  function backtrack(currentDigit, negativeCount) {
    if (numbers.length === grade.count) {
      return currentDigit >= 0 && currentDigit <= 9 && (!wantsNegative || negativeCount > 0);
    }

    const previousNumber = numbers.length ? numbers[numbers.length - 1] : null;
    const candidates = [];

    for (let digit = 1; digit <= 9 - currentDigit; digit += 1) {
      const operation = classifyAdditionOperation(currentDigit, digit);
      if (!isAllowedOperation(operation, policy)) {
        continue;
      }

      const nextNumbers = [...numbers, digit];
      if (countDigitRuns(nextNumbers) > maxPatternRun) {
        continue;
      }

      candidates.push({
        value: digit,
        weight: getCandidateWeight({
          digit,
          operation,
          position: 0,
          grade,
          policy,
          currentDigits: [],
          previousNumber
        })
      });
    }

    const canUseNegative =
      numbers.length >= negativeStartIndex &&
      negativeCount < maxNegativeCount &&
      (wantsNegative || prng() < 0.12);

    if (canUseNegative) {
      for (let digit = 1; digit <= currentDigit; digit += 1) {
        const operationFamily = classifySubtractionOperation(currentDigit, digit);
        if (operationFamily !== "direct") {
          continue;
        }

        const value = -digit;
        const nextNumbers = [...numbers, value];
        if (countDigitRuns(nextNumbers) > maxPatternRun) {
          continue;
        }

        candidates.push({
          value,
          weight: Math.max(policy.negativeWeight ?? 1, 0.1)
        });
      }
    }

    for (const candidate of getWeightedOrder(prng, candidates)) {
      numbers.push(candidate.value);
      const nextNegativeCount = negativeCount + (candidate.value < 0 ? 1 : 0);
      if (backtrack(currentDigit + candidate.value, nextNegativeCount)) {
        return true;
      }
      numbers.pop();
    }

    return false;
  }

  if (!backtrack(0, 0)) {
    throw new Error(`Failed to build signed direct sequence for ${grade.label}`);
  }

  return numbers;
}

function canReachTargetTotal({
  currentTotal,
  remainingSlots,
  remainingNegativeSlots,
  minAbs,
  maxAbs,
  finalMin,
  finalMax
}) {
  const positiveSlots = remainingSlots - remainingNegativeSlots;
  const minimumReachable = currentTotal + positiveSlots * minAbs - remainingNegativeSlots * maxAbs;
  const maximumReachable = currentTotal + positiveSlots * maxAbs - remainingNegativeSlots * minAbs;

  return maximumReachable >= finalMin && minimumReachable <= finalMax;
}

function createSignedImageNumbersByRule(prng, grade, familyConfig, rule) {
  const maxPatternRun = familyConfig.rejectionRules?.maxPatternRun ?? Infinity;
  const negativeOptions = [];
  for (let count = rule.minNegativeCount; count <= rule.maxNegativeCount; count += 1) {
    negativeOptions.push({
      value: count,
      weight: count === rule.minNegativeCount ? 1.25 : 1
    });
  }
  const targetNegativeCount = weightedChoice(prng, negativeOptions).value;
  const numbers = [];

  function backtrack(currentTotal, negativeCount) {
    if (numbers.length === grade.count) {
      return (
        negativeCount === targetNegativeCount &&
        currentTotal >= rule.finalMin &&
        currentTotal <= rule.finalMax
      );
    }

    const remainingSlots = grade.count - numbers.length;
    const remainingNegativeSlots = targetNegativeCount - negativeCount;
    if (remainingNegativeSlots < 0 || remainingNegativeSlots > remainingSlots) {
      return false;
    }

    const previousNumber = numbers.length ? numbers[numbers.length - 1] : null;
    const candidates = [];
    const canUseNegative = remainingNegativeSlots > 0;
    const mustUseNegative = remainingNegativeSlots === remainingSlots;
    const canUsePositive = !mustUseNegative;

    if (canUsePositive) {
      for (let digit = rule.minAbs; digit <= rule.maxAbs; digit += 1) {
        const nextTotal = currentTotal + digit;
        if (nextTotal < rule.runningMin || nextTotal > rule.runningMax) {
          continue;
        }

        if (
          !canReachTargetTotal({
            currentTotal: nextTotal,
            remainingSlots: remainingSlots - 1,
            remainingNegativeSlots,
            minAbs: rule.minAbs,
            maxAbs: rule.maxAbs,
            finalMin: rule.finalMin,
            finalMax: rule.finalMax
          })
        ) {
          continue;
        }

        const nextNumbers = [...numbers, digit];
        if (countDigitRuns(nextNumbers) > maxPatternRun) {
          continue;
        }

        const operation = classifyAdditionOperation(currentTotal, digit);
        let weight = getCandidateWeight({
          digit,
          operation,
          position: 0,
          grade,
          policy: {
            ...OPERATION_POLICIES.directSignedIntro,
            zeroRatioMax: 0
          },
          currentDigits: [],
          previousNumber
        });

        if (remainingSlots === 1 && nextTotal === 0) {
          weight *= rule.finalZeroPenalty ?? 1;
        }

        candidates.push({
          value: digit,
          weight
        });
      }
    }

    if (canUseNegative && (!rule.firstValuePositive || numbers.length > 0)) {
      for (let digit = rule.minAbs; digit <= rule.maxAbs; digit += 1) {
        const nextTotal = currentTotal - digit;
        if (nextTotal < rule.runningMin || nextTotal > rule.runningMax) {
          continue;
        }

        if (
          !canReachTargetTotal({
            currentTotal: nextTotal,
            remainingSlots: remainingSlots - 1,
            remainingNegativeSlots: remainingNegativeSlots - 1,
            minAbs: rule.minAbs,
            maxAbs: rule.maxAbs,
            finalMin: rule.finalMin,
            finalMax: rule.finalMax
          })
        ) {
          continue;
        }

        const value = -digit;
        const nextNumbers = [...numbers, value];
        if (countDigitRuns(nextNumbers) > maxPatternRun) {
          continue;
        }

        let weight = Math.max(1.4 - negativeCount * 0.1, 0.45);
        if (remainingSlots === 1 && nextTotal === 0) {
          weight *= rule.finalZeroPenalty ?? 1;
        }

        candidates.push({
          value,
          weight
        });
      }
    }

    for (const candidate of getWeightedOrder(prng, candidates)) {
      numbers.push(candidate.value);
      const nextNegativeCount = negativeCount + (candidate.value < 0 ? 1 : 0);
      if (backtrack(currentTotal + candidate.value, nextNegativeCount)) {
        return true;
      }
      numbers.pop();
    }

    return false;
  }

  if (!backtrack(0, 0)) {
    throw new Error(`Failed to build signed image sequence for ${grade.label}`);
  }

  return {
    templateId: rule.id,
    numbers,
    policyId: rule.id
  };
}

function createCarryAwareNumber(prng, grade, policy, accumulator, existingNumbers) {
  const nextAccumulator = accumulator.slice();
  const digits = [];
  const previousNumber = existingNumbers.length ? existingNumbers[existingNumbers.length - 1] : null;
  let carryIn = 0;

  for (let position = 0; position < grade.digits; position += 1) {
    let currentDigit = nextAccumulator[position] + carryIn;
    let carryCascade = 0;

    if (currentDigit >= 10) {
      currentDigit -= 10;
      carryCascade = 1;
    }

    const candidates = [];
    for (let digit = 0; digit <= 9; digit += 1) {
      const operation = classifyAdditionOperation(currentDigit, digit);
      if (!isAllowedOperation(operation, policy)) {
        continue;
      }

      candidates.push({
        digit,
        operation,
        carryCascade,
        weight: getCandidateWeight({
          digit,
          operation,
          position,
          grade,
          policy,
          currentDigits: digits,
          previousNumber
        })
      });
    }

    if (!candidates.length) {
      return null;
    }

    const choice = weightedChoice(prng, candidates);
    digits[position] = choice.digit;

    const raw = currentDigit + choice.digit;
    nextAccumulator[position] = raw % 10;
    carryIn = choice.carryCascade || raw >= 10 ? 1 : 0;
  }

  if (digits.every((digit) => digit === 0)) {
    return null;
  }

  let carryPosition = grade.digits;
  while (carryIn && carryPosition < nextAccumulator.length) {
    const raw = nextAccumulator[carryPosition] + 1;
    nextAccumulator[carryPosition] = raw % 10;
    carryIn = raw >= 10 ? 1 : 0;
    carryPosition += 1;
  }

  return {
    value: joinDigits([...digits].reverse()),
    nextAccumulator,
    zeroDigits: digits.filter((digit) => digit === 0).length
  };
}

function generateOperationAwareNumbers(prng, grade, familyConfig, policy) {
  if (policy.allowNegativeDisplay && grade.digits === 1) {
    return createSingleDigitSignedDirectNumbers(prng, grade, policy, familyConfig);
  }

  if (!policy.allowTenComplement && grade.digits === 1) {
    return createSingleDigitNoTenNumbers(prng, grade, policy, familyConfig);
  }

  let accumulator = Array.from({ length: getAccumulatorWidth(grade) }, () => 0);
  const numbers = [];

  for (let numberIndex = 0; numberIndex < grade.count; numberIndex += 1) {
    let accepted = null;

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const candidate = policy.allowTenComplement
        ? createCarryAwareNumber(prng, grade, policy, accumulator, numbers)
        : createNoTenNumber(prng, grade, policy, accumulator, numbers);

      if (!candidate) {
        continue;
      }

      const nextNumbers = [...numbers, candidate.value];
      const maxPatternRun = familyConfig.rejectionRules?.maxPatternRun ?? Infinity;
      if (countDigitRuns(nextNumbers) > maxPatternRun) {
        continue;
      }

      if (candidate.zeroDigits / grade.digits > policy.zeroRatioMax) {
        continue;
      }

      if (grade.digits >= 3 && numbers.length > 0) {
        const prevNum = numbers[numbers.length - 1];
        const newDigitsArr = splitDigits(candidate.value, grade.digits);
        const prevDigitsArr = splitDigits(Math.abs(prevNum), grade.digits);
        const nonZeroMatchCount = newDigitsArr.filter((d, i) => d !== 0 && d === prevDigitsArr[i]).length;
        if (nonZeroMatchCount >= grade.digits - 1) {
          continue;
        }
      }

      accepted = candidate;
      break;
    }

    if (!accepted) {
      throw new Error(`Failed to build operation-aware number for ${grade.label}`);
    }

    accumulator = accepted.nextAccumulator;
    numbers.push(accepted.value);
  }

  return numbers;
}

function generateNumbersForGrade(prng, grade) {
  const familyConfig = generatorProfile.families[grade.generatorFamily];
  const specialSignedImageRule = getSpecialSignedImageRule(grade);
  if (specialSignedImageRule) {
    return createSignedImageNumbersByRule(prng, grade, familyConfig, specialSignedImageRule);
  }
  const policy = getOperationPolicy(grade);
  const numbers = generateOperationAwareNumbers(prng, grade, familyConfig, policy);

  return {
    templateId: policy.id,
    numbers,
    policyId: policy.id
  };
}

function buildProblem({ grade, practiceMode, seed, problemIndex, rootSeed = seed, variantIndex = 0 }) {
  const prng = createPrng(`${seed}:${problemIndex}:${variantIndex}:${grade.id}:${practiceMode}`);
  const familyConfig = generatorProfile.families[grade.generatorFamily];
  const policy = getOperationPolicy(grade);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const { templateId, numbers, policyId } = generateNumbersForGrade(prng, grade);
    const meta = getDifficultyMeta(numbers, grade);

    if (!validateDifficultyBand(numbers, grade, familyConfig, meta, policy)) {
      continue;
    }

    return {
      id: `${grade.id}:${problemIndex}`,
      rootSeed,
      seed: `${rootSeed}:${problemIndex}:v${variantIndex}`,
      problemIndex,
      gradeId: grade.id,
      gradeLabel: grade.label,
      practiceMode,
      family: grade.generatorFamily,
      templateId,
      policyId,
      digits: grade.digits,
      count: grade.count,
      numbers,
      answer: meta.answer,
      meta
    };
  }

  throw new Error(`Failed to generate valid problem for ${grade.label}`);
}

function getProblemVarietyPenalty(existingProblems, candidateProblem, grade, questionCount) {
  const answerCount =
    existingProblems.filter((problem) => problem.answer === candidateProblem.answer).length + 1;
  const repeatedFirstValueCount =
    existingProblems.filter((problem) => problem.numbers[0] === candidateProblem.numbers[0]).length + 1;
  const repeatedFirstAbsoluteValueCount =
    existingProblems.filter((problem) => Math.abs(problem.numbers[0]) === Math.abs(candidateProblem.numbers[0])).length + 1;
  const repeatedLastValueCount =
    existingProblems.filter((problem) => problem.numbers.at(-1) === candidateProblem.numbers.at(-1)).length + 1;
  const zeroAnswerCount =
    existingProblems.filter((problem) => problem.answer === 0).length + (candidateProblem.answer === 0 ? 1 : 0);
  const signature = createNumbersSignature(candidateProblem.numbers);
  const absoluteSignature = createAbsoluteNumbersSignature(candidateProblem.numbers);
  const absoluteBagSignature = createAbsoluteNumbersBagSignature(candidateProblem.numbers);
  const repeatedExactSequence = existingProblems.some(
    (problem) => createNumbersSignature(problem.numbers) === signature
  );
  const repeatedAbsoluteSequence = existingProblems.some(
    (problem) => createAbsoluteNumbersSignature(problem.numbers) === absoluteSignature
  );
  const repeatedAbsoluteBag = existingProblems.some(
    (problem) => createAbsoluteNumbersBagSignature(problem.numbers) === absoluteBagSignature
  );
  const recentProblems = existingProblems.slice(-2);
  const lastProblem = existingProblems.at(-1) ?? null;
  const answerTriple =
    recentProblems.length === 2 &&
    recentProblems.every((problem) => problem.answer === candidateProblem.answer);
  const repeatedConsecutiveAnswer = lastProblem?.answer === candidateProblem.answer;
  const answerDomainSize = estimateAnswerDomainSize(grade);
  const maxRepeatedAnswerCount = Math.max(2, Math.ceil(questionCount / Math.min(answerDomainSize, questionCount)));

  let crossBoundaryDigitMatchPenalty = 0;
  if (grade.digits >= 3 && lastProblem) {
    const prevLastNum = lastProblem.numbers.at(-1);
    const candFirstNum = candidateProblem.numbers[0];
    if (prevLastNum != null && candFirstNum != null) {
      const prevDigArr = splitDigits(Math.abs(prevLastNum), grade.digits);
      const candDigArr = splitDigits(Math.abs(candFirstNum), grade.digits);
      const crossMatchCount = candDigArr.filter((d, i) => d !== 0 && d === prevDigArr[i]).length;
      if (crossMatchCount >= grade.digits - 1) {
        crossBoundaryDigitMatchPenalty = 130;
      }
    }
  }

  let penalty = crossBoundaryDigitMatchPenalty;

  if (repeatedExactSequence) {
    penalty += 1000;
  }
  if (repeatedAbsoluteSequence) {
    penalty += 800;
  }
  if (repeatedAbsoluteBag) {
    penalty += 540;
  }
  if (answerTriple) {
    penalty += 320;
  }

  if (isSignedImageGrade(grade)) {
    const maxZeroAnswerCount = Math.max(1, Math.floor(questionCount / 5));
    penalty += (answerCount - 1) * 26;
    penalty += Math.max(0, repeatedFirstValueCount - 1) * 10;
    penalty += Math.max(0, repeatedFirstAbsoluteValueCount - 1) * 6;
    penalty += Math.max(0, repeatedLastValueCount - 1) * 8;
    if (repeatedConsecutiveAnswer) {
      penalty += 180;
    }
    if (zeroAnswerCount > maxZeroAnswerCount) {
      penalty += 260 * (zeroAnswerCount - maxZeroAnswerCount);
    }
    if (answerCount > maxRepeatedAnswerCount) {
      penalty += 140 * (answerCount - maxRepeatedAnswerCount);
    }
  } else {
    penalty += (answerCount - 1) * 14;
    penalty += Math.max(0, repeatedFirstValueCount - 1) * 6;
    penalty += Math.max(0, repeatedFirstAbsoluteValueCount - 1) * 4;
    penalty += Math.max(0, repeatedLastValueCount - 1) * 5;
    if (repeatedConsecutiveAnswer) {
      penalty += 140;
    }
    if (answerCount > maxRepeatedAnswerCount) {
      penalty += 110 * (answerCount - maxRepeatedAnswerCount);
    }
  }

  return penalty;
}

export function generateProblemSet({ grade, practiceMode, seed, questionCount = 10 }) {
  const problemSet = [];
  const maxVariants = grade.id === "kyu_20" ? 384 : isSignedImageGrade(grade) ? 192 : grade.mode === "timed" ? 64 : 48;

  for (let problemIndex = 0; problemIndex < questionCount; problemIndex += 1) {
    let acceptedProblem = null;
    let fallbackProblem = null;
    let fallbackPenalty = Number.POSITIVE_INFINITY;

    for (let variantIndex = 0; variantIndex < maxVariants; variantIndex += 1) {
      const candidateProblem = buildProblem({
        grade,
        practiceMode,
        seed,
        problemIndex,
        rootSeed: seed,
        variantIndex
      });

      const penalty = getProblemVarietyPenalty(problemSet, candidateProblem, grade, questionCount);
      if (penalty < fallbackPenalty) {
        fallbackPenalty = penalty;
        fallbackProblem = candidateProblem;
      }

      if (penalty > 0) {
        continue;
      }

      acceptedProblem = candidateProblem;
      break;
    }

    problemSet.push(acceptedProblem ?? fallbackProblem);
  }

  return problemSet;
}

export function replayProblemSet({ grade, practiceMode, seed, questionCount = 10 }) {
  return generateProblemSet({ grade, practiceMode, seed, questionCount });
}

export function createReplayPayload(problemSet) {
  if (!problemSet.length) {
    throw new Error("Problem set is empty");
  }

  return {
    seed: problemSet[0].rootSeed,
    gradeId: problemSet[0].gradeId,
    practiceMode: problemSet[0].practiceMode,
    questionCount: problemSet.length
  };
}
