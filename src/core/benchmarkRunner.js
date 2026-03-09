import timingProfile from "../../profiles/timingProfile.json";
import { createTimedTimeline, evaluateTimingIntegrity } from "./timingHarness.js";

export function analyzeBenchmarkSamples({
  timestamps = [],
  timeline = [],
  targetFrameMs = 1000 / 60,
  lateShowThresholdMs = targetFrameMs + 0.5
} = {}) {
  if (timestamps.length < 2) {
    return {
      sampleCount: timestamps.length,
      frameDeltas: [],
      phaseDrifts: [],
      lateShowCount: timeline.length,
      integrity: evaluateTimingIntegrity({ lateShowCount: timeline.length }),
      metrics: {
        p95FrameDeltaMs: Number.POSITIVE_INFINITY,
        maxPhaseDriftMs: Number.POSITIVE_INFINITY,
        longFrameCount: Number.POSITIVE_INFINITY,
        lateShowCount: timeline.length
      }
    };
  }

  const startTimestamp = timestamps[0];
  const frameDeltas = [];
  const phaseDrifts = [];

  for (let index = 1; index < timestamps.length; index += 1) {
    frameDeltas.push(timestamps[index] - timestamps[index - 1]);
  }

  for (let index = 0; index < timestamps.length; index += 1) {
    const expectedTimestamp = startTimestamp + targetFrameMs * index;
    phaseDrifts.push(Math.abs(timestamps[index] - expectedTimestamp));
  }

  let lateShowCount = 0;
  for (const mouth of timeline) {
    const epsilonMs = 0.75;
    const showStartTimestamp = startTimestamp + mouth.showStartMs;
    const firstVisibleTimestamp = timestamps.find(
      (timestamp) => timestamp + epsilonMs >= showStartTimestamp
    );

    if (
      firstVisibleTimestamp === undefined ||
      firstVisibleTimestamp + epsilonMs - showStartTimestamp > lateShowThresholdMs
    ) {
      lateShowCount += 1;
    }
  }

  const integrity = evaluateTimingIntegrity({
    frameDeltas,
    phaseDrifts,
    lateShowCount
  });

  return {
    sampleCount: timestamps.length,
    frameDeltas,
    phaseDrifts,
    lateShowCount,
    integrity,
    metrics: {
      p95FrameDeltaMs: integrity.p95FrameDeltaMs,
      maxPhaseDriftMs: integrity.maxPhaseDriftMs,
      longFrameCount: integrity.longFrameCount,
      lateShowCount
    }
  };
}

export function collectAnimationFrameTimestamps({
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  sampleDurationMs = 1500,
  warmupFrames = 8
} = {}) {
  if (typeof requestFrame !== "function") {
    throw new Error("requestAnimationFrame is required for benchmark collection.");
  }

  return new Promise((resolve) => {
    const timestamps = [];
    let warmupRemaining = warmupFrames;
    let startTimestamp = null;

    function onFrame(timestamp) {
      if (warmupRemaining > 0) {
        warmupRemaining -= 1;
        requestFrame(onFrame);
        return;
      }

      if (startTimestamp === null) {
        startTimestamp = timestamp;
      }

      timestamps.push(timestamp);

      if (timestamp - startTimestamp >= sampleDurationMs) {
        resolve(timestamps);
        return;
      }

      requestFrame(onFrame);
    }

    requestFrame(onFrame);
  });
}

export async function run20DanBenchmark({
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  count = 15,
  totalDurationMs = 1500,
  displayRatio = timingProfile.strict20.displayRatio,
  gapRatio = timingProfile.strict20.gapRatio,
  targetFrameMs = 1000 / 60,
  lateShowThresholdMs = 1000 / 60 + 0.5,
  warmupFrames = 8
} = {}) {
  const timeline = createTimedTimeline({
    count,
    totalDurationMs,
    displayRatio,
    gapRatio
  });
  const timestamps = await collectAnimationFrameTimestamps({
    requestFrame,
    sampleDurationMs: totalDurationMs,
    warmupFrames
  });

  return {
    timeline,
    timestamps,
    ...analyzeBenchmarkSamples({
      timestamps,
      timeline,
      targetFrameMs,
      lateShowThresholdMs
    })
  };
}
