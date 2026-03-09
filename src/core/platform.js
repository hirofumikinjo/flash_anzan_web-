import platformProfile from "../../profiles/platformProfile.json";

export function getPlatformClass(env = {}) {
  const browser = env.browserName ?? "";
  const os = env.os ?? "";
  const device = env.deviceType ?? "desktop";

  if (device !== "desktop") {
    return "mobile-web";
  }

  if (["Chrome", "Edge"].includes(browser) && ["Windows", "macOS"].includes(os)) {
    return "desktop-chromium";
  }

  return "desktop-safari-firefox";
}

export function evaluateBenchmark(metrics = {}, profile = platformProfile) {
  const levelA = profile.benchmarks.levelA;
  const p95FrameDeltaMs = metrics.p95FrameDeltaMs ?? Number.POSITIVE_INFINITY;
  const maxPhaseDriftMs = metrics.maxPhaseDriftMs ?? Number.POSITIVE_INFINITY;
  const longFrameCount = metrics.longFrameCount ?? Number.POSITIVE_INFINITY;

  const passA =
    p95FrameDeltaMs <= levelA.p95FrameDeltaMs &&
    maxPhaseDriftMs <= levelA.maxPhaseDriftMs &&
    longFrameCount <= levelA.longFrameCount;

  return {
    level: passA ? "A" : "B",
    passA,
    metrics: {
      p95FrameDeltaMs,
      maxPhaseDriftMs,
      longFrameCount
    }
  };
}

export function classify20DanEnvironment({ env = {}, metrics = {}, recentInvalidCount = 0 } = {}) {
  const platformClass = getPlatformClass(env);
  const platformClassProfile = platformProfile.classes[platformClass];
  const benchmark = evaluateBenchmark(metrics, platformProfile);
  const unstable =
    recentInvalidCount > 0 ||
    metrics.integrityValid === false ||
    Boolean(env.visibilityLost) ||
    Boolean(env.viewportChanged) ||
    Boolean(env.dprChanged) ||
    Boolean(env.slowTimerDetected);

  if (platformClassProfile.strict20 === "unsupported") {
    return {
      platformClass,
      benchmark,
      status: "Unsupported",
      label: "20段は対象外",
      allowedToStart: false,
      recommendationEligible: false
    };
  }

  if (!benchmark.passA || unstable) {
    return {
      platformClass,
      benchmark,
      status: "Unsupported",
      label: "20段はこの環境では不可",
      allowedToStart: false,
      recommendationEligible: false
    };
  }

  if (platformClassProfile.strict20 === "candidate") {
    return {
      platformClass,
      benchmark,
      status: "Verified",
      label: "20段 Verified",
      allowedToStart: true,
      recommendationEligible: true
    };
  }

  return {
    platformClass,
    benchmark,
    status: "Compatible",
    label: "20段 参考練習",
    allowedToStart: true,
    recommendationEligible: false
  };
}
