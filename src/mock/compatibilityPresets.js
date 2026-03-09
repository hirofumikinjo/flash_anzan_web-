export const compatibilityPresets = [
  {
    id: "verified-chrome-win",
    label: "Windows + Chrome",
    env: {
      deviceType: "desktop",
      browserName: "Chrome",
      os: "Windows",
      visibilityLost: false,
      viewportChanged: false,
      dprChanged: false,
      slowTimerDetected: false
    },
    metrics: {
      p95FrameDeltaMs: 16,
      maxPhaseDriftMs: 8,
      longFrameCount: 0
    },
    recentInvalidCount: 0
  },
  {
    id: "compatible-safari-mac",
    label: "macOS + Safari",
    env: {
      deviceType: "desktop",
      browserName: "Safari",
      os: "macOS",
      visibilityLost: false,
      viewportChanged: false,
      dprChanged: false,
      slowTimerDetected: false
    },
    metrics: {
      p95FrameDeltaMs: 16,
      maxPhaseDriftMs: 8,
      longFrameCount: 0
    },
    recentInvalidCount: 0
  },
  {
    id: "unsupported-iphone",
    label: "iPhone + Safari",
    env: {
      deviceType: "phone",
      browserName: "Safari",
      os: "iOS",
      visibilityLost: false,
      viewportChanged: false,
      dprChanged: false,
      slowTimerDetected: false
    },
    metrics: {
      p95FrameDeltaMs: 16,
      maxPhaseDriftMs: 8,
      longFrameCount: 0
    },
    recentInvalidCount: 0
  }
];
