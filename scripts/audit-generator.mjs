import gradeProfile from "../profiles/gradeProfile.json";
import { generateProblemSet } from "../src/core/generator.js";

const FOCUS_GRADE_THRESHOLDS = {
  "20級": { minUniqueAnswers: 5, maxZeroRate: 0.24, maxTopPatternCount: 28 },
  "19級": { minUniqueAnswers: 6, maxZeroRate: 0.05, maxTopPatternCount: 24 },
  "18級": { minUniqueAnswers: 7, maxZeroRate: 0.05, maxTopPatternCount: 12 },
  "17級": { minUniqueAnswers: 7, maxZeroRate: 0.05, maxTopPatternCount: 3 }
};

function sampleGrade(grade) {
  const practiceMode = grade.mode === "image" ? "display" : "input";
  const seeds = Array.from({ length: 50 }, (_, index) => `audit-${grade.id}-${index}`);
  let zeroAnswers = 0;
  let totalProblems = 0;
  let consecutiveAnswerRepeats = 0;
  let exactDupWithinSets = 0;
  let absDupWithinSets = 0;
  let bagDupWithinSets = 0;
  const answerCounts = new Map();
  const numberCounts = new Map();

  for (const seed of seeds) {
    const problems = generateProblemSet({ grade, practiceMode, seed, questionCount: 10 });
    const exactSet = new Set();
    const absSet = new Set();
    const bagSet = new Set();

    for (let index = 0; index < problems.length; index += 1) {
      const problem = problems[index];
      totalProblems += 1;
      if (problem.answer === 0) zeroAnswers += 1;

      answerCounts.set(problem.answer, (answerCounts.get(problem.answer) ?? 0) + 1);

      const exact = problem.numbers.join(",");
      const absolute = problem.numbers.map((value) => Math.abs(value)).join(",");
      const bag = [...problem.numbers]
        .map((value) => Math.abs(value))
        .sort((left, right) => left - right)
        .join(",");
      numberCounts.set(exact, (numberCounts.get(exact) ?? 0) + 1);

      if (exactSet.has(exact)) exactDupWithinSets += 1;
      if (absSet.has(absolute)) absDupWithinSets += 1;
      if (bagSet.has(bag)) bagDupWithinSets += 1;

      exactSet.add(exact);
      absSet.add(absolute);
      bagSet.add(bag);

      if (index > 0 && problems[index - 1].answer === problem.answer) {
        consecutiveAnswerRepeats += 1;
      }
    }
  }

  return {
    label: grade.label,
    zeroRate: Number((zeroAnswers / totalProblems).toFixed(3)),
    consecutiveAnswerRepeats,
    exactDupWithinSets,
    absDupWithinSets,
    bagDupWithinSets,
    uniqueAnswerCount: answerCounts.size,
    topAnswers: [...answerCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5),
    topNumbers: [...numberCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3)
  };
}

const results = gradeProfile.grades.map(sampleGrade);
const lowerFocus = results.filter((result) => Object.hasOwn(FOCUS_GRADE_THRESHOLDS, result.label));
const breaches = lowerFocus.flatMap((result) => {
  const threshold = FOCUS_GRADE_THRESHOLDS[result.label];
  const issues = [];

  if (result.consecutiveAnswerRepeats > 0) {
    issues.push(`${result.label}: consecutive answers repeated (${result.consecutiveAnswerRepeats})`);
  }
  if (result.exactDupWithinSets > 0 || result.absDupWithinSets > 0 || result.bagDupWithinSets > 0) {
    issues.push(
      `${result.label}: duplicate sequences detected (exact=${result.exactDupWithinSets}, abs=${result.absDupWithinSets}, bag=${result.bagDupWithinSets})`
    );
  }
  if (result.uniqueAnswerCount < threshold.minUniqueAnswers) {
    issues.push(`${result.label}: answer variety too low (${result.uniqueAnswerCount} < ${threshold.minUniqueAnswers})`);
  }
  if (result.zeroRate > threshold.maxZeroRate) {
    issues.push(`${result.label}: zero rate too high (${result.zeroRate} > ${threshold.maxZeroRate})`);
  }
  if ((result.topNumbers[0]?.[1] ?? 0) > threshold.maxTopPatternCount) {
    issues.push(`${result.label}: top pattern repeats too often (${result.topNumbers[0][1]} > ${threshold.maxTopPatternCount})`);
  }

  return issues;
});

const report = {
  focus: results.filter((result) =>
    ["20級", "19級", "18級", "17級", "16級", "10級", "初段", "10段", "15段", "20段"].includes(result.label)
  ),
  lowerFocus,
  worstZero: [...results].sort((left, right) => right.zeroRate - left.zeroRate).slice(0, 8),
  lowestAnswerVariety: [...results].sort((left, right) => left.uniqueAnswerCount - right.uniqueAnswerCount).slice(0, 8),
  dupes: [...results].filter(
    (result) =>
      result.consecutiveAnswerRepeats > 0 ||
      result.exactDupWithinSets > 0 ||
      result.absDupWithinSets > 0 ||
      result.bagDupWithinSets > 0
  )
};

console.log(JSON.stringify(report, null, 2));

if (breaches.length > 0) {
  console.error("\nGenerator audit failed:\n" + breaches.map((issue) => `- ${issue}`).join("\n"));
  process.exitCode = 1;
}
