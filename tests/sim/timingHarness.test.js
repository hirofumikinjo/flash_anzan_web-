import { describe, expect, it } from "vitest";
import { createTimedTimeline, evaluateTimingIntegrity } from "../../src/core/timingHarness.js";

describe("timing harness", () => {
  it("creates a 20段-style timeline with fixed mouth count", () => {
    const timeline = createTimedTimeline({
      count: 15,
      totalDurationMs: 1500,
      displayRatio: 0.78,
      gapRatio: 0.22
    });

    expect(timeline).toHaveLength(15);
    expect(timeline[0].mouthDurationMs).toBeCloseTo(100, 5);
    expect(timeline[0].showEndMs - timeline[0].showStartMs).toBeCloseTo(78, 5);
  });

  it("marks integrity valid when all strict20 thresholds pass", () => {
    const result = evaluateTimingIntegrity({
      frameDeltas: [15, 16, 17, 17, 16, 18],
      phaseDrifts: [4, 5, 8],
      lateShowCount: 0
    });

    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("marks integrity invalid when phase drift or long frames exceed thresholds", () => {
    const result = evaluateTimingIntegrity({
      frameDeltas: [15, 16, 27],
      phaseDrifts: [4, 12],
      lateShowCount: 1
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("phaseDriftExceeded");
    expect(result.reasons).toContain("lateShowCount");
  });
});
