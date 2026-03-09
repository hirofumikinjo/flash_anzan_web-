import { describe, expect, it } from "vitest";
import { getSetOutcome, scoreQuestion, scoreSet } from "../../src/core/scoring.js";

describe("scoring", () => {
  it("marks correct answers only when not timed out", () => {
    expect(scoreQuestion({ answer: 123, userAnswer: "123" }).isCorrect).toBe(true);
    expect(scoreQuestion({ answer: 123, userAnswer: "123", timedOut: true }).isCorrect).toBe(false);
  });

  it("computes clear/almost/retry outcomes", () => {
    expect(getSetOutcome({ correctCount: 7, clearThreshold: 7 })).toBe("clear");
    expect(getSetOutcome({ correctCount: 6, clearThreshold: 7 })).toBe("almost");
    expect(getSetOutcome({ correctCount: 5, clearThreshold: 7 })).toBe("retry");
  });

  it("aggregates set scoring", () => {
    const questionResults = [
      scoreQuestion({ answer: 10, userAnswer: "10" }),
      scoreQuestion({ answer: 11, userAnswer: "0", timedOut: true }),
      scoreQuestion({ answer: 12, userAnswer: "12" })
    ];

    expect(
      scoreSet({
        questionResults,
        clearThreshold: 2,
        validSession: true,
        compatibilityStatus: "Verified"
      })
    ).toEqual({
      score: 2,
      correctCount: 2,
      incorrectCount: 1,
      timedOutCount: 1,
      clearThreshold: 2,
      questionCount: 3,
      setOutcome: "clear",
      validSession: true,
      compatibilityStatus: "Verified"
    });
  });

  it("marks invalid sessions as invalidated", () => {
    expect(
      scoreSet({
        questionResults: [scoreQuestion({ answer: 10, userAnswer: "10" })],
        clearThreshold: 1,
        validSession: false,
        compatibilityStatus: "Verified"
      }).setOutcome
    ).toBe("invalidated");
  });
});
