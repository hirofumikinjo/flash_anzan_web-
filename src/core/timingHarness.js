import timingProfile from "../../profiles/timingProfile.json";

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export function createTimedTimeline({ count, totalDurationMs, displayRatio, gapRatio }) {
  const mouthDurationMs = totalDurationMs / count;
  let cursorMs = 0;

  return Array.from({ length: count }, (_, index) => {
    const showStartMs = cursorMs;
    const showEndMs = showStartMs + mouthDurationMs * displayRatio;
    const gapEndMs = showEndMs + mouthDurationMs * gapRatio;
    cursorMs = gapEndMs;

    return {
      index,
      showStartMs,
      showEndMs,
      gapEndMs,
      mouthDurationMs
    };
  });
}

export function evaluateTimingIntegrity({
  frameDeltas = [],
  phaseDrifts = [],
  lateShowCount = 0,
  visibilityLost = false,
  viewportChanged = false,
  dprChanged = false,
  slowTimerDetected = false
} = {}) {
  const p95FrameDeltaMs = percentile(frameDeltas, 0.95);
  const maxPhaseDriftMs = phaseDrifts.length ? Math.max(...phaseDrifts) : 0;
  const longFrameCount = frameDeltas.filter((delta) => delta > timingProfile.strict20.longFrameMs).length;
  const reasons = [];

  if (visibilityLost) reasons.push("visibilityLost");
  if (viewportChanged) reasons.push("viewportChanged");
  if (dprChanged) reasons.push("dprChanged");
  if (slowTimerDetected) reasons.push("slowTimerDetected");
  if (lateShowCount >= timingProfile.strict20.invalidateLateShowCount) reasons.push("lateShowCount");
  if (p95FrameDeltaMs > timingProfile.strict20.longFrameMs) reasons.push("p95FrameDeltaExceeded");
  if (maxPhaseDriftMs > timingProfile.strict20.maxPhaseDriftMs) reasons.push("phaseDriftExceeded");
  if (longFrameCount > 0) reasons.push("longFrameCountExceeded");

  return {
    valid: reasons.length === 0,
    p95FrameDeltaMs,
    maxPhaseDriftMs,
    longFrameCount,
    lateShowCount,
    reasons
  };
}
