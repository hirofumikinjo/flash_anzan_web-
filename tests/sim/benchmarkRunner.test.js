import { describe, expect, it } from "vitest";
import { analyzeBenchmarkSamples, run20DanBenchmark } from "../../src/core/benchmarkRunner.js";
import { createTimedTimeline } from "../../src/core/timingHarness.js";

function createBenchmarkTimestamps({ frameCount = 91, targetFrameMs = 1000 / 60 } = {}) {
  return Array.from({ length: frameCount }, (_, index) => index * targetFrameMs);
}

describe("benchmark runner", () => {
  it("analyzes stable timestamps as valid for 20段 benchmark", () => {
    const targetFrameMs = 1000 / 60;
    const timeline = createTimedTimeline({
      count: 15,
      totalDurationMs: 1500,
      displayRatio: 0.78,
      gapRatio: 0.22
    });
    const result = analyzeBenchmarkSamples({
      timestamps: createBenchmarkTimestamps({ targetFrameMs }),
      timeline,
      targetFrameMs
    });

    expect(result.sampleCount).toBeGreaterThan(80);
    expect(result.metrics.p95FrameDeltaMs).toBeCloseTo(targetFrameMs, 3);
    expect(result.integrity.valid).toBe(true);
    expect(result.metrics.lateShowCount).toBe(0);
  });

  it("marks unstable timestamps as invalid when long frames accumulate", () => {
    const targetFrameMs = 1000 / 60;
    const timeline = createTimedTimeline({
      count: 15,
      totalDurationMs: 1500,
      displayRatio: 0.78,
      gapRatio: 0.22
    });
    const timestamps = [
      0,
      targetFrameMs,
      targetFrameMs * 2,
      targetFrameMs * 3 + 30,
      targetFrameMs * 4 + 30,
      targetFrameMs * 5 + 30
    ];
    const result = analyzeBenchmarkSamples({
      timestamps,
      timeline,
      targetFrameMs
    });

    expect(result.integrity.valid).toBe(false);
    expect(result.integrity.reasons).toContain("longFrameCountExceeded");
  });

  it("runs benchmark collection with injected animation frames", async () => {
    const timestamps = createBenchmarkTimestamps({ targetFrameMs: 1000 / 60 });
    let cursor = 0;
    const requestFrame = (callback) => {
      const timestamp = timestamps[cursor];
      cursor += 1;
      queueMicrotask(() => callback(timestamp));
      return cursor;
    };

    const result = await run20DanBenchmark({
      requestFrame,
      warmupFrames: 0
    });

    expect(result.sampleCount).toBeGreaterThan(80);
    expect(result.integrity.valid).toBe(true);
  });
});
