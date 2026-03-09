import { describe, expect, it } from "vitest";
import { buildStagePlan, getPresentationDurationMs, getStageFrame } from "../../src/core/stagePresentation.js";

describe("stage presentation", () => {
  it("uses hard time for timed grades and scales by preview speed", () => {
    const durationMs = getPresentationDurationMs(
      { label: "10段", mode: "timed", hardTimeSec: 2.88, officialTimeSec: 3.0 },
      12
    );

    expect(durationMs).toBeCloseTo(240, 5);
  });

  it("builds a timed plan and emits visible / gap frames", () => {
    const grade = {
      label: "20段",
      mode: "timed",
      hardTimeSec: 1.5,
      officialTimeSec: 1.5,
      count: 15
    };
    const problem = {
      practiceMode: "exam-like",
      numbers: Array.from({ length: 15 }, (_, index) => 100 + index)
    };
    const plan = buildStagePlan({ grade, problem, speedMultiplier: 10 });

    expect(plan.timeline).toHaveLength(15);

    const countdownFrame = getStageFrame(plan, 100);
    const visibleFrame = getStageFrame(plan, plan.countdownDurationMs + 5);
    const completeFrame = getStageFrame(plan, plan.totalDurationMs + 1);

    expect(countdownFrame.phase).toBe("countdown");
    expect(visibleFrame.phase).toBe("presenting");
    expect(visibleFrame.displayText).toBe("100");
    expect(completeFrame.completed).toBe(true);
  });

  it("builds image plans that show one mouth at a time", () => {
    const grade = {
      label: "20級",
      mode: "image",
      officialTimeSec: 5,
      hardTimeSec: 5,
      count: 3
    };
    const problem = {
      practiceMode: "display",
      numbers: [3, 5, 7]
    };
    const plan = buildStagePlan({ grade, problem, speedMultiplier: 5 });
    const firstFrame = getStageFrame(plan, plan.countdownDurationMs + 50);
    const secondFrame = getStageFrame(plan, plan.countdownDurationMs + plan.timeline[1].showStartMs + 10);

    expect(plan.presentationDurationMs).toBeCloseTo(1000, 5);
    expect(plan.timeline).toHaveLength(3);
    expect(firstFrame.displayText).toBe("3");
    expect(firstFrame.progressLabel).toBe("1 / 3");
    expect(secondFrame.displayText).toBe("5");
    expect(secondFrame.progressLabel).toBe("2 / 3");
  });
});
