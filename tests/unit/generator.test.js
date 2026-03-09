import { describe, expect, it } from "vitest";
import gradeProfile from "../../profiles/gradeProfile.json";
import {
  createReplayPayload,
  generateProblemSet,
  isNoCarryGrade,
  replayProblemSet
} from "../../src/core/generator.js";

function getGrade(label) {
  return gradeProfile.grades.find((grade) => grade.label === label);
}

describe("generator", () => {
  it("is deterministic for identical seed and inputs", () => {
    const grade = getGrade("10級");
    const first = generateProblemSet({ grade, practiceMode: "input", seed: "seed-1", questionCount: 3 });
    const second = replayProblemSet({ grade, practiceMode: "input", seed: "seed-1", questionCount: 3 });
    expect(second).toEqual(first);
  });

  it("changes output when seed changes", () => {
    const grade = getGrade("10級");
    const first = generateProblemSet({ grade, practiceMode: "input", seed: "seed-1", questionCount: 1 });
    const second = generateProblemSet({ grade, practiceMode: "input", seed: "seed-2", questionCount: 1 });
    expect(second[0].numbers).not.toEqual(first[0].numbers);
  });

  it("keeps 20級 within 1〜4 digits, 3口, 1〜2回の引き算, and final answer 0〜4", () => {
    const grade = getGrade("20級");
    const problems = generateProblemSet({ grade, practiceMode: "display", seed: "img-seed", questionCount: 8 });

    for (const problem of problems) {
      expect(problem.family).toBe("imageFoundation");
      expect(problem.policyId).toBe("signedImage20");
      expect(problem.numbers).toHaveLength(grade.count);
      expect(problem.numbers.every((value) => Math.abs(value) >= 1 && Math.abs(value) <= 4)).toBe(true);
      const negativeCount = problem.numbers.filter((value) => value < 0).length;
      expect(negativeCount).toBeGreaterThanOrEqual(1);
      expect(negativeCount).toBeLessThanOrEqual(2);
      expect(problem.answer).toBeGreaterThanOrEqual(0);
      expect(problem.answer).toBeLessThanOrEqual(4);
    }
  });

  it("reduces zero-answer bias and duplicate patterns in 20級 sets", () => {
    const grade = getGrade("20級");
    const problems = generateProblemSet({ grade, practiceMode: "display", seed: "img-variety", questionCount: 10 });
    const zeroAnswers = problems.filter((problem) => problem.answer === 0).length;
    const signatures = problems.map((problem) => problem.numbers.join(","));
    const absoluteSignatures = problems.map((problem) => problem.numbers.map((value) => Math.abs(value)).join(","));

    expect(zeroAnswers).toBeLessThanOrEqual(2);
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(new Set(absoluteSignatures).size).toBe(absoluteSignatures.length);
  });

  it("treats only 19級〜17級 as no-carry grades after operation analysis", () => {
    expect(isNoCarryGrade(getGrade("20級"))).toBe(true);
    expect(isNoCarryGrade(getGrade("17級"))).toBe(true);
    expect(isNoCarryGrade(getGrade("16級"))).toBe(false);
    expect(isNoCarryGrade(getGrade("13級"))).toBe(false);
  });

  it("keeps 19級 within 1〜5 digits, 3口, exactly 1 subtraction, and final answer under 10", () => {
    const grade = getGrade("19級");
    const problems = generateProblemSet({ grade, practiceMode: "display", seed: "signed-19", questionCount: 8 });

    for (const problem of problems) {
      expect(problem.policyId).toBe("signedImage19");
      expect(problem.numbers).toHaveLength(grade.count);
      expect(problem.numbers.every((value) => Math.abs(value) >= 1 && Math.abs(value) <= 5)).toBe(true);
      expect(problem.numbers.filter((value) => value < 0)).toHaveLength(1);
      expect(problem.answer).toBeGreaterThanOrEqual(0);
      expect(problem.answer).toBeLessThanOrEqual(9);
    }
  });

  it("keeps 18級 within 1〜9 digits, 5口, exactly 2 subtractions, and final answer under 10", () => {
    const grade = getGrade("18級");
    const problems = generateProblemSet({ grade, practiceMode: "display", seed: "five-seed", questionCount: 5 });

    for (const problem of problems) {
      expect(problem.policyId).toBe("signedImage18");
      expect(problem.numbers).toHaveLength(grade.count);
      expect(problem.numbers.every((value) => Math.abs(value) >= 1 && Math.abs(value) <= 9)).toBe(true);
      expect(problem.numbers.filter((value) => value < 0)).toHaveLength(2);
      expect(problem.answer).toBeGreaterThanOrEqual(0);
      expect(problem.answer).toBeLessThanOrEqual(9);
    }
  });

  it("keeps 17級 within 1〜9 digits, 8口, 3〜4 subtractions, and final answer under 10", () => {
    const grade = getGrade("17級");
    const problems = generateProblemSet({ grade, practiceMode: "input", seed: "signed-17", questionCount: 5 });

    for (const problem of problems) {
      expect(problem.policyId).toBe("signedImage17");
      expect(problem.numbers).toHaveLength(grade.count);
      expect(problem.numbers.every((value) => Math.abs(value) >= 1 && Math.abs(value) <= 9)).toBe(true);
      const negativeCount = problem.numbers.filter((value) => value < 0).length;
      expect(negativeCount).toBeGreaterThanOrEqual(3);
      expect(negativeCount).toBeLessThanOrEqual(4);
      expect(problem.answer).toBeGreaterThanOrEqual(0);
      expect(problem.answer).toBeLessThanOrEqual(9);
    }
  });

  it("avoids repeated consecutive answers and overused zero answers in signed image grades", () => {
    for (const label of ["20級", "19級", "18級", "17級"]) {
      const grade = getGrade(label);
      const problems = generateProblemSet({ grade, practiceMode: "display", seed: `variety-${grade.id}`, questionCount: 10 });
      const zeroAnswers = problems.filter((problem) => problem.answer === 0).length;

      expect(zeroAnswers).toBeLessThanOrEqual(2);

      for (let index = 1; index < problems.length; index += 1) {
        expect(problems[index].answer).not.toBe(problems[index - 1].answer);
      }
    }
  });

  it("avoids repeated consecutive answers and duplicate number sequences across all grades", () => {
    for (const grade of gradeProfile.grades) {
      const practiceMode = grade.mode === "image" ? "display" : "input";
      const problems = generateProblemSet({
        grade,
        practiceMode,
        seed: `global-variety-${grade.id}`,
        questionCount: 10
      });
      const exactSignatures = problems.map((problem) => problem.numbers.join(","));
      const absoluteSignatures = problems.map((problem) =>
        problem.numbers.map((value) => Math.abs(value)).join(",")
      );
      const absoluteBagSignatures = problems.map((problem) =>
        [...problem.numbers].map((value) => Math.abs(value)).sort((left, right) => left - right).join(",")
      );

      expect(new Set(exactSignatures).size).toBe(exactSignatures.length);
      expect(new Set(absoluteSignatures).size).toBe(absoluteSignatures.length);
      expect(new Set(absoluteBagSignatures).size).toBe(absoluteBagSignatures.length);

      for (let index = 1; index < problems.length; index += 1) {
        expect(problems[index].answer).not.toBe(problems[index - 1].answer);
      }
    }
  });

  it("introduces ten-complement operations by 16級 and avoids zero-heavy output", () => {
    const grade = getGrade("16級");
    const problems = generateProblemSet({ grade, practiceMode: "input", seed: "carry-seed", questionCount: 5 });

    for (const problem of problems) {
      expect(problem.policyId).toBe("singleDigitCarryIntro");
      expect(problem.meta.operationMix.tenComplementCount).toBeGreaterThanOrEqual(1);
      expect(problem.meta.operationMix.zeroDigitRatio).toBeLessThan(0.2);
    }
  });

  it("uses ten-complement carry in 10級 two-digit problems", () => {
    const grade = getGrade("10級");
    const problems = generateProblemSet({ grade, practiceMode: "input", seed: "two-digit-carry", questionCount: 5 });

    for (const problem of problems) {
      expect(problem.policyId).toBe("twoDigitCarryIntro");
      expect(problem.meta.operationMix.tenComplementCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses highSpeedStable family for 20段 with complement-heavy operation mix", () => {
    const grade = getGrade("20段");
    const problems = generateProblemSet({ grade, practiceMode: "exam-like", seed: "20-top-seed", questionCount: 5 });

    for (const problem of problems) {
      expect(problem.family).toBe("highSpeedStable");
      expect(problem.meta.tailRunMax).toBeLessThanOrEqual(2);
      expect(problem.meta.operationMix.tenComplementCount).toBeGreaterThanOrEqual(4);
      expect(problem.meta.operationMix.tenComplementNestedFiveCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("creates replay payload from a generated set", () => {
    const grade = getGrade("17級");
    const problemSet = generateProblemSet({ grade, practiceMode: "input", seed: "replay-seed", questionCount: 4 });
    expect(createReplayPayload(problemSet)).toEqual({
      seed: "replay-seed",
      gradeId: grade.id,
      practiceMode: "input",
      questionCount: 4
    });
  });
});
