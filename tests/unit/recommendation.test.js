import { describe, expect, it } from "vitest";
import gradeProfile from "../../profiles/gradeProfile.json";
import { classifyPracticeSession, isRecommendationEligible } from "../../src/core/recommendation.js";

const top = gradeProfile.grades.find((grade) => grade.label === "20段");
const kyu10 = gradeProfile.grades.find((grade) => grade.label === "10級");

describe("recommendation policy", () => {
  it("excludes display mode from recommendation", () => {
    expect(
      isRecommendationEligible({
        grade: kyu10,
        practiceMode: "display",
        compatibilityStatus: "Verified"
      })
    ).toBe(false);
  });

  it("allows standard timed practice on verified environments", () => {
    expect(
      isRecommendationEligible({
        grade: kyu10,
        practiceMode: "input",
        compatibilityStatus: "Verified"
      })
    ).toBe(true);
  });

  it("allows 20段 recommendation only on Verified", () => {
    expect(
      isRecommendationEligible({
        grade: top,
        practiceMode: "exam-like",
        compatibilityStatus: "Verified"
      })
    ).toBe(true);

    expect(
      isRecommendationEligible({
        grade: top,
        practiceMode: "exam-like",
        compatibilityStatus: "Compatible"
      })
    ).toBe(false);
  });

  it("classifies display and Compatible 20段 as 参考練習", () => {
    expect(
      classifyPracticeSession({
        grade: kyu10,
        practiceMode: "display",
        compatibilityStatus: "Verified"
      })
    ).toBe("参考練習");

    expect(
      classifyPracticeSession({
        grade: top,
        practiceMode: "exam-like",
        compatibilityStatus: "Compatible"
      })
    ).toBe("参考練習");
  });
});
