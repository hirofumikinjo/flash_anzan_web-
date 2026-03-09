import { describe, expect, it } from "vitest";
import { classify20DanEnvironment, evaluateBenchmark, getPlatformClass } from "../../src/core/platform.js";

describe("platform classification", () => {
  it("maps desktop chrome to desktop-chromium", () => {
    expect(getPlatformClass({ deviceType: "desktop", browserName: "Chrome", os: "Windows" })).toBe("desktop-chromium");
  });

  it("maps mobile devices to mobile-web", () => {
    expect(getPlatformClass({ deviceType: "phone", browserName: "Safari", os: "iOS" })).toBe("mobile-web");
  });

  it("returns Level A benchmark for passing metrics", () => {
    const result = evaluateBenchmark({ p95FrameDeltaMs: 17, maxPhaseDriftMs: 8, longFrameCount: 0 });
    expect(result.level).toBe("A");
    expect(result.passA).toBe(true);
  });

  it("classifies chrome desktop as Verified when benchmark passes", () => {
    const result = classify20DanEnvironment({
      env: { deviceType: "desktop", browserName: "Chrome", os: "Windows" },
      metrics: { p95FrameDeltaMs: 17, maxPhaseDriftMs: 8, longFrameCount: 0 }
    });

    expect(result.status).toBe("Verified");
    expect(result.recommendationEligible).toBe(true);
  });

  it("classifies safari desktop as Compatible when benchmark passes", () => {
    const result = classify20DanEnvironment({
      env: { deviceType: "desktop", browserName: "Safari", os: "macOS" },
      metrics: { p95FrameDeltaMs: 17, maxPhaseDriftMs: 8, longFrameCount: 0 }
    });

    expect(result.status).toBe("Compatible");
    expect(result.label).toBe("20段 参考練習");
  });

  it("classifies mobile as Unsupported for 20段", () => {
    const result = classify20DanEnvironment({
      env: { deviceType: "phone", browserName: "Safari", os: "iOS" },
      metrics: { p95FrameDeltaMs: 17, maxPhaseDriftMs: 8, longFrameCount: 0 }
    });

    expect(result.status).toBe("Unsupported");
    expect(result.allowedToStart).toBe(false);
  });

  it("classifies integrity-invalid metrics as Unsupported even on desktop chrome", () => {
    const result = classify20DanEnvironment({
      env: { deviceType: "desktop", browserName: "Chrome", os: "Windows" },
      metrics: {
        p95FrameDeltaMs: 17,
        maxPhaseDriftMs: 8,
        longFrameCount: 0,
        integrityValid: false
      }
    });

    expect(result.status).toBe("Unsupported");
    expect(result.allowedToStart).toBe(false);
  });
});
