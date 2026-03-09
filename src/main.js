import gradeProfile from "../profiles/gradeProfile.json";
import platformProfile from "../profiles/platformProfile.json";
import timingProfile from "../profiles/timingProfile.json";
import { run20DanBenchmark } from "./core/benchmarkRunner.js";
import { generateProblemSet, isNoCarryGrade } from "./core/generator.js";
import { classify20DanEnvironment } from "./core/platform.js";
import { classifyPracticeSession, isRecommendationEligible } from "./core/recommendation.js";
import { scoreQuestion, scoreSet } from "./core/scoring.js";
import { buildStagePlan, getStageFrame } from "./core/stagePresentation.js";
import { paintStageCanvas } from "./core/stageRenderer.js";
import { APP_STATES, QUESTION_STATES, nextAppState, nextQuestionState } from "./core/stateMachine.js";
import {
  buildStorageSnapshot,
  exportStorageBackup,
  importStorageBackup,
  loadStorageSnapshot,
  pushRecentSession,
  saveStorageSnapshot,
  STORAGE_KEY
} from "./core/storage.js";
import { createTimedTimeline, evaluateTimingIntegrity } from "./core/timingHarness.js";
import { compatibilityPresets } from "./mock/compatibilityPresets.js";
import "./styles.css";

const app = document.querySelector("#app");
const gradeMap = new Map(gradeProfile.grades.map((grade) => [grade.id, grade]));
const defaultFlowGrade = gradeProfile.grades[0];
const topGrade = gradeProfile.grades.find((grade) => grade.label === "20段");
const developerMode = new URLSearchParams(window.location.search).get("dev") === "1";
let lastRenderedRoute = APP_STATES.HOME;
let lastRenderedSessionState = QUESTION_STATES.READY;
let heldPickerKey = null;
let heldPickerTimeoutId = null;
let heldPickerIntervalId = null;
let startCueAudioContext = null;
let renderTransitionInFlight = false;
let lastRenderedOverlay = null;

const FREE_PRACTICE_OPTIONS = {
  digits: [1, 2, 3],
  count: [2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20],
  timeSec: [1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15]
};

const FREE_PRACTICE_FIELDS = ["digits", "count", "timeSec"];

function isMobileLikeDevice() {
  const ua = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  const userAgentDataMobile = navigator.userAgentData?.mobile === true;
  const touchMacLike = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return userAgentDataMobile || /Android|webOS|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMacLike;
}

function getDefaultPreferFullscreenStage() {
  return !isMobileLikeDevice();
}

function readStoredDisplayPreferenceMeta(storage = globalThis?.localStorage) {
  if (!storage?.getItem) {
    return {
      exists: false,
      hasFullscreenPreference: false,
      hasWakeLockPreference: false
    };
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        exists: false,
        hasFullscreenPreference: false,
        hasWakeLockPreference: false
      };
    }

    const parsed = JSON.parse(raw);
    return {
      exists: true,
      hasFullscreenPreference: typeof parsed?.display?.preferFullscreenStage === "boolean",
      hasWakeLockPreference: typeof parsed?.display?.preferWakeLock === "boolean"
    };
  } catch {
    return {
      exists: false,
      hasFullscreenPreference: false,
      hasWakeLockPreference: false
    };
  }
}

function clonePreset(preset) {
  return {
    ...structuredClone(preset),
    metrics: {
      ...structuredClone(preset.metrics),
      integrityValid: true
    }
  };
}

function createIdleFrame() {
  return {
    phase: "idle",
    displayText: "READY",
    progressLabel: "待機",
    isVisible: false,
    completed: false
  };
}

function createCompleteFrame(progressLabel = "完了") {
  return {
    phase: "complete",
    displayText: "END",
    progressLabel,
    isVisible: true,
    completed: true
  };
}

function isFocusStageVisible() {
  return (
    state.flow.route === APP_STATES.SET_COUNTDOWN &&
    [QUESTION_STATES.COUNTDOWN, QUESTION_STATES.PRESENTING].includes(state.session.questionState)
  );
}

function isDeveloperMode() {
  return developerMode;
}

function shouldResetViewportTop() {
  if (state.flow.route !== lastRenderedRoute) return true;
  if (
    state.flow.route === APP_STATES.SET_COUNTDOWN &&
    state.session.questionState !== lastRenderedSessionState
  ) {
    return true;
  }
  return false;
}

function syncViewportTop() {
  if (typeof window.scrollTo !== "function") return;
  requestAnimationFrame(() => {
    if (state.flow.route === APP_STATES.SET_COUNTDOWN) {
      const sessionAnchor =
        document.querySelector('[data-testid="session-submit-answer"]') ??
        document.querySelector('[data-testid="session-acknowledge-answer"]') ??
        document.querySelector('[data-testid="session-continue-after-judgement"]') ??
        document.querySelector('[data-testid="session-next-question"]');
      if (sessionAnchor) {
        sessionAnchor.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
    }
    window.scrollTo(0, 0);
  });
}

const state = {
  selectedPresetId: compatibilityPresets[0].id,
  custom: clonePreset(compatibilityPresets[0]),
  flow: {
    route: APP_STATES.HOME,
    selectedGradeId: defaultFlowGrade.id,
    selectedTrainingMode: "official",
    selectedPracticeMode: defaultFlowGrade.defaultPracticeMode,
    questionCount: 10,
    answerTimeLimitSec: 10,
    freeConfig: {
      digits: 1,
      count: 3,
      timeSec: 5,
      activeField: "digits"
    },
    pendingReplaySeed: null,
    pendingReplayProblemSet: null,
    pendingReplayQuestionCount: null
  },
  benchmark: {
    status: "idle",
    result: null,
    error: null
  },
  stage: {
    selectedGradeId: topGrade.id,
    selectedPracticeMode: topGrade.defaultPracticeMode,
    previewSpeed: 1,
    status: "idle",
    seed: null,
    problem: null,
    plan: null,
    frame: createIdleFrame(),
    runToken: 0,
    rafId: null
  },
  session: {
    active: false,
    seed: null,
    gradeId: null,
    practiceMode: null,
    questionCount: 0,
    answerTimeLimitSec: 10,
    currentIndex: 0,
    problemSet: [],
    questionState: QUESTION_STATES.READY,
    questionFrame: createIdleFrame(),
    currentPlan: null,
    currentResult: null,
    questionResults: [],
    setScore: null,
    answerInput: "",
    answerTimerId: null,
    autoAdvanceTimerId: null,
    rafId: null,
    runToken: 0,
    invalidReasons: [],
    viewportBaseline: null,
    viewportGuardUntil: 0
  },
  display: {
    preferFullscreenStage: getDefaultPreferFullscreenStage(),
    fullscreenStatus: getDefaultPreferFullscreenStage() ? "ready" : "off",
    lastError: null,
    preferWakeLock: false,
    wakeLockStatus: "off",
    wakeLockSentinel: null,
    lastWakeLockError: null
  },
  preferences: {
    startCueEnabled: true,
    startCueVolume: 70
  },
  ui: {
    overlay: null
  },
  guardian: {
    enabled: false,
    pinHash: null,
    unlocked: false,
    pinDraft: "",
    error: null
  },
  storage: {
    recentSessions: [],
    status: "idle",
    lastSavedAt: null,
    lastRestoredAt: null
  }
};

const gradeCount = gradeProfile.grades.length;
const timedCount = gradeProfile.grades.filter((grade) => grade.mode === "timed").length;
const imageCount = gradeProfile.grades.filter((grade) => grade.mode === "image").length;
const has20Dan = gradeProfile.grades.some((grade) => grade.label === "20段");
const platformCount = Object.keys(platformProfile.classes).length;
const strictTimeline = createTimedTimeline({
  count: topGrade.count,
  totalDurationMs: topGrade.officialTimeSec * 1000,
  displayRatio: timingProfile.strict20.displayRatio,
  gapRatio: timingProfile.strict20.gapRatio
});

const integrityMock = evaluateTimingIntegrity({
  frameDeltas: [15, 16, 16, 17, 18, 16, 16, 17, 15, 16],
  phaseDrifts: [3, 4, 5, 6, 7],
  lateShowCount: 0
});

function getSelectedPreset() {
  return compatibilityPresets.find((preset) => preset.id === state.selectedPresetId) ?? compatibilityPresets[0];
}

function getSelectedStageGrade() {
  return gradeMap.get(state.stage.selectedGradeId) ?? topGrade;
}

function getFreePracticeOptionValues(field) {
  return FREE_PRACTICE_OPTIONS[field] ?? [];
}

function getFreePracticeFieldLabel(field) {
  switch (field) {
    case "digits":
      return "桁数";
    case "count":
      return "口数";
    case "timeSec":
      return "時間";
    default:
      return "項目";
  }
}

function getFreePracticeFieldValueLabel(field, value) {
  if (field === "digits") return `${value}桁`;
  if (field === "count") return `${value}口`;
  if (field === "timeSec") return `${Number(value).toFixed(2)}秒`;
  return String(value);
}

function getFreeOperationPolicyId({ digits, count, timeSec }) {
  if (digits === 1) {
    if (count <= 3 && timeSec >= 5) return "directSignedIntro";
    if (count <= 5) return "fiveIntro";
    return "singleDigitCarryIntro";
  }

  if (digits === 2) {
    if (count <= 5) return "twoDigitCarryIntro";
    if (count <= 12 || timeSec >= 6) return "twoDigitCarryMix";
    return "twoDigitAdvanced";
  }

  if (timeSec <= 2.5 || count >= 15) return "threeDigitHighSpeed";
  if (count <= 8 || timeSec >= 5) return "threeDigitCarryIntro";
  return "threeDigitCarryMix";
}

function buildFreeFlowGrade() {
  const { digits, count, timeSec } = state.flow.freeConfig;
  const generatorFamily = digits === 1 ? "imageFoundation" : timeSec <= 2.5 ? "highSpeedStable" : "standardExamLike";
  return {
    id: `free-${digits}-${count}-${String(timeSec).replace(".", "_")}`,
    label: "自由練習",
    digits,
    count,
    mode: "timed",
    officialTimeSec: timeSec,
    hardTimeSec: timeSec,
    supportedPracticeModes: ["input", "display"],
    defaultPracticeMode: "input",
    generatorFamily,
    compatibilityRequired: false,
    recommendationEligible: false,
    operationPolicyId: getFreeOperationPolicyId({ digits, count, timeSec }),
    trainingMode: "free"
  };
}

function normalizeFreeConfigCandidate(candidate = {}) {
  const digits = FREE_PRACTICE_OPTIONS.digits.includes(Number(candidate.digits))
    ? Number(candidate.digits)
    : FREE_PRACTICE_OPTIONS.digits[0];
  const count = FREE_PRACTICE_OPTIONS.count.includes(Number(candidate.count))
    ? Number(candidate.count)
    : FREE_PRACTICE_OPTIONS.count[1];
  const timeSec = FREE_PRACTICE_OPTIONS.timeSec.includes(Number(candidate.timeSec))
    ? Number(candidate.timeSec)
    : FREE_PRACTICE_OPTIONS.timeSec[5];

  return {
    digits,
    count,
    timeSec
  };
}

function parseFreeGradeId(gradeId) {
  const matched = /^free-(\d+)-(\d+)-(\d+(?:_\d+)?)$/.exec(String(gradeId ?? ""));
  if (!matched) return null;

  const [, digitsText, countText, timeText] = matched;
  return normalizeFreeConfigCandidate({
    digits: Number(digitsText),
    count: Number(countText),
    timeSec: Number(timeText.replace("_", "."))
  });
}

function applyStoredSessionFlow(entry) {
  const officialGrade = gradeMap.get(entry.gradeId);
  if (officialGrade) {
    setFlowGrade(entry.gradeId);
    state.flow.selectedPracticeMode = officialGrade.supportedPracticeModes.includes(entry.practiceMode)
      ? entry.practiceMode
      : officialGrade.defaultPracticeMode;
    state.flow.selectedTrainingMode = deriveTrainingModeFromPracticeMode(state.flow.selectedPracticeMode);
    syncFlowToStage();
    return getSelectedFlowGrade();
  }

  const restoredFreeConfig = normalizeFreeConfigCandidate(entry.freeConfig ?? parseFreeGradeId(entry.gradeId) ?? {});
  state.flow.selectedTrainingMode = "free";
  state.flow.selectedPracticeMode = ["input", "display"].includes(entry.practiceMode) ? entry.practiceMode : "input";
  state.flow.freeConfig = {
    ...state.flow.freeConfig,
    ...restoredFreeConfig
  };
  syncFlowToStage();
  return getSelectedFlowGrade();
}

function getSelectedFlowGrade() {
  if (state.flow.selectedTrainingMode === "free") {
    return buildFreeFlowGrade();
  }
  return gradeMap.get(state.flow.selectedGradeId) ?? defaultFlowGrade;
}

function createStageSeed() {
  return `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashGuardianPin(pin) {
  let hash = 5381;
  for (const char of String(pin)) {
    hash = (hash * 33) ^ char.charCodeAt(0);
  }
  return `g${(hash >>> 0).toString(16)}`;
}

function isGuardianSettingsLocked() {
  return state.guardian.enabled && !state.guardian.unlocked;
}

function getFullscreenStatusLabel() {
  switch (state.display.fullscreenStatus) {
    case "active":
      return "active";
    case "fallback":
      return "fallback";
    case "unsupported":
      return "unsupported";
    case "ready":
      return "ready";
    case "exiting":
      return "exiting";
    default:
      return "off";
  }
}

function getWakeLockStatusLabel() {
  switch (state.display.wakeLockStatus) {
    case "active":
      return "active";
    case "fallback":
      return "fallback";
    case "unsupported":
      return "unsupported";
    case "ready":
      return "ready";
    case "releasing":
      return "releasing";
    default:
      return "off";
  }
}

function buildPersistedSnapshot() {
  return buildStorageSnapshot({
    flow: state.flow,
    compatibility: {
      selectedPresetId: state.selectedPresetId,
      custom: state.custom
    },
    display: {
      preferFullscreenStage: state.display.preferFullscreenStage,
      preferWakeLock: state.display.preferWakeLock
    },
    preferences: state.preferences,
    guardian: {
      enabled: state.guardian.enabled,
      pinHash: state.guardian.pinHash
    },
    recentSessions: state.storage.recentSessions
  });
}

function persistState(status = "saved") {
  const didSave = saveStorageSnapshot(buildPersistedSnapshot());
  if (!didSave) return false;
  state.storage.status = status;
  state.storage.lastSavedAt = new Date().toISOString();
  return true;
}

function applyPersistedSnapshot(snapshot) {
  if (snapshot.flow.selectedGradeId && gradeMap.has(snapshot.flow.selectedGradeId)) {
    state.flow.selectedGradeId = snapshot.flow.selectedGradeId;
  }
  const grade = getSelectedFlowGrade();
  state.flow.selectedTrainingMode =
    snapshot.flow.selectedTrainingMode === "free" || snapshot.flow.selectedTrainingMode === "official"
      ? snapshot.flow.selectedTrainingMode
      : snapshot.flow.selectedPracticeMode === "exam-like"
        ? "official"
        : "free";
  if (
    snapshot.flow.selectedPracticeMode &&
    grade.supportedPracticeModes.includes(snapshot.flow.selectedPracticeMode)
  ) {
    state.flow.selectedPracticeMode = snapshot.flow.selectedPracticeMode;
  } else {
    state.flow.selectedPracticeMode = derivePracticeModeFromTrainingMode(grade, state.flow.selectedTrainingMode);
  }
  state.flow.questionCount = [1, 5, 10, 15].includes(snapshot.flow.questionCount)
    ? snapshot.flow.questionCount
    : state.flow.questionCount;
  state.flow.answerTimeLimitSec = [5, 10, 15].includes(snapshot.flow.answerTimeLimitSec)
    ? snapshot.flow.answerTimeLimitSec
    : state.flow.answerTimeLimitSec;
  state.flow.freeConfig = {
    digits: snapshot.flow.freeConfig?.digits ?? state.flow.freeConfig.digits,
    count: snapshot.flow.freeConfig?.count ?? state.flow.freeConfig.count,
    timeSec: snapshot.flow.freeConfig?.timeSec ?? state.flow.freeConfig.timeSec,
    activeField: "digits"
  };
  state.flow.pendingReplaySeed = null;
  state.flow.pendingReplayProblemSet = null;
  state.flow.pendingReplayQuestionCount = null;

  if (snapshot.compatibility.selectedPresetId) {
    const preset = compatibilityPresets.find((item) => item.id === snapshot.compatibility.selectedPresetId);
    if (preset) {
      state.selectedPresetId = preset.id;
      state.custom = snapshot.compatibility.custom ? clonePreset(snapshot.compatibility.custom) : clonePreset(preset);
    }
  }

  state.display.preferFullscreenStage = snapshot.display.preferFullscreenStage;
  state.display.fullscreenStatus = snapshot.display.preferFullscreenStage ? "ready" : "off";
  state.display.lastError = null;
  state.display.preferWakeLock = snapshot.display.preferWakeLock;
  state.display.wakeLockStatus = snapshot.display.preferWakeLock ? "ready" : "off";
  state.display.wakeLockSentinel = null;
  state.display.lastWakeLockError = null;
  state.preferences = {
    startCueEnabled: snapshot.preferences.startCueEnabled,
    startCueVolume: snapshot.preferences.startCueVolume
  };
  state.ui.overlay = null;
  state.guardian.enabled = snapshot.guardian.enabled;
  state.guardian.pinHash = snapshot.guardian.pinHash;
  state.guardian.unlocked = false;
  state.guardian.pinDraft = "";
  state.guardian.error = null;
  state.storage.recentSessions = snapshot.recentSessions;
  state.storage.lastRestoredAt = new Date().toISOString();
  state.storage.status = "restored";
  syncFlowToStage();
}

function restoreFromStorage() {
  const storedMeta = readStoredDisplayPreferenceMeta();
  const snapshot = loadStorageSnapshot();
  applyPersistedSnapshot(snapshot);
  if (!storedMeta.exists || !storedMeta.hasFullscreenPreference) {
    state.display.preferFullscreenStage = getDefaultPreferFullscreenStage();
    state.display.fullscreenStatus = state.display.preferFullscreenStage ? "ready" : "off";
  }
  if (!storedMeta.exists) {
    state.storage.status = "idle";
    state.storage.lastRestoredAt = null;
  }
}

function createSessionHistoryEntry(setScore, classification) {
  const grade = getSelectedFlowGrade();
  return {
    id: `${state.session.seed}-${Date.now().toString(36)}`,
    endedAt: new Date().toISOString(),
    gradeId: grade.id,
    gradeLabel: grade.label,
    practiceMode: state.flow.selectedPracticeMode,
    trainingMode: state.flow.selectedTrainingMode,
    freeConfig:
      state.flow.selectedTrainingMode === "free"
        ? {
            digits: state.flow.freeConfig.digits,
            count: state.flow.freeConfig.count,
            timeSec: state.flow.freeConfig.timeSec
          }
        : null,
    answerTimeLimitSec: state.session.answerTimeLimitSec,
    compatibilityStatus: classification.status,
    setOutcome: setScore.setOutcome,
    score: setScore.score,
    questionCount: setScore.questionCount,
    correctCount: setScore.correctCount,
    incorrectCount: setScore.incorrectCount,
    timedOutCount: setScore.timedOutCount,
    seed: state.session.seed,
    invalidReasons: structuredClone(state.session.invalidReasons),
    problemSet: structuredClone(state.session.problemSet),
    questionResults: structuredClone(state.session.questionResults),
    setScore: structuredClone(setScore)
  };
}

function enableGuardianLock() {
  const pin = state.guardian.pinDraft.trim();
  if (!/^\d{4}$/.test(pin)) {
    state.guardian.error = "4桁の数字で設定してください。";
    return false;
  }

  state.guardian.enabled = true;
  state.guardian.pinHash = hashGuardianPin(pin);
  state.guardian.unlocked = true;
  state.guardian.pinDraft = "";
  state.guardian.error = null;
  persistState("saved");
  return true;
}

function unlockGuardianLock() {
  const pin = state.guardian.pinDraft.trim();
  if (hashGuardianPin(pin) !== state.guardian.pinHash) {
    state.guardian.error = "PIN が一致しません。";
    return false;
  }

  state.guardian.unlocked = true;
  state.guardian.pinDraft = "";
  state.guardian.error = null;
  return true;
}

function lockGuardianLock() {
  state.guardian.unlocked = false;
  state.guardian.pinDraft = "";
  state.guardian.error = null;
}

function disableGuardianLock() {
  state.guardian.enabled = false;
  state.guardian.pinHash = null;
  state.guardian.unlocked = false;
  state.guardian.pinDraft = "";
  state.guardian.error = null;
  persistState("saved");
}

function invalidateActiveSession(reason) {
  if (state.flow.route !== APP_STATES.SET_COUNTDOWN) return;
  const activeQuestionState = state.session.questionState;
  if (![QUESTION_STATES.COUNTDOWN, QUESTION_STATES.PRESENTING, QUESTION_STATES.AWAITING_ANSWER].includes(activeQuestionState)) {
    return;
  }

  if (
    ["viewport-changed", "fullscreen-exited", "visibility-lost"].includes(reason) &&
    activeQuestionState !== QUESTION_STATES.PRESENTING
  ) {
    return;
  }

  stopSessionPresentation({ resetFrame: false });
  const classification = classifyCurrentPreset();
  state.session.questionState = QUESTION_STATES.INVALIDATED;
  state.session.invalidReasons = [...new Set([...(state.session.invalidReasons ?? []), reason])];
  state.session.questionFrame = {
    phase: "invalidated",
    displayText: "INVALID",
    progressLabel: `${state.session.currentIndex + 1} / ${state.session.questionCount}`,
    isVisible: true,
    completed: true
  };
  state.session.setScore = {
    ...scoreSet({
      questionResults: state.session.questionResults,
      clearThreshold: clearThresholdForQuestionCount(state.session.questionCount),
      validSession: false,
      compatibilityStatus: classification.status
    })
  };
  state.storage.recentSessions = pushRecentSession(
    state.storage.recentSessions,
    createSessionHistoryEntry(state.session.setScore, classification)
  );
  persistState("saved");
  transitionFlow("SESSION_INVALIDATED");
  render();
}

async function attemptSessionFullscreen() {
  if (!state.display.preferFullscreenStage) {
    state.display.fullscreenStatus = "off";
    state.display.lastError = null;
    return false;
  }

  if (document.fullscreenElement) {
    state.display.fullscreenStatus = "active";
    state.display.lastError = null;
    return true;
  }

  if (typeof document.documentElement.requestFullscreen !== "function") {
    state.display.fullscreenStatus = "unsupported";
    state.display.lastError = "requestFullscreen unavailable";
    return false;
  }

  try {
    await document.documentElement.requestFullscreen();
    state.display.fullscreenStatus = document.fullscreenElement ? "active" : "ready";
    state.display.lastError = null;
    return Boolean(document.fullscreenElement);
  } catch (error) {
    state.display.fullscreenStatus = "fallback";
    state.display.lastError = error instanceof Error ? error.name : String(error);
    return false;
  }
}

function syncFullscreenExit() {
  const wantsFocusFullscreen = state.display.preferFullscreenStage && isFocusStageVisible();
  if (wantsFocusFullscreen) {
    if (document.fullscreenElement) {
      state.display.fullscreenStatus = "active";
    } else if (state.display.preferFullscreenStage && state.display.fullscreenStatus === "off") {
      state.display.fullscreenStatus = "ready";
    }
    return;
  }

  if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
    state.display.fullscreenStatus = "exiting";
    void document.exitFullscreen().catch(() => {
      state.display.fullscreenStatus = state.display.preferFullscreenStage ? "ready" : "off";
    });
    return;
  }

  state.display.fullscreenStatus = state.display.preferFullscreenStage ? "ready" : "off";
}

async function attemptWakeLock() {
  if (!state.display.preferWakeLock) {
    state.display.wakeLockStatus = "off";
    state.display.lastWakeLockError = null;
    return false;
  }

  if (state.display.wakeLockSentinel) {
    state.display.wakeLockStatus = "active";
    state.display.lastWakeLockError = null;
    return true;
  }

  if (document.visibilityState !== "visible") {
    state.display.wakeLockStatus = "fallback";
    state.display.lastWakeLockError = "document hidden";
    return false;
  }

  if (typeof navigator?.wakeLock?.request !== "function") {
    state.display.wakeLockStatus = "unsupported";
    state.display.lastWakeLockError = "wakeLock unavailable";
    return false;
  }

  try {
    const sentinel = await navigator.wakeLock.request("screen");
    state.display.wakeLockSentinel = sentinel;
    state.display.wakeLockStatus = "active";
    state.display.lastWakeLockError = null;
    sentinel.addEventListener("release", () => {
      state.display.wakeLockSentinel = null;
      if (state.display.preferWakeLock && isFocusStageVisible()) {
        state.display.wakeLockStatus = "fallback";
        state.display.lastWakeLockError = "wake lock released";
        return;
      }
      state.display.wakeLockStatus = state.display.preferWakeLock ? "ready" : "off";
      state.display.lastWakeLockError = null;
    });
    return true;
  } catch (error) {
    state.display.wakeLockStatus = "fallback";
    state.display.lastWakeLockError = error instanceof Error ? error.name : String(error);
    return false;
  }
}

function syncWakeLockExit() {
  const wantsWakeLock = state.display.preferWakeLock && isFocusStageVisible();
  if (wantsWakeLock) {
    if (state.display.wakeLockSentinel) {
      state.display.wakeLockStatus = "active";
    } else if (state.display.wakeLockStatus === "off") {
      state.display.wakeLockStatus = "ready";
    }
    return;
  }

  if (state.display.wakeLockSentinel) {
    state.display.wakeLockStatus = "releasing";
    void state.display.wakeLockSentinel.release().catch(() => {
      state.display.wakeLockStatus = state.display.preferWakeLock ? "ready" : "off";
    });
    return;
  }

  state.display.wakeLockStatus = state.display.preferWakeLock ? "ready" : "off";
}

function formatTimestamp(iso) {
  if (!iso) return "n/a";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function downloadStorageBackup() {
  const json = exportStorageBackup(buildPersistedSnapshot());
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `flash-anzan-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function handleStorageImportFile(file) {
  if (!file) return;
  const text = await file.text();
  const snapshot = importStorageBackup(text);
  applyPersistedSnapshot(snapshot);
  persistState("restored");
  render();
}

function formatMetric(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function getTrainingModeLabel(mode) {
  return mode === "official" ? "フラッシュ暗算協会の検定問題" : "自由練習モード";
}

function getPracticeModeLabel(mode) {
  if (mode === "exam-like") return "フラッシュ暗算協会の検定問題";
  if (mode === "display") return "自由練習モード(表示)";
  return "自由練習モード";
}

function getVisiblePracticeLabel() {
  return getTrainingModeLabel(state.flow.selectedTrainingMode);
}

function getModeCardButtonLabel(mode) {
  return mode === "official" ? "フラッシュ暗算協会の検定問題" : "自由練習モード";
}

function deriveTrainingModeFromPracticeMode(mode) {
  return mode === "exam-like" ? "official" : "free";
}

function derivePracticeModeFromTrainingMode(grade, trainingMode) {
  if (trainingMode === "official") {
    if (grade.supportedPracticeModes.includes("exam-like")) return "exam-like";
    if (grade.supportedPracticeModes.includes("input")) return "input";
  }

  if (grade.supportedPracticeModes.includes("input")) return "input";
  return grade.defaultPracticeMode;
}

function getFlowGradeIndex() {
  return gradeProfile.grades.findIndex((grade) => grade.id === state.flow.selectedGradeId);
}

function stepFlowGrade(step) {
  const currentIndex = getFlowGradeIndex();
  const nextIndex = Math.max(0, Math.min(gradeProfile.grades.length - 1, currentIndex + step));
  if (nextIndex === currentIndex) return false;
  setFlowGrade(gradeProfile.grades[nextIndex].id);
  return true;
}

function setFreeConfigField(field) {
  if (!FREE_PRACTICE_FIELDS.includes(field)) return;
  state.flow.freeConfig.activeField = field;
}

function stepFreeConfigField(field, step) {
  const options = getFreePracticeOptionValues(field);
  if (!options.length) return false;
  const currentValue = state.flow.freeConfig[field];
  const currentIndex = Math.max(0, options.indexOf(currentValue));
  const appliedStep = field === "timeSec" ? step * -1 : step;
  const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + appliedStep));
  if (nextIndex === currentIndex) return false;
  state.flow.freeConfig[field] = options[nextIndex];
  return true;
}

function getFreeConfigCards() {
  return [
    { field: "digits", label: "桁数", value: state.flow.freeConfig.digits },
    { field: "count", label: "口数", value: state.flow.freeConfig.count },
    { field: "timeSec", label: "時間", value: state.flow.freeConfig.timeSec }
  ];
}

function moveFreeConfigField(step) {
  const currentIndex = Math.max(0, FREE_PRACTICE_FIELDS.indexOf(state.flow.freeConfig.activeField));
  const nextIndex = Math.max(0, Math.min(FREE_PRACTICE_FIELDS.length - 1, currentIndex + step));
  state.flow.freeConfig.activeField = FREE_PRACTICE_FIELDS[nextIndex];
}

function getAudioContext() {
  if (!startCueAudioContext) {
    const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContextCtor) return null;
    startCueAudioContext = new AudioContextCtor();
  }
  return startCueAudioContext;
}

function playCueBeep({
  offsetSec = 0,
  frequency = 1080,
  durationSec = 0.62,
  gain = 0.18,
  type = "sine"
}) {
  const context = getAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const attackSec = Math.min(0.04, durationSec * 0.1);
  const sustainUntilSec = Math.max(attackSec + 0.2, durationSec - 0.06);
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime + offsetSec);
  gainNode.gain.setValueAtTime(0.0001, context.currentTime + offsetSec);
  gainNode.gain.linearRampToValueAtTime(gain, context.currentTime + offsetSec + attackSec);
  gainNode.gain.setValueAtTime(gain, context.currentTime + offsetSec + sustainUntilSec);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offsetSec + durationSec);
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(context.currentTime + offsetSec);
  oscillator.stop(context.currentTime + offsetSec + durationSec + 0.03);
}

async function playSessionStartCue() {
  if (!state.preferences.startCueEnabled) return;
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return;
    }
  }
  const volume = Math.max(0.06, (state.preferences.startCueVolume ?? 70) / 260);
  const secondBeepOffsetSec = (timingProfile.prestart.secondBeepMs ?? 440) / 1000;
  playCueBeep({ offsetSec: 0, frequency: 1080, durationSec: 0.58, gain: volume, type: "sine" });
  playCueBeep({ offsetSec: secondBeepOffsetSec, frequency: 1080, durationSec: 0.58, gain: volume, type: "sine" });
}

function isMotionReduced() {
  return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function isTransitionableSessionState(questionState) {
  return [
    QUESTION_STATES.READY,
    QUESTION_STATES.AWAITING_ANSWER,
    QUESTION_STATES.SHOWING_ANSWER,
    QUESTION_STATES.SHOWING_JUDGEMENT
  ].includes(questionState);
}

function shouldAnimateRenderCommit() {
  if (isDeveloperMode()) return false;
  if (renderTransitionInFlight) return false;
  if (typeof document.startViewTransition !== "function") return false;
  if (isMotionReduced()) return false;
  if (state.flow.route !== lastRenderedRoute) return true;
  if (state.ui.overlay !== lastRenderedOverlay) return true;
  if (
    state.flow.route === APP_STATES.SET_COUNTDOWN &&
    state.session.questionState !== lastRenderedSessionState &&
    isTransitionableSessionState(state.session.questionState) &&
    isTransitionableSessionState(lastRenderedSessionState)
  ) {
    return true;
  }
  return false;
}

function clearHeldPickerRepeat() {
  heldPickerKey = null;
  if (heldPickerTimeoutId) {
    clearTimeout(heldPickerTimeoutId);
    heldPickerTimeoutId = null;
  }
  if (heldPickerIntervalId) {
    clearInterval(heldPickerIntervalId);
    heldPickerIntervalId = null;
  }
}

function applyFlowPickerAction(key) {
  if (state.ui.overlay) return false;
  if (state.flow.route !== APP_STATES.GRADE_SELECT) return false;
  if (isGuardianSettingsLocked()) return false;

  if (state.flow.selectedTrainingMode === "free") {
    if (key === "ArrowLeft") {
      moveFreeConfigField(-1);
      return true;
    }
    if (key === "ArrowRight") {
      moveFreeConfigField(1);
      return true;
    }
    if (key === "ArrowUp") {
      return stepFreeConfigField(state.flow.freeConfig.activeField, 1);
    }
    if (key === "ArrowDown") {
      return stepFreeConfigField(state.flow.freeConfig.activeField, -1);
    }
    return false;
  }

  if (key === "ArrowUp") {
    return stepFlowGrade(1);
  }
  if (key === "ArrowDown") {
    return stepFlowGrade(-1);
  }
  return false;
}

function startHeldPickerRepeat(key) {
  clearHeldPickerRepeat();
  heldPickerKey = key;
  let intervalMs = 140;
  let repeatCount = 0;
  heldPickerTimeoutId = setTimeout(() => {
    heldPickerIntervalId = setInterval(() => {
      if (heldPickerKey !== key) return;
      const changed = applyFlowPickerAction(key);
      if (changed) {
        persistState("saved");
        render();
      }
      repeatCount += 1;
      if (repeatCount === 6 && heldPickerIntervalId && intervalMs !== 70) {
        clearInterval(heldPickerIntervalId);
        intervalMs = 70;
        heldPickerIntervalId = setInterval(() => {
          if (heldPickerKey !== key) return;
          const acceleratedChanged = applyFlowPickerAction(key);
          if (acceleratedChanged) {
            persistState("saved");
            render();
          }
        }, intervalMs);
      }
    }, intervalMs);
  }, 260);
}

function openOverlay(kind) {
  state.ui.overlay = kind;
}

function closeOverlay() {
  state.ui.overlay = null;
}

function getAggregateRecordStats() {
  const recentSessions = state.storage.recentSessions ?? [];
  const totalAnswered = recentSessions.reduce((sum, entry) => sum + Number(entry.questionCount ?? 0), 0);
  const totalCorrect = recentSessions.reduce((sum, entry) => sum + Number(entry.correctCount ?? 0), 0);
  const totalTimedOut = recentSessions.reduce((sum, entry) => sum + Number(entry.timedOutCount ?? 0), 0);
  const totalIncorrect = recentSessions.reduce((sum, entry) => sum + Number(entry.incorrectCount ?? 0), 0);
  const totalMiss = totalIncorrect + totalTimedOut;
  const accuracy = totalAnswered > 0 ? ((totalCorrect / totalAnswered) * 100).toFixed(2) : "0.00";
  const uniqueDays = new Set(
    recentSessions
      .map((entry) => String(entry.endedAt ?? "").slice(0, 10))
      .filter(Boolean)
  ).size;

  return {
    playCount: recentSessions.length,
    uniqueDays,
    totalAnswered,
    totalCorrect,
    totalMiss,
    totalTimedOut,
    accuracy
  };
}

function getResultLabel(result) {
  if (!result) return "未実施";
  if (result.timedOut) return "時間切れ";
  return result.isCorrect ? "正解" : "不正解";
}

function getResultRowClass(result) {
  if (!result) return "result-row pending";
  if (result.timedOut) return "result-row timeout";
  return result.isCorrect ? "result-row correct" : "result-row incorrect";
}

function getResultBadgeTone(result) {
  if (!result) return "pending";
  if (result.timedOut) return "timeout";
  return result.isCorrect ? "correct" : "incorrect";
}

function renderReviewNumberTokens(numbers) {
  return numbers.map((value) => `<span class="review-number-token">${value}</span>`).join("");
}

function formatReplayKeyDisplay(seed) {
  if (!seed) return "未発行";
  return seed
    .split("/")
    .map((segment) => {
      const value = segment.trim();
      if (!value) return "";
      if (value.startsWith("preview-")) {
        return `R-${value.slice("preview-".length).toUpperCase()}`;
      }
      if (/^q\d+$/i.test(value)) {
        return value.toUpperCase();
      }
      return value;
    })
    .filter(Boolean)
    .join(" / ");
}

function getUserAnswerDisplay(userAnswer) {
  return userAnswer && userAnswer.trim() ? userAnswer : "未入力";
}

function renderSoftwareReportChips(items) {
  return `
    <div class="software-report-chip-grid">
      ${items
        .map(
          (item) => `
            <div class="software-report-chip">
              <span class="software-report-chip-label">${item.label}</span>
              <strong class="software-report-chip-value">${item.value}</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderOfficialSummaryRow(label, value, dataTestId = "") {
  const testIdAttribute = dataTestId ? ` data-testid="${dataTestId}"` : "";
  return `
    <div class="official-summary-row"${testIdAttribute}>
      <span class="official-summary-label">${label}</span>
      <strong class="official-summary-value">${value}</strong>
    </div>
  `;
}

function getSessionValidityLabel(setScore) {
  if (!setScore) return "n/a";
  return setScore.validSession ? "valid" : "invalidated";
}

function getSessionValidityDisplayLabel(setScore) {
  if (!setScore) return "判定なし";
  return setScore.validSession ? "有効" : "無効";
}

function getSetOutcomeDisplayLabel(setOutcome) {
  switch (setOutcome) {
    case "clear":
      return "クリア";
    case "almost":
      return "あと少し";
    case "retry":
      return "再練習";
    case "invalidated":
      return "無効";
    default:
      return "判定なし";
  }
}

function getSetOutcomeTone(setOutcome) {
  switch (setOutcome) {
    case "clear":
      return "success";
    case "almost":
      return "caution";
    case "retry":
    case "invalidated":
      return "alert";
    default:
      return "neutral";
  }
}

function getRecommendationDisplayLabel(recommendationEligible) {
  return recommendationEligible ? "受験推奨" : "練習継続";
}

function getCompatibilityTone(status) {
  if (status === "Verified") return "success";
  if (status === "Compatible") return "caution";
  return "alert";
}

function getCompatibilityStartLabel(status) {
  if (status === "Verified") return "この環境で開始できます";
  if (status === "Compatible") return "参考練習として開始できます";
  return "この環境では開始しません";
}

function getInvalidReasonDisplayLabel(reason) {
  switch (reason) {
    case "visibility-lost":
      return "画面が切り替わりました";
    case "viewport-changed":
      return "画面サイズが変わりました";
    case "fullscreen-exited":
      return "全画面表示が解除されました";
    default:
      return reason || "不明";
  }
}

function formatInvalidReasonSummary(reasons) {
  if (!reasons?.length) return "不明";
  return reasons.map((reason) => getInvalidReasonDisplayLabel(reason)).join(" / ");
}

function getFlowRouteLabel(route) {
  switch (route) {
    case APP_STATES.HOME:
      return "Home";
    case APP_STATES.GRADE_SELECT:
      return "GradeSelect";
    case APP_STATES.PRACTICE_SETUP:
      return "PracticeSetup";
    case APP_STATES.COMPATIBILITY_CHECK:
      return "CompatibilityCheck";
    case APP_STATES.SETUP_BLOCKED:
      return "SetupBlocked";
    case APP_STATES.SET_COUNTDOWN:
      return "SetCountdown";
    case APP_STATES.INVALIDATED_RESULTS:
      return "InvalidatedResults";
    default:
      return route;
  }
}

function getFlowRouteDisplayLabel(route) {
  switch (route) {
    case APP_STATES.HOME:
      return "ホーム";
    case APP_STATES.GRADE_SELECT:
      return "級段位選択";
    case APP_STATES.PRACTICE_SETUP:
      return "問題設定";
    case APP_STATES.COMPATIBILITY_CHECK:
      return "動作確認";
    case APP_STATES.SETUP_BLOCKED:
      return "開始不可";
    case APP_STATES.SET_COUNTDOWN:
      return "練習画面";
    case APP_STATES.SET_REVIEW_SUMMARY:
      return "結果確認";
    case APP_STATES.SET_RESULTS:
      return "問題別結果";
    case APP_STATES.REVIEW:
      return "復習確認";
    case APP_STATES.INVALIDATED_RESULTS:
      return "無効セッション";
    default:
      return "画面";
  }
}

function getQuestionStateDisplayLabel(questionState) {
  switch (questionState) {
    case QUESTION_STATES.READY:
      return "開始待ち";
    case QUESTION_STATES.COUNTDOWN:
      return "開始カウント";
    case QUESTION_STATES.PRESENTING:
      return "表示中";
    case QUESTION_STATES.AWAITING_ANSWER:
      return "回答入力";
    case QUESTION_STATES.SHOWING_ANSWER:
      return "答え表示";
    case QUESTION_STATES.SHOWING_JUDGEMENT:
      return "判定表示";
    case QUESTION_STATES.ADVANCE_PROMPT:
      return "次へ進む";
    default:
      return "待機";
  }
}

function getStagePhaseDisplayLabel(phase) {
  switch (phase) {
    case "countdown":
      return "開始カウント";
    case "presenting":
      return "表示中";
    case "gap":
      return "間隔";
    case "complete":
      return "表示終了";
    default:
      return "待機";
  }
}

function getFlowNavItems() {
  return [
    { key: APP_STATES.HOME, label: "ホーム" },
    { key: APP_STATES.GRADE_SELECT, label: "級段位" },
    { key: APP_STATES.PRACTICE_SETUP, label: "練習設定" },
    { key: APP_STATES.COMPATIBILITY_CHECK, label: "互換判定" },
    { key: APP_STATES.SET_COUNTDOWN, label: "出題" },
    { key: APP_STATES.SET_REVIEW_SUMMARY, label: "集計" },
    { key: APP_STATES.SET_RESULTS, label: "結果" },
    { key: APP_STATES.REVIEW, label: "復習" }
  ];
}

function renderFocusStageOverlay() {
  if (!isFocusStageVisible()) return "";

  const grade = getSelectedFlowGrade();
  const overlayStateClass = state.session.questionState === QUESTION_STATES.COUNTDOWN ? "is-countdown" : "is-presenting";
  return `
    <section class="focus-stage-overlay ${overlayStateClass}" data-testid="focus-stage-overlay" aria-live="polite">
      <div class="focus-stage-body focus-stage-body-plain">
        <canvas class="focus-stage-canvas" data-testid="focus-stage-canvas"></canvas>
      </div>
      <div class="sr-only">
        <p data-testid="focus-stage-grade">${grade.label}</p>
        <p data-testid="focus-stage-progress">第${state.session.currentIndex + 1}問 / ${state.session.questionCount}問</p>
        <p data-testid="focus-stage-note">表示終了後、答えを入力してください。</p>
      </div>
    </section>
  `;
}

function renderOfficialNav() {
  return `
    <nav class="official-nav" aria-label="sections">
      <ul class="official-nav-list">
        ${getFlowNavItems()
          .map((item) => {
            const active = state.flow.route === item.key;
            return `<li class="official-nav-item ${active ? "active" : ""}">${item.label}</li>`;
          })
          .join("")}
      </ul>
    </nav>
  `;
}

function renderHomeIconButton(testId = "flow-home-icon") {
  return `
    <button type="button" class="home-icon-button" data-testid="${testId}" aria-label="ホーム画面に戻る">
      <span class="home-icon-button-mark" aria-hidden="true">⌂</span>
    </button>
  `;
}

function renderSettingsOverlay() {
  const continueLabel = state.flow.route === APP_STATES.HOME ? "とじる" : "続ける";
  return `
    <section class="runtime-overlay" data-testid="runtime-overlay">
      <div class="runtime-overlay-backdrop" data-testid="overlay-backdrop"></div>
      <div class="runtime-overlay-window settings-overlay-window" role="dialog" aria-modal="true" aria-label="設定">
        <div class="runtime-overlay-header">
          <p class="runtime-overlay-title">設定</p>
          ${renderHomeIconButton("overlay-home-icon")}
        </div>
        <div class="settings-overlay-board">
          <div class="settings-audio-card">
            <p class="settings-card-title software-overlay-subtitle">音</p>
            <label class="settings-toggle-row">
              <span>スタート音</span>
              <input data-testid="settings-startcue-enabled" type="checkbox" ${state.preferences.startCueEnabled ? "checked" : ""} />
            </label>
            <label class="settings-slider-row">
              <span>スタート音量</span>
              <div class="settings-slider-stack">
                <input data-testid="settings-startcue-volume" type="range" min="0" max="100" value="${state.preferences.startCueVolume}" />
                <strong class="settings-value-pill">${state.preferences.startCueVolume}%</strong>
              </div>
            </label>
          </div>
          <div class="settings-language-card">
            <p class="settings-card-title software-overlay-subtitle">画面</p>
            <label class="settings-toggle-row">
              <span>全画面</span>
              <input data-testid="settings-fullscreen-enabled" type="checkbox" ${state.display.preferFullscreenStage ? "checked" : ""} />
            </label>
            <label class="settings-toggle-row">
              <span>スリープ防止</span>
              <input data-testid="settings-wakelock-enabled" type="checkbox" ${state.display.preferWakeLock ? "checked" : ""} />
            </label>
            <p class="settings-language-note">反映される設定だけを表示しています。</p>
          </div>
        </div>
        <div class="settings-overlay-actions">
          <button type="button" class="action official-pink-button" data-testid="settings-return-home">ホームへ</button>
          <button type="button" class="action official-green-button" data-testid="settings-continue">${continueLabel}</button>
        </div>
      </div>
    </section>
  `;
}

function renderRecordsOverlay() {
  const stats = getAggregateRecordStats();
  return `
    <section class="runtime-overlay" data-testid="runtime-overlay">
      <div class="runtime-overlay-backdrop" data-testid="overlay-backdrop"></div>
      <div class="runtime-overlay-window records-overlay-window" role="dialog" aria-modal="true" aria-label="成績">
        <div class="runtime-overlay-header">
          <p class="runtime-overlay-title">成績</p>
          ${renderHomeIconButton("overlay-home-icon")}
        </div>
        <div class="software-window-board records-overlay-board">
          <div class="records-stat-block">
            <p class="records-stat-title software-overlay-subtitle">状況</p>
            <dl class="records-stat-ledger">
              <div class="records-stat-row"><dt>保存数</dt><dd>${stats.playCount}</dd></div>
              <div class="records-stat-row"><dt>日数</dt><dd>${stats.uniqueDays}</dd></div>
              <div class="records-stat-row"><dt>総回答数</dt><dd>${stats.totalAnswered}</dd></div>
            </dl>
          </div>
          <div class="records-stat-block">
            <p class="records-stat-title software-overlay-subtitle">総合</p>
            <dl class="records-stat-ledger">
              <div class="records-stat-row"><dt>○ 記録</dt><dd>${stats.totalCorrect}</dd></div>
              <div class="records-stat-row"><dt>× 記録</dt><dd>${stats.totalMiss}</dd></div>
              <div class="records-stat-row"><dt>時間切れ</dt><dd>${stats.totalTimedOut}</dd></div>
              <div class="records-stat-row"><dt>正答率</dt><dd>${stats.accuracy}%</dd></div>
            </dl>
          </div>
        </div>
        <div class="settings-overlay-actions">
          <button type="button" class="action official-blue-button" data-testid="records-close">とじる</button>
        </div>
      </div>
    </section>
  `;
}

function renderRuntimeOverlay() {
  if (state.ui.overlay === "settings") return renderSettingsOverlay();
  if (state.ui.overlay === "records") return renderRecordsOverlay();
  return "";
}

function getStagePhaseLabel(phase) {
  switch (phase) {
    case "countdown":
      return "countdown";
    case "presenting":
      return "presenting";
    case "gap":
      return "gap";
    case "complete":
      return "complete";
    default:
      return "idle";
  }
}

function classifyCurrentPreset() {
  return classify20DanEnvironment({
    env: state.custom.env,
    metrics: state.custom.metrics,
    recentInvalidCount: state.custom.recentInvalidCount
  });
}

function syncFlowToStage() {
  stopStagePreview({ resetFrame: true });
  state.stage.selectedGradeId = state.flow.selectedGradeId;
  state.stage.selectedPracticeMode = state.flow.selectedPracticeMode;
}

function setFlowGrade(gradeId) {
  state.flow.selectedGradeId = gradeId;
  const grade = getSelectedFlowGrade();
  if (!grade.supportedPracticeModes.includes(state.flow.selectedPracticeMode)) {
    state.flow.selectedPracticeMode = derivePracticeModeFromTrainingMode(grade, state.flow.selectedTrainingMode);
  }
  syncFlowToStage();
}

function setFlowTrainingMode(mode) {
  state.flow.selectedTrainingMode = mode === "official" ? "official" : "free";
  state.flow.selectedPracticeMode = derivePracticeModeFromTrainingMode(getSelectedFlowGrade(), state.flow.selectedTrainingMode);
  syncFlowToStage();
}

function setFlowPracticeMode(mode) {
  state.flow.selectedPracticeMode = mode;
  state.flow.selectedTrainingMode = deriveTrainingModeFromPracticeMode(mode);
  syncFlowToStage();
}

function transitionFlow(event) {
  const nextRoute = nextAppState(state.flow.route, event, {
    selectedGradeLabel: getSelectedFlowGrade().label
  });
  state.flow.route = nextRoute;
}

function getCurrentPracticeSummary(classification) {
  const grade = getSelectedFlowGrade();
  const compatibilityStatus =
    [APP_STATES.SET_REVIEW_SUMMARY, APP_STATES.SET_RESULTS, APP_STATES.REVIEW, APP_STATES.INVALIDATED_RESULTS].includes(
      state.flow.route
    ) && state.session.setScore?.compatibilityStatus
      ? state.session.setScore.compatibilityStatus
      : classification.status;
  return {
    practiceClassification: classifyPracticeSession({
      grade,
      practiceMode: state.flow.selectedPracticeMode,
      compatibilityStatus
    }),
    recommendationEligible: isRecommendationEligible({
      grade,
      practiceMode: state.flow.selectedPracticeMode,
      compatibilityStatus
    })
  };
}

function getFlowSoftwareTone(route) {
  switch (route) {
    case APP_STATES.SET_COUNTDOWN:
    case APP_STATES.INVALIDATED_RESULTS:
      return "software-black";
    case APP_STATES.SET_REVIEW_SUMMARY:
    case APP_STATES.SET_RESULTS:
    case APP_STATES.REVIEW:
      return "software-pink";
    default:
      return "software-green";
  }
}

function clearThresholdForQuestionCount(questionCount) {
  return Math.max(1, Math.ceil(questionCount * 0.7));
}

function getCurrentSessionProblem() {
  return state.session.problemSet[state.session.currentIndex] ?? null;
}

function clearSessionTimers() {
  if (state.session.answerTimerId) {
    clearTimeout(state.session.answerTimerId);
    state.session.answerTimerId = null;
  }
  if (state.session.autoAdvanceTimerId) {
    clearTimeout(state.session.autoAdvanceTimerId);
    state.session.autoAdvanceTimerId = null;
  }
}

function stopSessionPresentation({ resetFrame = false } = {}) {
  clearSessionTimers();
  if (state.session.rafId) {
    cancelAnimationFrame(state.session.rafId);
    state.session.rafId = null;
  }
  state.session.runToken += 1;
  if (resetFrame) {
    state.session.questionFrame = createIdleFrame();
  }
}

function syncFlowToSession({ reset = false, seed: requestedSeed = null } = {}) {
  if (!reset && state.session.active) return;
  stopSessionPresentation({ resetFrame: true });
  const seed = requestedSeed ?? state.flow.pendingReplaySeed ?? createStageSeed();
  const questionCount = state.flow.pendingReplayQuestionCount ?? state.flow.questionCount;
  const problemSet =
    state.flow.pendingReplayProblemSet ??
    generateProblemSet({
      grade: getSelectedFlowGrade(),
      practiceMode: state.flow.selectedPracticeMode,
      seed,
      questionCount
    });
  state.session = {
    active: true,
    seed,
    gradeId: state.flow.selectedGradeId,
    practiceMode: state.flow.selectedPracticeMode,
    questionCount,
    answerTimeLimitSec: state.flow.answerTimeLimitSec,
    currentIndex: 0,
    problemSet,
    questionState: QUESTION_STATES.READY,
    questionFrame: createIdleFrame(),
    currentPlan: null,
    currentResult: null,
    questionResults: [],
    setScore: null,
    answerInput: "",
    answerTimerId: null,
    autoAdvanceTimerId: null,
    rafId: null,
    runToken: 0,
    invalidReasons: [],
    viewportBaseline: null,
    viewportGuardUntil: 0
  };
  state.flow.pendingReplaySeed = null;
  state.flow.pendingReplayProblemSet = null;
  state.flow.pendingReplayQuestionCount = null;
}

function getCurrentViewportMetrics() {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

function updateSessionViewportBaseline() {
  state.session.viewportBaseline = getCurrentViewportMetrics();
}

function shouldInvalidateForViewportChange(nextViewport) {
  if (state.flow.route !== APP_STATES.SET_COUNTDOWN) return false;
  if (
    ![
      QUESTION_STATES.COUNTDOWN,
      QUESTION_STATES.PRESENTING,
      QUESTION_STATES.AWAITING_ANSWER
    ].includes(state.session.questionState)
  ) {
    return false;
  }

  const now = performance.now();
  if (now < (state.session.viewportGuardUntil ?? 0)) {
    state.session.viewportBaseline = nextViewport;
    return false;
  }

  const baseline = state.session.viewportBaseline;
  if (!baseline) {
    state.session.viewportBaseline = nextViewport;
    return false;
  }

  const widthDelta = Math.abs(nextViewport.width - baseline.width);
  const heightDelta = Math.abs(nextViewport.height - baseline.height);
  const minorHeightOnlyShift = widthDelta === 0 && heightDelta < 120;

  if (minorHeightOnlyShift) {
    state.session.viewportBaseline = nextViewport;
    return false;
  }

  return widthDelta >= 120 || heightDelta >= 120;
}

function ensureSessionMatchesFlow() {
  const needsReset =
    !state.session.active ||
    state.session.gradeId !== state.flow.selectedGradeId ||
    state.session.practiceMode !== state.flow.selectedPracticeMode ||
    state.session.questionCount !== state.flow.questionCount ||
    state.session.answerTimeLimitSec !== state.flow.answerTimeLimitSec;

  if (needsReset) {
    syncFlowToSession({ reset: true });
  }
}

function scheduleSessionAnswerTimeout() {
  clearSessionTimers();
  state.session.answerTimerId = setTimeout(() => {
    submitSessionAnswer({ timedOut: true });
  }, state.session.answerTimeLimitSec * 1000);
}

function setSessionFrameFromResult(label) {
  const problem = getCurrentSessionProblem();
  state.session.questionFrame = {
    phase: label,
    displayText: label === "correct" ? "OK" : label === "timed-out" ? "TIME" : "MISS",
    progressLabel: `${state.session.currentIndex + 1} / ${state.session.questionCount}`,
    isVisible: true,
    completed: false
  };
  if (problem) {
    state.session.currentPlan = state.session.currentPlan ?? buildStagePlan({
      grade: getSelectedFlowGrade(),
      problem,
      speedMultiplier: 1
    });
  }
}

function finalizeSetIfNeeded() {
  if (state.session.currentIndex < state.session.questionCount - 1) {
    state.session.currentIndex += 1;
    state.session.questionState = QUESTION_STATES.READY;
    state.session.questionFrame = createIdleFrame();
    state.session.currentPlan = null;
    state.session.currentResult = null;
    state.session.answerInput = "";
    render();
    return;
  }

  const classification = classifyCurrentPreset();
  state.session.questionState = QUESTION_STATES.COMPLETED;
  state.session.setScore = scoreSet({
    questionResults: state.session.questionResults,
    clearThreshold: clearThresholdForQuestionCount(state.session.questionCount),
    validSession: true,
    compatibilityStatus: classification.status
  });
  state.storage.recentSessions = pushRecentSession(
    state.storage.recentSessions,
    createSessionHistoryEntry(state.session.setScore, classification)
  );
  persistState("saved");
  transitionFlow("SET_COMPLETED");
  render();
}

function pushCurrentResultAndAdvance() {
  if (state.session.currentResult) {
    state.session.questionResults = [...state.session.questionResults, state.session.currentResult];
  }
  finalizeSetIfNeeded();
}

function continueAfterJudgement() {
  if (state.flow.selectedPracticeMode === "exam-like") {
    pushCurrentResultAndAdvance();
    return;
  }

  state.session.questionState = nextQuestionState(QUESTION_STATES.SHOWING_JUDGEMENT, "CONTINUE", {
    practiceMode: state.flow.selectedPracticeMode,
    isLastQuestion: state.session.currentIndex === state.session.questionCount - 1
  });
  render();
}

function acknowledgeDisplayedAnswer() {
  const problem = getCurrentSessionProblem();
  state.session.currentResult = scoreQuestion({
    answer: problem.answer,
    userAnswer: "",
    revealedAnswer: true
  });
  state.session.questionState = nextQuestionState(QUESTION_STATES.SHOWING_ANSWER, "ACKNOWLEDGE", {
    practiceMode: state.flow.selectedPracticeMode,
    isLastQuestion: state.session.currentIndex === state.session.questionCount - 1
  });
  render();
}

function goToNextQuestion() {
  state.session.questionState = nextQuestionState(QUESTION_STATES.ADVANCE_PROMPT, "NEXT_QUESTION", {
    practiceMode: state.flow.selectedPracticeMode,
    isLastQuestion: state.session.currentIndex === state.session.questionCount - 1
  });
  if (state.session.questionState === QUESTION_STATES.COMPLETED) {
    pushCurrentResultAndAdvance();
    return;
  }
  pushCurrentResultAndAdvance();
}

function retryCurrentQuestion() {
  state.session.questionState = nextQuestionState(QUESTION_STATES.ADVANCE_PROMPT, "RETRY_SAME", {
    practiceMode: state.flow.selectedPracticeMode,
    isLastQuestion: state.session.currentIndex === state.session.questionCount - 1
  });
  state.session.questionState = nextQuestionState(state.session.questionState, "RETRY_BEGIN", {
    practiceMode: state.flow.selectedPracticeMode,
    isLastQuestion: state.session.currentIndex === state.session.questionCount - 1
  });
  state.session.currentResult = null;
  state.session.answerInput = "";
  state.session.questionFrame = createIdleFrame();
  state.session.currentPlan = null;
  render();
}

function beginSameSeedReplay() {
  state.flow.pendingReplaySeed = state.session.seed;
  state.flow.pendingReplayProblemSet = null;
  state.flow.pendingReplayQuestionCount = null;
  stopSessionPresentation({ resetFrame: true });

  if (getSelectedFlowGrade().compatibilityRequired) {
    state.flow.route = APP_STATES.COMPATIBILITY_CHECK;
    render();
    return;
  }

  state.flow.route = APP_STATES.SET_COUNTDOWN;
  syncFlowToSession({ reset: true });
  render();
}

function beginSingleProblemReplay(problemIndex) {
  const problem = state.session.problemSet[problemIndex];
  if (!problem) return;

  state.flow.pendingReplaySeed = `${state.session.seed} / Q${problemIndex + 1}`;
  state.flow.pendingReplayProblemSet = [structuredClone(problem)];
  state.flow.pendingReplayQuestionCount = 1;
  stopSessionPresentation({ resetFrame: true });

  if (getSelectedFlowGrade().compatibilityRequired) {
    state.flow.route = APP_STATES.COMPATIBILITY_CHECK;
    render();
    return;
  }

  state.flow.route = APP_STATES.SET_COUNTDOWN;
  syncFlowToSession({ reset: true });
  render();
}

function beginStoredSessionReplay(entryId) {
  const entry = state.storage.recentSessions.find((item) => item.id === entryId);
  if (!entry) return;

  stopSessionPresentation({ resetFrame: true });
  state.session.invalidReasons = [];
  const grade = applyStoredSessionFlow(entry);
  if (!grade) return;
  state.flow.questionCount = Math.max(1, entry.questionCount || 1);
  state.flow.answerTimeLimitSec = [5, 10, 15].includes(entry.answerTimeLimitSec)
    ? entry.answerTimeLimitSec
    : state.flow.answerTimeLimitSec;
  state.flow.pendingReplaySeed = entry.seed;
  state.flow.pendingReplayProblemSet = null;
  state.flow.pendingReplayQuestionCount = null;
  persistState("saved");

  if (grade.compatibilityRequired) {
    state.flow.route = APP_STATES.COMPATIBILITY_CHECK;
    render();
    return;
  }

  state.flow.route = APP_STATES.SET_COUNTDOWN;
  syncFlowToSession({ reset: true });
  render();
}

function openStoredSessionDetails(entryId, targetRoute = APP_STATES.SET_RESULTS) {
  const entry = state.storage.recentSessions.find((item) => item.id === entryId);
  if (!entry) return;

  stopSessionPresentation({ resetFrame: true });
  state.session.invalidReasons = structuredClone(entry.invalidReasons ?? []);
  const grade = applyStoredSessionFlow(entry);
  if (!grade) return;
  state.flow.questionCount = Math.max(1, entry.questionCount || entry.setScore?.questionCount || 1);
  state.flow.answerTimeLimitSec = [5, 10, 15].includes(entry.answerTimeLimitSec)
    ? entry.answerTimeLimitSec
    : state.flow.answerTimeLimitSec;
  state.session = {
    ...state.session,
    active: false,
    seed: entry.seed,
    gradeId: grade.id,
    practiceMode: state.flow.selectedPracticeMode,
    questionCount: state.flow.questionCount,
    answerTimeLimitSec: state.flow.answerTimeLimitSec,
    currentIndex: Math.max(0, state.flow.questionCount - 1),
    problemSet: structuredClone(entry.problemSet ?? []),
    questionState: QUESTION_STATES.COMPLETED,
    questionFrame: createCompleteFrame(`${state.flow.questionCount} / ${state.flow.questionCount}`),
    currentPlan: null,
    currentResult: null,
    questionResults: structuredClone(entry.questionResults ?? []),
    setScore: structuredClone(entry.setScore),
    answerInput: "",
    answerTimerId: null,
    autoAdvanceTimerId: null,
    rafId: null,
    runToken: state.session.runToken + 1
  };
  state.flow.route = targetRoute;
  persistState("saved");
  render();
}

function navigateToHome() {
  stopSessionPresentation({ resetFrame: true });
  state.session.invalidReasons = [];
  state.ui.overlay = null;
  state.flow.route = APP_STATES.HOME;
  render();
}

function abandonSessionToGradeSelect() {
  stopSessionPresentation({ resetFrame: true });
  state.session.invalidReasons = [];
  state.ui.overlay = null;
  state.flow.route = APP_STATES.GRADE_SELECT;
  render();
}

function sanitizeAnswerInput(value) {
  const normalized = String(value ?? "").replace(/[^\d-]+/g, "");
  const hasMinus = normalized.startsWith("-");
  const digitsOnly = normalized.replace(/-/g, "").slice(0, hasMinus ? 8 : 9);
  return hasMinus ? `-${digitsOnly}` : digitsOnly;
}

function setSessionAnswerInput(value) {
  state.session.answerInput = sanitizeAnswerInput(value);
}

function appendSessionAnswerDigit(digit) {
  if (state.session.questionState !== QUESTION_STATES.AWAITING_ANSWER) return;
  setSessionAnswerInput(`${state.session.answerInput}${digit}`);
  render();
}

function applySessionAnswerAction(action) {
  if (state.session.questionState !== QUESTION_STATES.AWAITING_ANSWER) return;
  if (action === "clear") {
    state.session.answerInput = "";
  }
  if (action === "backspace") {
    state.session.answerInput = state.session.answerInput.slice(0, -1);
  }
  if (action === "minus") {
    state.session.answerInput = state.session.answerInput.startsWith("-")
      ? state.session.answerInput.slice(1)
      : state.session.answerInput
        ? `-${state.session.answerInput}`
        : "-";
  }
  render();
}

function revealCurrentSessionAnswer() {
  if (state.session.questionState !== QUESTION_STATES.AWAITING_ANSWER) return;
  clearSessionTimers();
  const problem = getCurrentSessionProblem();
  state.session.currentResult = scoreQuestion({
    answer: problem.answer,
    userAnswer: state.session.answerInput,
    revealedAnswer: true
  });
  state.session.questionState = QUESTION_STATES.SHOWING_ANSWER;
  state.session.questionFrame = {
    phase: "answer",
    displayText: String(problem.answer),
    progressLabel: `${state.session.currentIndex + 1} / ${state.session.questionCount}`,
    isVisible: true,
    completed: false
  };
  render();
}

function focusSessionAnswerInput() {
  requestAnimationFrame(() => {
    const input = app.querySelector('[data-testid="session-answer-input"]');
    if (!(input instanceof HTMLInputElement)) return;
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
    const caret = input.value.length;
    input.setSelectionRange(caret, caret);
  });
}

function runSessionPrimaryAction() {
  if (state.flow.route !== APP_STATES.SET_COUNTDOWN) return false;

  switch (state.session.questionState) {
    case QUESTION_STATES.READY:
      startSessionQuestion();
      return true;
    case QUESTION_STATES.AWAITING_ANSWER:
      submitSessionAnswer();
      return true;
    case QUESTION_STATES.SHOWING_ANSWER:
      acknowledgeDisplayedAnswer();
      return true;
    case QUESTION_STATES.SHOWING_JUDGEMENT:
      if (state.flow.selectedPracticeMode === "exam-like") return false;
      continueAfterJudgement();
      return true;
    case QUESTION_STATES.ADVANCE_PROMPT:
      goToNextQuestion();
      return true;
    default:
      return false;
  }
}

function submitSessionAnswer({ timedOut = false } = {}) {
  if (state.session.questionState !== QUESTION_STATES.AWAITING_ANSWER) return;

  clearSessionTimers();
  const problem = getCurrentSessionProblem();
  state.session.currentResult = scoreQuestion({
    answer: problem.answer,
    userAnswer: state.session.answerInput,
    timedOut
  });
  state.session.questionState = nextQuestionState(QUESTION_STATES.AWAITING_ANSWER, timedOut ? "TIMEOUT" : "SUBMIT", {
    practiceMode: state.flow.selectedPracticeMode,
    isLastQuestion: state.session.currentIndex === state.session.questionCount - 1
  });
  setSessionFrameFromResult(
    timedOut ? "timed-out" : state.session.currentResult.isCorrect ? "correct" : "incorrect"
  );
  render();

  if (state.flow.selectedPracticeMode === "exam-like") {
    state.session.autoAdvanceTimerId = setTimeout(() => {
      pushCurrentResultAndAdvance();
    }, 900);
  }
}

function handleSessionPresentationComplete() {
  const problem = getCurrentSessionProblem();
  const nextState = nextQuestionState(QUESTION_STATES.PRESENTING, "PRESENT_DONE", {
    practiceMode: state.flow.selectedPracticeMode,
    isLastQuestion: state.session.currentIndex === state.session.questionCount - 1
  });
  state.session.questionState = nextState;

  if (nextState === QUESTION_STATES.SHOWING_ANSWER) {
    state.session.questionFrame = {
      phase: "answer",
      displayText: String(problem.answer),
      progressLabel: `${state.session.currentIndex + 1} / ${state.session.questionCount}`,
      isVisible: true,
      completed: false
    };
  } else if (nextState === QUESTION_STATES.AWAITING_ANSWER) {
    state.session.questionFrame = {
      phase: "awaiting",
      displayText: "",
      progressLabel: `${state.session.currentIndex + 1} / ${state.session.questionCount}`,
      isVisible: false,
      completed: false
    };
    scheduleSessionAnswerTimeout();
  }

  render();
}

async function startSessionQuestion() {
  ensureSessionMatchesFlow();
  if (state.session.questionState !== QUESTION_STATES.READY) return;

  stopSessionPresentation({ resetFrame: true });
  const grade = getSelectedFlowGrade();
  const problem = getCurrentSessionProblem();
  const plan = buildStagePlan({
    grade,
    problem,
    speedMultiplier: 1
  });

  state.session.currentPlan = plan;
  state.session.questionState = nextQuestionState(QUESTION_STATES.READY, "BEGIN_COUNTDOWN", {
    practiceMode: state.flow.selectedPracticeMode,
    isLastQuestion: state.session.currentIndex === state.session.questionCount - 1
  });
  state.session.answerInput = "";
  state.session.questionFrame = getStageFrame(plan, 0);
  updateSessionViewportBaseline();
  state.session.viewportGuardUntil = performance.now() + 800;
  render();
  await Promise.all([attemptSessionFullscreen(), attemptWakeLock()]);
  await playSessionStartCue();
  updateSessionViewportBaseline();

  const runToken = state.session.runToken + 1;
  state.session.runToken = runToken;
  const startTimestamp = performance.now();

  function tick(timestamp) {
    if (state.session.runToken !== runToken) return;

    const elapsed = timestamp - startTimestamp;
    const frame = getStageFrame(plan, elapsed);
    state.session.questionFrame = frame;
    state.session.questionState =
      elapsed < plan.countdownDurationMs ? QUESTION_STATES.COUNTDOWN : QUESTION_STATES.PRESENTING;
    updateSessionDom();

    if (frame.completed) {
      state.session.rafId = null;
      handleSessionPresentationComplete();
      return;
    }

    state.session.rafId = requestAnimationFrame(tick);
  }

  state.session.rafId = requestAnimationFrame(tick);
}

function renderFlowPanel(classification) {
  const grade = getSelectedFlowGrade();
  const { practiceClassification, recommendationEligible } = getCurrentPracticeSummary(classification);
  const routeLabel = getFlowRouteLabel(state.flow.route);
  const noCarryLabel = isNoCarryGrade(grade) ? "運手のみ / no-carry" : "通常作問";
  const currentProblem = getCurrentSessionProblem();
  const clearThreshold = clearThresholdForQuestionCount(state.flow.questionCount);
  const guardianLocked = isGuardianSettingsLocked();
  const softwareTone = getFlowSoftwareTone(state.flow.route);
  const shellClass = `card card-wide app-shell software-shell ${softwareTone}`;
  const panelClass = `app-flow-panel software-panel ${softwareTone}`;
  const formClass = `stage-controls software-panel ${softwareTone}`;
  const setOutcome = state.session.setScore?.setOutcome ?? "n/a";
  const setOutcomeTone = getSetOutcomeTone(setOutcome);
  const setOutcomeDisplayLabel = getSetOutcomeDisplayLabel(setOutcome);
  const sessionState = state.session.questionState;
  const sessionBoardToneClass = [QUESTION_STATES.COUNTDOWN, QUESTION_STATES.PRESENTING].includes(sessionState)
    ? "session-tone-stage"
    : "session-tone-board";
  const sessionBoardStateClass =
    sessionState === QUESTION_STATES.AWAITING_ANSWER
      ? "session-state-answering"
      : [QUESTION_STATES.SHOWING_JUDGEMENT, QUESTION_STATES.SHOWING_ANSWER, QUESTION_STATES.ADVANCE_PROMPT].includes(sessionState)
        ? "session-state-centered"
        : "";
  const showSessionMetaBoards = [QUESTION_STATES.READY, QUESTION_STATES.COUNTDOWN, QUESTION_STATES.PRESENTING].includes(
    sessionState
  );
  const routeBadgeMarkup = `<p class="route-badge" aria-hidden="true">${getFlowRouteDisplayLabel(state.flow.route)}</p><p class="sr-only" data-testid="flow-route">${routeLabel}</p>`;
  const formatSecondsLabel = (seconds) =>
    seconds == null
      ? "image"
      : `${seconds
          .toFixed(seconds < 10 ? 2 : 0)
          .replace(/\.00$/, "")
          .replace(/(\.\d)0$/, "$1")}秒`;
  const sessionTimeLabel =
    grade.mode === "image" && typeof (grade.hardTimeSec ?? grade.officialTimeSec) !== "number"
      ? "イメージ"
      : formatSecondsLabel(grade.hardTimeSec ?? grade.officialTimeSec);
  const officialGradeRows = [
    { tone: "dan-top", gradeIds: ["dan_20", "dan_19", "dan_18", "dan_17", "dan_16"] },
    { tone: "dan-upper", gradeIds: ["dan_15", "dan_14", "dan_13", "dan_12", "dan_11"] },
    { tone: "dan-mid", gradeIds: ["dan_10", "dan_9", "dan_8", "dan_7", "dan_6"] },
    { tone: "dan-base", gradeIds: ["dan_5", "dan_4", "dan_3", "dan_2", "dan_0"] },
    { tone: "kyu-upper", gradeIds: ["kyu_1", "kyu_2", "kyu_3", "kyu_4", "kyu_5"] },
    { tone: "kyu-mid", gradeIds: ["kyu_6", "kyu_7", "kyu_8", "kyu_9", "kyu_10"] },
    { tone: "kyu-low", gradeIds: ["kyu_11", "kyu_12", "kyu_13", "kyu_14", "kyu_15"] },
    { tone: "kyu-entry", gradeIds: ["kyu_16", "kyu_17", "kyu_18", "kyu_19", "kyu_20"] }
  ];
  const resultMascotMarkup = `
    <div class="software-character-row" aria-hidden="true">
      <span class="software-avatar avatar-boy"></span>
      <span class="software-avatar avatar-girl"></span>
    </div>
  `;

  if (state.flow.route === APP_STATES.HOME) {
    return `
      <article class="${shellClass}" data-testid="app-shell">
        <div class="official-title-screen ${panelClass}" data-testid="flow-home-screen">
          <div class="official-title-stage">
            <div class="official-title-badge">日本式</div>
            <div class="official-title-logo">
              <p class="official-title-kicker">まいにち続けて ぐんぐん 伸びる</p>
              <h2 class="official-title-heading">フラッシュ暗算</h2>
              <p class="official-title-heading-sub">自宅練習ソフト</p>
            </div>
            <div class="official-title-figures" aria-hidden="true">
              <span class="official-title-figure figure-red"></span>
              <span class="official-title-figure figure-blue"></span>
              <span class="official-title-figure figure-pink"></span>
              <span class="official-title-figure figure-green"></span>
            </div>
            <button type="button" class="official-title-start" data-testid="flow-open-grade-select">はじめる</button>
            <button type="button" class="sr-only" data-testid="flow-open-grade-select-display">表示方式で開始</button>
            <p class="official-title-note">非公式 / 自宅練習用</p>
          </div>
        </div>
      </article>
    `;
  }

  if (state.flow.route === APP_STATES.GRADE_SELECT) {
    const stats = getAggregateRecordStats();
    const freeCards = getFreeConfigCards();
    return `
      <article class="${shellClass}" data-testid="app-shell">
        <p class="sr-only" data-testid="flow-route">${routeLabel}</p>
        <div class="official-mode-grade-screen ${panelClass} ${state.flow.selectedTrainingMode === "official" ? "is-official" : "is-free"}" data-testid="flow-grade-screen">
          <div class="official-grade-topbar">
            ${renderHomeIconButton("flow-back-home")}
            <div class="official-grade-heading">
              <p class="official-grade-title-main">${
                state.flow.selectedTrainingMode === "official"
                  ? "<span>日本フラッシュ暗算</span><span>検定協会</span>"
                  : "自由練習"
              }</p>
              <p class="official-grade-title-sub">${state.flow.selectedTrainingMode === "official" ? "準拠問題 / 段位を設定してください。" : "練習項目を設定してください。"}</p>
            </div>
          </div>
          <div class="official-mode-grade-body">
            <div class="official-grade-left-column">
              <div class="official-mode-card official-mode-panel">
                <p class="official-panel-title">モード</p>
                <button
                  type="button"
                  class="official-mode-button ${state.flow.selectedTrainingMode === "free" ? "active" : ""}"
                  data-testid="flow-mode-free"
                ><span class="official-mode-button-label">${getModeCardButtonLabel("free")}</span></button>
                <button
                  type="button"
                  class="official-mode-button ${state.flow.selectedTrainingMode === "official" ? "active" : ""}"
                  data-testid="flow-mode-official"
                ><span class="official-mode-button-label official-mode-button-label-multiline"><span>フラッシュ暗算協会の</span><span>検定問題</span></span></button>
              </div>
              <div class="official-record-card official-record-panel">
                <p class="official-panel-title">記録</p>
                <div class="official-record-summary">
                  <div class="official-record-row"><span>○</span><strong>${stats.totalCorrect}</strong></div>
                  <div class="official-record-row"><span>×</span><strong>${stats.totalMiss}</strong></div>
                </div>
              </div>
            </div>
            <div class="official-grade-right-column">
              <div class="official-grade-center">
                ${
                  state.flow.selectedTrainingMode === "official"
                    ? `
                      <div class="official-grade-selector-card">
                        <p class="official-panel-title">級・段位</p>
                        <button type="button" class="official-grade-arrow up" data-testid="flow-grade-prev" ${guardianLocked || getFlowGradeIndex() === gradeProfile.grades.length - 1 ? "disabled" : ""}>▲</button>
                        <p class="official-grade-big" data-testid="flow-grade-label">${grade.label}</p>
                        <button type="button" class="official-grade-arrow down" data-testid="flow-grade-next" ${guardianLocked || getFlowGradeIndex() === 0 ? "disabled" : ""}>▼</button>
                        <label class="sr-only">
                          補助選択
                          <select data-testid="flow-grade-select" name="flowGrade" ${guardianLocked ? "disabled" : ""}>
                            ${gradeProfile.grades
                              .map(
                                (item) =>
                                  `<option value="${item.id}" ${item.id === grade.id ? "selected" : ""}>${item.label}</option>`
                              )
                              .join("")}
                          </select>
                        </label>
                      </div>
                    `
                    : `
                      <div class="official-free-config-board" data-testid="flow-free-config-board">
                        ${freeCards
                          .map(
                            (item) => `
                              <button
                                type="button"
                                class="official-free-config-card ${state.flow.freeConfig.activeField === item.field ? "active" : ""}"
                                data-testid="flow-free-${item.field}-card"
                                data-free-config-field="${item.field}"
                              >
                                <span class="official-panel-title">${item.label}</span>
                                ${
                                  state.flow.freeConfig.activeField === item.field
                                    ? `<span class="official-free-config-arrow up" data-testid="flow-free-${item.field}-up">▲</span>`
                                    : '<span class="official-free-config-arrow placeholder" aria-hidden="true"></span>'
                                }
                                <strong class="official-free-config-value" data-testid="flow-free-${item.field}-value">${getFreePracticeFieldValueLabel(item.field, item.value)}</strong>
                                ${
                                  state.flow.freeConfig.activeField === item.field
                                    ? `<span class="official-free-config-arrow down" data-testid="flow-free-${item.field}-down">▼</span>`
                                    : '<span class="official-free-config-arrow placeholder" aria-hidden="true"></span>'
                                }
                              </button>
                            `
                          )
                          .join("")}
                      </div>
                    `
                }
              </div>
              <div class="official-grade-bottom-bar">
                <button type="button" class="official-bottom-button blue" data-testid="flow-open-records">成績</button>
                <button type="button" class="official-bottom-button blue" data-testid="flow-open-settings">設定</button>
                <button type="button" class="official-bottom-button green" data-testid="flow-start-set">あたらしくスタート</button>
              </div>
            </div>
          </div>
          ${
            developerMode
              ? `
                <div class="developer-flow-controls" data-testid="developer-flow-controls">
                  <label class="developer-flow-field">練習方式
                    <select data-testid="flow-practice-mode" name="flowPracticeMode" ${guardianLocked ? "disabled" : ""}>
                      ${grade.supportedPracticeModes
                        .map(
                          (mode) =>
                            `<option value="${mode}" ${mode === state.flow.selectedPracticeMode ? "selected" : ""}>${getPracticeModeLabel(mode)}</option>`
                        )
                        .join("")}
                    </select>
                  </label>
                  <label class="developer-flow-field">問題数
                    <select data-testid="flow-question-count" name="flowQuestionCount" ${guardianLocked ? "disabled" : ""}>
                      ${[1, 5, 10, 15]
                        .map(
                          (count) =>
                            `<option value="${count}" ${count === state.flow.questionCount ? "selected" : ""}>${count}問</option>`
                        )
                        .join("")}
                    </select>
                  </label>
                  <label class="developer-flow-field">回答制限
                    <select data-testid="flow-answer-time-limit" name="flowAnswerTimeLimit" ${guardianLocked ? "disabled" : ""}>
                      ${[5, 10, 15]
                        .map(
                          (seconds) =>
                            `<option value="${seconds}" ${seconds === state.flow.answerTimeLimitSec ? "selected" : ""}>${seconds}秒</option>`
                        )
                        .join("")}
                    </select>
                  </label>
                </div>
              `
              : ""
          }
        </div>
      </article>
    `;
  }

  if (state.flow.route === APP_STATES.PRACTICE_SETUP) {
    return `
      <article class="${shellClass}" data-testid="app-shell">
        <div class="app-shell-header">
          <div>
            <p class="eyebrow">フラッシュ暗算 練習用</p>
            <p class="app-shell-notice">非公式 / 自宅練習用</p>
            <h2>問題設定</h2>
          </div>
          <div class="app-shell-header-actions">
            ${routeBadgeMarkup}
            ${renderHomeIconButton("flow-home-icon")}
          </div>
        </div>
        <div class="app-flow-grid">
          <form class="${formClass} software-settings-form official-setup-screen" data-testid="flow-setup-screen">
            <div class="official-setup-head">
              <p class="official-setup-head-title">問題設定</p>
              <p class="official-setup-head-note">${getVisiblePracticeLabel()}で条件を選びます</p>
            </div>
            <div class="official-setup-marquee" aria-hidden="true">
              <span class="official-setup-chip">${grade.label}</span>
              <span class="official-setup-chip">${grade.digits}桁 ${grade.count}口</span>
              <span class="official-setup-chip">${grade.mode === "image" ? "イメージ" : sessionTimeLabel}</span>
            </div>
            <div class="software-tabs">
              <span class="${state.flow.selectedTrainingMode === "free" ? "active" : ""}">自由練習モード</span>
              <span class="${state.flow.selectedTrainingMode === "official" ? "active" : ""}">フラッシュ暗算協会の検定問題</span>
              <span class="${state.flow.selectedPracticeMode === "display" ? "active" : ""}">表示練習</span>
            </div>
            <label class="field software-setting-row">
              <span>練習方式</span>
              <select data-testid="flow-practice-mode" name="flowPracticeMode" ${guardianLocked ? "disabled" : ""}>
                ${grade.supportedPracticeModes
                  .map(
                    (mode) =>
                      `<option value="${mode}" ${mode === state.flow.selectedPracticeMode ? "selected" : ""}>${getPracticeModeLabel(mode)}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label class="field software-setting-row">
              <span>問題数</span>
              <select data-testid="flow-question-count" name="flowQuestionCount" ${guardianLocked ? "disabled" : ""}>
                ${[1, 5, 10, 15]
                  .map(
                    (count) =>
                      `<option value="${count}" ${count === state.flow.questionCount ? "selected" : ""}>${count}問</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label class="field software-setting-row">
              <span>回答制限</span>
              <select data-testid="flow-answer-time-limit" name="flowAnswerTimeLimit" ${guardianLocked ? "disabled" : ""}>
                ${[5, 10, 15]
                  .map(
                    (seconds) =>
                      `<option value="${seconds}" ${seconds === state.flow.answerTimeLimitSec ? "selected" : ""}>${seconds}秒</option>`
                  )
                  .join("")}
              </select>
            </label>
            <div class="actions official-setup-actions">
              <button type="button" class="action secondary official-blue-button" data-testid="flow-back-grade-select">戻る(Esc)</button>
              <button type="button" class="action official-red-button" data-testid="flow-start-set">スタート(Enter)</button>
            </div>
          </form>
          <div class="${panelClass} software-settings-summary official-setup-summary official-summary-board">
            <p class="official-summary-title">設定確認</p>
            ${renderOfficialSummaryRow("級段", grade.label, "flow-setup-grade")}
            ${renderOfficialSummaryRow("モード", getVisiblePracticeLabel(), "flow-setup-training-mode")}
            ${renderOfficialSummaryRow("公式時間", grade.officialTimeSec ? formatSecondsLabel(grade.officialTimeSec) : "イメージ方式")}
            ${renderOfficialSummaryRow("練習時間", grade.hardTimeSec ? formatSecondsLabel(grade.hardTimeSec) : "イメージ方式")}
            ${renderOfficialSummaryRow("運手条件", noCarryLabel)}
            ${renderOfficialSummaryRow("分類", practiceClassification, "flow-practice-classification")}
            ${renderOfficialSummaryRow("受験推奨", getRecommendationDisplayLabel(recommendationEligible), "flow-recommendation")}
            ${renderOfficialSummaryRow(
              "20段判定",
              grade.compatibilityRequired ? classification.label : "対象外",
              "flow-gate-status"
            )}
            ${guardianLocked ? renderOfficialSummaryRow("保護者ロック", "設定変更不可", "flow-guardian-state") : ""}
          </div>
        </div>
      </article>
    `;
  }

  if (state.flow.route === APP_STATES.SET_COUNTDOWN) {
    ensureSessionMatchesFlow();
    return `
      <article class="${shellClass}" data-testid="app-shell">
        <p class="sr-only" data-testid="flow-route">${routeLabel}</p>
        <div class="software-session-screen session-layout">
          <div class="software-session-board session-panel ${sessionBoardToneClass} ${sessionBoardStateClass}">
            ${
              [QUESTION_STATES.COUNTDOWN, QUESTION_STATES.PRESENTING].includes(state.session.questionState)
                ? '<canvas class="stage-canvas software-session-canvas" data-testid="session-canvas"></canvas>'
                : ""
            }
            <div class="software-session-center ${
              state.session.questionState === QUESTION_STATES.AWAITING_ANSWER
                ? "is-answering"
                : [QUESTION_STATES.SHOWING_JUDGEMENT, QUESTION_STATES.SHOWING_ANSWER, QUESTION_STATES.ADVANCE_PROMPT].includes(
                      state.session.questionState
                    )
                  ? "is-centered"
                  : ""
            }">
              ${
                showSessionMetaBoards
                  ? `
                    <p class="software-session-brand">フラッシュ暗算 練習用ソフト</p>
                    <div class="software-session-marquee-frame">
                      <p class="software-session-strip-title">現在の条件</p>
                      <div class="software-session-marquee">
                        <p class="software-session-pill software-session-pill-grade" data-testid="session-grade">${grade.label}</p>
                        <p class="software-session-pill">${grade.digits}桁 ${grade.count}口</p>
                        <p class="software-session-pill">${sessionTimeLabel}</p>
                        <p class="software-session-pill" data-testid="session-progress">${state.session.currentIndex + 1} / ${state.session.questionCount}</p>
                      </div>
                    </div>
                  `
                  : `
                    <div class="software-session-compact-strip">
                      <p class="software-session-pill software-session-pill-grade" data-testid="session-grade">${grade.label}</p>
                      <p class="software-session-pill">${grade.digits}桁 ${grade.count}口</p>
                      <p class="software-session-pill">${sessionTimeLabel}</p>
                      <p class="software-session-pill" data-testid="session-progress">${state.session.currentIndex + 1} / ${state.session.questionCount}</p>
                    </div>
                  `
              }
              ${
                state.session.questionState === QUESTION_STATES.READY
                  ? `
                    <div class="software-session-ready-board">
                      <p class="software-session-ready-title">第${state.session.currentIndex + 1}問</p>
                      <p class="software-session-ready-triplet" data-testid="session-ready-triplet">${grade.digits}桁　${grade.count}口　${sessionTimeLabel}</p>
                      <p class="software-session-note">ピー・ピーのあと、一拍おいて表示します。</p>
                    </div>
                  `
                  : ""
              }
              ${
                state.session.questionState === QUESTION_STATES.SHOWING_ANSWER
                  ? `
                    <div class="software-session-ready-board software-session-state-card software-session-answer-reveal-card">
                      <p class="software-session-ready-title">答え</p>
                      <p class="software-session-answer-number" data-testid="session-answer-reveal">${currentProblem.answer}</p>
                      <div class="software-session-inline-actions">
                        <button type="button" class="action" data-testid="session-acknowledge-answer">次へ</button>
                      </div>
                    </div>
                  `
                  : ""
              }
              ${
                state.session.questionState === QUESTION_STATES.AWAITING_ANSWER
                  ? `
                    <div class="software-session-answer-stage">
                      <div class="software-session-answer-frame">
                        <div class="software-session-answer-guide-inline">
                          <p class="software-session-prompt software-session-prompt-inline">入力後に決定</p>
                          <p class="software-session-note software-session-note-inline" data-testid="session-answer-time-limit">Enter決定 / 制限 ${state.flow.answerTimeLimitSec}秒</p>
                        </div>
                        <div class="software-session-answer-shell">
                          <label class="software-session-answer-box">
                            <span class="sr-only">Answer</span>
                            <input data-testid="session-answer-input" name="sessionAnswer" inputmode="text" autocomplete="off" value="${state.session.answerInput}" />
                          </label>
                        </div>
                        <div class="software-session-answer-controls">
                          <div class="official-session-reveal-shell">
                            <button type="button" class="official-decision-button official-reveal-button" data-testid="session-reveal-answer">答を見る</button>
                          </div>
                          <div class="official-session-keypad-shell">
                            <div class="official-session-keypad">
                            ${[
                              ["clear", "7", "8", "9"],
                              ["minus", "4", "5", "6"],
                              ["0", "1", "2", "3"]
                            ]
                              .map(
                                (row) => `
                                  <div class="official-session-keypad-row compact">
                                    ${row
                                      .map((key) => {
                                        if (key === "clear") {
                                          return '<button type="button" class="official-keypad-button utility purple" data-keypad-action="backspace">◀</button>';
                                        }
                                        if (key === "minus") {
                                          return '<button type="button" class="official-keypad-button utility blue" data-keypad-action="minus">-</button>';
                                        }
                                        return `<button type="button" class="official-keypad-button" data-keypad-key="${key}">${key}</button>`;
                                      })
                                      .join("")}
                                  </div>
                                `
                              )
                              .join("")}
                            </div>
                          </div>
                          <div class="official-session-submit-shell">
                            <button type="button" class="official-decision-button" data-testid="session-submit-answer">決定</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  `
                  : ""
              }
              ${
                state.session.questionState === QUESTION_STATES.SHOWING_JUDGEMENT
                  ? `
                    <div class="software-session-judgement-stack">
                      <div class="software-session-judgement-shell ${state.session.currentResult?.timedOut ? "timeout" : state.session.currentResult?.isCorrect ? "correct" : "incorrect"}">
                        <p class="software-session-ready-title">判定</p>
                        <p class="software-session-prompt">
                          <span aria-hidden="true">${
                            state.session.currentResult?.timedOut
                              ? "時間切れ"
                              : state.session.currentResult?.isCorrect
                                ? "正解"
                                : "不正解"
                          }</span>
                          <span class="sr-only" data-testid="session-judgement">${
                            state.session.currentResult?.timedOut
                              ? "時間切れ"
                              : state.session.currentResult?.isCorrect
                                ? "正解"
                                : "不正解"
                          }</span>
                        </p>
                        ${
                          !state.session.currentResult?.isCorrect
                            ? `<div class="software-session-compare"><p>正解 ${currentProblem.answer}</p><p>入力 ${getUserAnswerDisplay(state.session.currentResult?.userAnswer)}</p></div>`
                            : ""
                        }
                        ${
                          state.flow.selectedPracticeMode === "exam-like"
                            ? "<p class=\"software-session-note software-session-note-centered\">自動で次へ進みます。</p>"
                            : `<div class="software-session-inline-actions">
                                <button type="button" class="action" data-testid="session-continue-after-judgement">次へ</button>
                              </div>`
                        }
                      </div>
                    </div>
                  `
                  : ""
              }
              ${
                state.session.questionState === QUESTION_STATES.ADVANCE_PROMPT
                  ? `
                    <div class="software-session-ready-board software-session-state-card software-session-advance-card">
                      <p class="software-session-ready-title">${
                        state.session.currentIndex === state.session.questionCount - 1 ? "終了" : "次へ"
                      }</p>
                      <p class="software-session-prompt">${
                        state.session.currentIndex === state.session.questionCount - 1 ? "セットを終了します" : "次の問題へ進みます"
                      }</p>
                      <p class="software-session-note software-session-note-centered">必要なら同じ問題を再挑戦できます。</p>
                      <div class="software-session-inline-actions">
                        ${
                          state.flow.selectedPracticeMode !== "exam-like"
                            ? '<button type="button" class="action secondary" data-testid="session-retry-question">同じ問題</button>'
                            : ""
                        }
                        <button type="button" class="action" data-testid="session-next-question">${
                          state.session.currentIndex === state.session.questionCount - 1 ? "終了" : "次へ"
                        }</button>
                      </div>
                    </div>
                  `
                  : ""
              }
              ${
                [QUESTION_STATES.COUNTDOWN, QUESTION_STATES.PRESENTING].includes(state.session.questionState)
                  ? `
                    <p class="software-session-grade" data-testid="session-grade">${grade.label}</p>
                    <p class="software-session-detail">${grade.digits}桁　${grade.count}口　${sessionTimeLabel}</p>
                    <p class="software-session-question" data-testid="session-progress">${state.session.currentIndex + 1} / ${state.session.questionCount}</p>
                  `
                  : ""
              }
              <p data-testid="session-answer-key" class="sr-only">${currentProblem ? currentProblem.answer : ""}</p>
              ${
                showSessionMetaBoards
                  ? `
                    <div class="software-session-status-frame">
                      <p class="software-session-strip-title">現在の状態</p>
                      <div class="software-session-status-strip">
                        <p>練習方式: ${getVisiblePracticeLabel()}</p>
                        <p>現在状態: ${getQuestionStateDisplayLabel(state.session.questionState)}</p>
                        <p>20段判定: ${grade.compatibilityRequired ? classification.label : "通常練習"}</p>
                        <p>運手条件: ${noCarryLabel}</p>
                      </div>
                    </div>
                  `
                  : ""
              }
              ${
                ![QUESTION_STATES.COUNTDOWN, QUESTION_STATES.PRESENTING].includes(state.session.questionState)
                  ? `
                    <div class="software-session-nav-row">
                      <button type="button" class="session-nav-button" data-testid="session-back-grade-select">級・段位へ戻る</button>
                      <button type="button" class="session-nav-button secondary" data-testid="session-back-home">ホームへ</button>
                    </div>
                  `
                  : ""
              }
              <div class="stage-debug sr-only">
                <p data-testid="session-mode">モード: ${getPracticeModeLabel(state.flow.selectedPracticeMode)}</p>
                <p data-testid="session-seed">Seed: ${state.session.seed ?? "n/a"}</p>
                <p data-testid="session-focus-status">競技画面: ${isFocusStageVisible() ? "focus active" : "windowed"}</p>
                <p data-testid="session-fullscreen-status">fullscreen: ${getFullscreenStatusLabel()}</p>
                <p data-testid="session-wakelock-status">wake lock: ${getWakeLockStatusLabel()}</p>
                <p data-testid="session-phase">Phase: ${state.session.questionState}</p>
                <p data-testid="session-visible">Visible: ${state.session.questionFrame.displayText || "blank"}</p>
              </div>
            </div>
          </div>
          ${
            state.session.questionState === QUESTION_STATES.READY
              ? `
                <div class="software-session-actions">
                  <div class="software-session-actions-frame">
                    <p class="software-session-actions-title">操作</p>
                    <div class="actions"><button type="button" class="action" data-testid="session-start-question">あたらしくスタート</button></div>
                  </div>
                </div>
              `
              : ""
          }
        </div>
      </article>
    `;
  }

  if (state.flow.route === APP_STATES.SET_REVIEW_SUMMARY) {
    return `
      <article class="${shellClass} software-report-shell" data-testid="app-shell">
        <p class="sr-only" data-testid="flow-route">${routeLabel}</p>
        <div class="${panelClass} software-dialog-window software-report-window" data-testid="flow-summary-screen">
          <div class="software-window-titlebar">
            <p class="software-window-title">結果確認</p>
            <p class="software-window-chip">${grade.label} / ${getVisiblePracticeLabel()}</p>
          </div>
          <div class="software-window-board software-summary-board">
            <div class="software-summary-grid">
              <div class="software-summary-pane">
                <div class="software-result-hero">
                  ${resultMascotMarkup}
                  <div class="software-result-hero-copy">
                    <p class="software-result-grade">${grade.label}</p>
                    <p class="software-result-message">${state.session.setScore?.score ?? 0}問中 ${state.session.setScore?.correctCount ?? 0}問 正解</p>
                  </div>
                </div>
                <div class="software-result-callouts">
                  <div class="result-callout" data-testid="flow-summary-callout">
                    <p class="result-callout-label">得点</p>
                    <p class="result-callout-score" data-testid="flow-summary-score">${state.session.setScore?.score ?? 0} / ${state.session.setScore?.questionCount ?? 0}</p>
                    <p class="result-callout-outcome">基準 ${clearThreshold} / ${state.flow.questionCount}</p>
                  </div>
                  <div class="software-result-stamp tone-${setOutcomeTone}">
                    <p class="software-stamp-caption">総合判定</p>
                    <p class="software-stamp-text">${setOutcomeDisplayLabel}</p>
                    <p class="sr-only" data-testid="flow-summary-outcome">${setOutcome}</p>
                  </div>
                </div>
              </div>
              <div class="software-summary-pane software-summary-ledger-pane">
                ${renderSoftwareReportChips([
                  { label: "級段", value: grade.label },
                  { label: "方式", value: getVisiblePracticeLabel() },
                  { label: "受験推奨", value: getRecommendationDisplayLabel(recommendationEligible) },
                  { label: "有効性", value: getSessionValidityDisplayLabel(state.session.setScore) }
                ])}
                <div class="software-report-table-frame">
                  <p class="software-report-subtitle">セット情報</p>
                  <table class="official-table software-ledger-table" data-testid="flow-summary-table">
                    <tbody>
                      <tr><th>内訳</th><td data-testid="flow-summary-breakdown">正解 ${state.session.setScore?.correctCount ?? 0} / 不正解 ${state.session.setScore?.incorrectCount ?? 0} / 時間切れ ${state.session.setScore?.timedOutCount ?? 0}</td></tr>
                      <tr><th>クリア基準</th><td data-testid="flow-summary-threshold">${clearThreshold} / ${state.flow.questionCount}</td></tr>
                      <tr><th>分類</th><td data-testid="flow-summary-practice-classification">${practiceClassification}</td></tr>
                      <tr><th>運手条件</th><td>${noCarryLabel}</td></tr>
                      <tr><th>練習番号</th><td data-testid="flow-summary-seed">${formatReplayKeyDisplay(state.session.seed)}</td></tr>
                      <tr><th class="sr-only">Summary Validity</th><td class="sr-only" data-testid="flow-summary-validity">${getSessionValidityLabel(state.session.setScore)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div class="software-footer-actions software-footer-actions-report">
            <button type="button" class="action official-red-button" data-testid="flow-open-results">問題別結果</button>
            <button type="button" class="action official-start-accent" data-testid="flow-summary-replay-seed">同じ問題</button>
            <button type="button" class="action official-blue-button" data-testid="flow-summary-back-setup">設定へ</button>
          </div>
        </div>
      </article>
    `;
  }

  if (state.flow.route === APP_STATES.SET_RESULTS) {
    return `
      <article class="${shellClass} software-report-shell" data-testid="app-shell">
        <p class="sr-only" data-testid="flow-route">${routeLabel}</p>
        <div class="${panelClass} software-dialog-window software-report-window" data-testid="flow-results-screen">
          <div class="software-window-titlebar">
            <p class="software-window-title">問題別結果</p>
            <p class="software-window-chip">${grade.label}</p>
          </div>
          <div class="software-window-board">
            <div class="software-report-strip" data-testid="flow-results-meta">
              ${renderSoftwareReportChips([
                { label: "分類", value: practiceClassification },
                { label: "受験推奨", value: getRecommendationDisplayLabel(recommendationEligible) },
                { label: "有効性", value: getSessionValidityDisplayLabel(state.session.setScore) },
                { label: "練習番号", value: formatReplayKeyDisplay(state.session.seed) },
                { label: "運手条件", value: noCarryLabel }
              ])}
            </div>
            <div class="software-report-table-frame">
              <p class="software-report-subtitle">判定一覧</p>
              <table class="official-table software-ledger-table software-results-table" data-testid="flow-results-table">
              <colgroup>
                <col class="col-problem" />
                <col class="col-answer" />
                <col class="col-input" />
                <col class="col-judge" />
                <col class="col-replay" />
              </colgroup>
              <caption data-testid="flow-results-grade">級段: ${grade.label} / ${getVisiblePracticeLabel()} / 総合: <span class="software-outcome-inline">${getSetOutcomeDisplayLabel(setOutcome)}</span><span class="sr-only" data-testid="flow-results-outcome">${setOutcome}</span></caption>
              <thead>
                <tr><th>問題</th><th>答え</th><th>入力</th><th>判定</th><th>再挑戦</th></tr>
              </thead>
              <tbody>
                ${state.session.questionResults
                  .map(
                    (result, index) =>
                      `<tr class="${getResultRowClass(result)}" data-testid="flow-result-row-${index + 1}"><th>第${index + 1}問</th><td>${result.answer}</td><td>${getUserAnswerDisplay(result.userAnswer)}</td><td><span class="result-status-badge tone-${getResultBadgeTone(result)}">${getResultLabel(result)}</span></td><td><button type="button" class="mini-action" data-testid="flow-result-replay-${index + 1}">この問題</button></td></tr>`
                  )
                  .join("")}
              </tbody>
              </table>
            </div>
          </div>
          <div class="software-footer-actions software-footer-actions-report">
            <button type="button" class="action official-red-button" data-testid="flow-open-review">復習確認</button>
            <button type="button" class="action official-start-accent" data-testid="flow-results-replay-seed">同じ問題</button>
            <button type="button" class="action official-blue-button" data-testid="flow-results-back-setup">設定へ</button>
          </div>
        </div>
      </article>
    `;
  }

  if (state.flow.route === APP_STATES.REVIEW) {
    return `
      <article class="${shellClass} software-report-shell" data-testid="app-shell">
        <p class="sr-only" data-testid="flow-route">${routeLabel}</p>
        <div class="${panelClass} software-dialog-window software-report-window" data-testid="flow-review-screen">
          <div class="software-window-titlebar">
            <p class="software-window-title">復習確認</p>
            <p class="software-window-chip">${grade.label} / ${getVisiblePracticeLabel()}</p>
          </div>
          <div class="software-window-board">
            <div class="software-report-strip" data-testid="flow-review-meta">
              ${renderSoftwareReportChips([
                { label: "級段", value: grade.label },
                { label: "方式", value: getVisiblePracticeLabel() },
                { label: "番号", value: formatReplayKeyDisplay(state.session.seed) },
                { label: "分類", value: practiceClassification },
                { label: "受験推奨", value: getRecommendationDisplayLabel(recommendationEligible) }
              ])}
            </div>
            <div class="software-report-table-frame">
              <p class="software-report-subtitle">数字列確認</p>
              <table class="official-table software-ledger-table software-review-table" data-testid="flow-review-table">
              <colgroup>
                <col class="col-problem" />
                <col class="col-sequence" />
                <col class="col-answer" />
                <col class="col-input" />
                <col class="col-judge" />
                <col class="col-replay" />
              </colgroup>
              <thead>
                <tr><th>問題</th><th>数字</th><th>答え</th><th>入力</th><th>判定</th><th>再挑戦</th></tr>
              </thead>
              <tbody>
                ${state.session.problemSet
                  .map((problem, index) => {
                    const result = state.session.questionResults[index];
                    const resultLabel = getResultLabel(result);
                    return `<tr class="${getResultRowClass(result)}" data-testid="flow-review-row-${index + 1}"><th>第${index + 1}問</th><td class="review-number-sequence">${renderReviewNumberTokens(problem.numbers)}</td><td>${problem.answer}</td><td>${
                      getUserAnswerDisplay(result?.userAnswer)
                    }</td><td><span class="result-status-badge tone-${getResultBadgeTone(result)}">判定: ${resultLabel}</span></td><td><button type="button" class="mini-action" data-testid="flow-review-replay-${index + 1}">この問題</button></td></tr>`;
                  })
                  .join("")}
              </tbody>
              </table>
            </div>
          </div>
          <div class="software-footer-actions software-footer-actions-report">
            <button type="button" class="action official-blue-button" data-testid="flow-review-back-results">結果へ</button>
            <button type="button" class="action official-start-accent" data-testid="flow-review-replay-seed">同じ問題</button>
            <button type="button" class="action official-red-button" data-testid="flow-review-back-setup">設定へ</button>
          </div>
        </div>
      </article>
    `;
  }

  if (state.flow.route === APP_STATES.COMPATIBILITY_CHECK) {
    return `
      <article class="${shellClass}" data-testid="app-shell">
        <div class="app-shell-header">
          <div>
            <p class="eyebrow">フラッシュ暗算 練習用</p>
            <p class="app-shell-notice">非公式 / 自宅練習用</p>
            <h2>動作確認</h2>
          </div>
          ${routeBadgeMarkup}
        </div>
        <div class="${panelClass} software-dialog-window" data-testid="flow-compatibility-screen">
          <div class="software-window-titlebar">
            <p class="software-window-title">動作確認</p>
            <p class="software-window-chip">20段 専用</p>
          </div>
          <div class="software-window-board software-dialog-board">
            <div class="software-result-stamp tone-${getCompatibilityTone(classification.status)}">
              <p class="software-stamp-caption">現在の判定</p>
              <p class="software-stamp-text" data-testid="flow-compatibility-label">${classification.label}</p>
            </div>
            <div class="software-dialog-copy">
              ${renderSoftwareReportChips([
                { label: "対象級段", value: `${grade.label} / ${grade.digits}桁 ${grade.count}口` },
                { label: "表示時間", value: sessionTimeLabel },
                { label: "開始可否", value: getCompatibilityStartLabel(classification.status) }
              ])}
              <div class="software-report-table-frame">
                <p class="software-report-subtitle">20段の動作条件</p>
                <table class="official-table software-ledger-table">
                  <tbody>
                    <tr><th>開始条件</th><td>20段は事前の動作判定を通してから開始します。</td></tr>
                    <tr><th>案内</th><td>判定が通った場合のみ、このまま開始できます。</td></tr>
                    <tr><th>注意</th><td>20段は動作が不安定な環境では参考練習または開始不可になります。</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="software-footer-actions software-footer-actions-report">
            <button type="button" class="action official-blue-button" data-testid="flow-back-setup">問題設定画面へ</button>
            <button type="button" class="action official-red-button" data-testid="flow-apply-compatibility">この判定で進む</button>
          </div>
        </div>
      </article>
    `;
  }

  if (state.flow.route === APP_STATES.SETUP_BLOCKED) {
    return `
      <article class="${shellClass}" data-testid="app-shell">
        <div class="app-shell-header">
          <div>
            <p class="eyebrow">フラッシュ暗算 練習用</p>
            <p class="app-shell-notice">非公式 / 自宅練習用</p>
            <h2>開始不可</h2>
          </div>
          ${routeBadgeMarkup}
        </div>
        <div class="${panelClass} software-dialog-window" data-testid="flow-blocked-screen">
          <div class="software-window-titlebar">
            <p class="software-window-title">開始不可</p>
            <p class="software-window-chip">20段</p>
          </div>
          <div class="software-window-board software-dialog-board">
            <div class="software-result-stamp tone-alert">
              <p class="software-stamp-caption">現在の状態</p>
              <p class="software-stamp-text" data-testid="flow-blocked-label">この環境では開始しません</p>
            </div>
            <div class="software-dialog-copy">
              ${renderSoftwareReportChips([
                { label: "対象級段", value: grade.label },
                { label: "必要判定", value: "20段 Verified または 20段 参考練習" },
                { label: "推奨", value: "設定へ戻って見直し" }
              ])}
              <div class="software-report-table-frame">
                <p class="software-report-subtitle">開始できない理由</p>
                <table class="official-table software-ledger-table">
                  <tbody>
                    <tr><th>必要条件</th><td>20段は開始前に対象環境の判定が必要です。</td></tr>
                    <tr><th>案内</th><td>設定へ戻り、対象級段か動作環境を見直してください。</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="software-footer-actions software-footer-actions-report">
            <button type="button" class="action official-red-button" data-testid="flow-return-setup">問題設定画面へ</button>
          </div>
        </div>
      </article>
    `;
  }

  if (state.flow.route === APP_STATES.INVALIDATED_RESULTS) {
    return `
      <article class="${shellClass}" data-testid="app-shell">
        <div class="app-shell-header">
          <div>
            <p class="eyebrow">フラッシュ暗算 練習用</p>
            <p class="app-shell-notice">非公式 / 自宅練習用</p>
            <h2>無効セッション</h2>
          </div>
          ${routeBadgeMarkup}
        </div>
        <div class="${panelClass} software-dialog-window" data-testid="flow-invalidated-screen">
          <div class="software-window-titlebar">
            <p class="software-window-title">無効セッション</p>
            <p class="software-window-chip">${grade.label}</p>
          </div>
          <div class="software-window-board software-dialog-board">
            <div class="software-result-stamp tone-alert">
              <p class="software-stamp-caption">状態</p>
              <p class="software-stamp-text" data-testid="flow-invalidated-label">このセットは無効です</p>
            </div>
            <div class="software-dialog-copy">
              ${renderSoftwareReportChips([
                { label: "理由", value: formatInvalidReasonSummary(state.session.invalidReasons) },
                { label: "進行", value: `${state.session.currentIndex + 1} / ${state.session.questionCount}` },
                { label: "保存", value: "無効セッションとして記録" }
              ])}
              <div class="software-report-table-frame">
                <p class="software-report-subtitle">無効内容</p>
                <table class="official-table software-ledger-table" data-testid="flow-invalidated-table">
                  <tbody>
                    <tr><th>理由</th><td data-testid="flow-invalidated-reasons">${formatInvalidReasonSummary(state.session.invalidReasons)}</td></tr>
                    <tr><th>進行</th><td data-testid="flow-invalidated-progress">${state.session.currentIndex + 1} / ${state.session.questionCount}</td></tr>
                    <tr><th>保存</th><td>無効セッションとして履歴に残し、受験推奨には使いません。</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="software-footer-actions software-footer-actions-report">
            <button type="button" class="action official-start-accent" data-testid="flow-invalidated-replay-seed">同じ問題を出題する</button>
            <button type="button" class="action official-red-button" data-testid="flow-invalidated-back-setup">問題設定画面へ</button>
          </div>
        </div>
      </article>
    `;
  }

  return `
    <article class="${shellClass}" data-testid="app-shell">
      <div class="app-shell-header">
        <div>
          <p class="eyebrow">フラッシュ暗算 練習用</p>
          <p class="app-shell-notice">非公式 / 自宅練習用</p>
          <h2>開始準備</h2>
        </div>
        ${routeBadgeMarkup}
      </div>
      <div class="${panelClass} software-dialog-window" data-testid="flow-ready-screen">
        <div class="software-window-titlebar">
          <p class="software-window-title">開始準備</p>
          <p class="software-window-chip">${grade.label}</p>
        </div>
        <div class="software-window-board software-dialog-board">
          <div class="software-result-stamp tone-neutral">
            <p class="software-stamp-caption">開始条件</p>
            <p class="software-stamp-text" data-testid="flow-ready-grade">${grade.label}</p>
          </div>
          <div class="software-dialog-copy">
            ${renderSoftwareReportChips([
              { label: "方式", value: getVisiblePracticeLabel() },
              { label: "問題数", value: `${state.flow.questionCount}問` },
              { label: "表示時間", value: sessionTimeLabel }
            ])}
            <div class="software-report-table-frame">
              <p class="software-report-subtitle">開始前の確認</p>
              <table class="official-table software-ledger-table">
                <tbody>
                  <tr><th>回答制限</th><td>${state.flow.answerTimeLimitSec}秒</td></tr>
                  <tr><th>運手条件</th><td>${noCarryLabel}</td></tr>
                  <tr><th>案内</th><td>この段階では同条件の競技面プレビューを確認できます。</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="software-footer-actions software-footer-actions-report">
          <button type="button" class="action official-blue-button" data-testid="flow-reset-setup">問題設定画面へ</button>
          <button type="button" class="action official-red-button" data-testid="flow-run-preview">同条件でプレビュー</button>
        </div>
      </div>
    </article>
  `;
}

function isStagePreviewBlocked(grade, classification = classifyCurrentPreset()) {
  return Boolean(grade.compatibilityRequired && !classification.allowedToStart);
}

function stopStagePreview({ resetFrame = false } = {}) {
  if (state.stage.rafId) {
    cancelAnimationFrame(state.stage.rafId);
    state.stage.rafId = null;
  }

  state.stage.runToken += 1;

  if (resetFrame) {
    state.stage.frame = createIdleFrame();
  }

  if (state.stage.status === "running") {
    state.stage.status = "idle";
  }
}

async function handleBenchmarkRun() {
  if (state.benchmark.status === "running") return;

  state.benchmark = {
    status: "running",
    result: null,
    error: null
  };
  render();

  try {
    const result = await run20DanBenchmark();
    state.benchmark = {
      status: "done",
      result,
      error: null
    };
  } catch (error) {
    state.benchmark = {
      status: "error",
      result: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  render();
}

function applyLatestBenchmark() {
  if (!state.benchmark.result) return;

  state.custom.metrics = {
    p95FrameDeltaMs: Number(state.benchmark.result.metrics.p95FrameDeltaMs.toFixed(2)),
    maxPhaseDriftMs: Number(state.benchmark.result.metrics.maxPhaseDriftMs.toFixed(2)),
    longFrameCount: state.benchmark.result.metrics.longFrameCount,
    integrityValid: state.benchmark.result.integrity.valid
  };
  render();
}

function updateStagePreviewDom() {
  const grade = getSelectedStageGrade();
  const classification = classifyCurrentPreset();
  const canvas = app.querySelector('[data-testid="stage-canvas"]');
  const phaseNode = app.querySelector('[data-testid="stage-phase"]');
  const progressNode = app.querySelector('[data-testid="stage-progress"]');
  const displayNode = app.querySelector('[data-testid="stage-visible"]');
  const answerNode = app.querySelector('[data-testid="stage-answer"]');
  const requirementNode = app.querySelector('[data-testid="stage-requirement"]');
  const seedNode = app.querySelector('[data-testid="stage-seed"]');
  const runButton = app.querySelector('[data-testid="stage-run"]');
  const stopButton = app.querySelector('[data-testid="stage-stop"]');

  if (phaseNode) {
    phaseNode.textContent = `Phase: ${getStagePhaseLabel(state.stage.frame.phase)}`;
  }
  if (progressNode) {
    progressNode.textContent = `Progress: ${state.stage.frame.progressLabel}`;
  }
  if (displayNode) {
    displayNode.textContent = `Visible: ${state.stage.frame.displayText || "blank"}`;
  }
  if (answerNode) {
    answerNode.textContent = `Answer: ${state.stage.problem ? state.stage.problem.answer : "n/a"}`;
  }
  if (requirementNode) {
    requirementNode.textContent = grade.compatibilityRequired
      ? `20段 gate: ${classification.label}`
      : "20段 gate: not required";
  }
  if (seedNode) {
    seedNode.textContent = `Seed: ${state.stage.seed ?? "not generated"}`;
  }
  if (runButton) {
    runButton.disabled = state.stage.status === "running" || isStagePreviewBlocked(grade, classification);
    runButton.textContent = state.stage.status === "running" ? "Preview running..." : "Run stage preview";
  }
  if (stopButton) {
    stopButton.disabled = state.stage.status !== "running";
  }

  if (canvas) {
    paintStageCanvas(canvas, state.stage.frame, {
      gradeLabel: grade.label,
      progressLabel: state.stage.frame.progressLabel,
      compatibilityLabel: grade.compatibilityRequired ? classification.label : "通常練習",
      footerLabel: `${getPracticeModeLabel(state.stage.selectedPracticeMode)} / ${getStagePhaseDisplayLabel(state.stage.frame.phase)}`
    });
  }
}

function updateSessionDom() {
  const grade = getSelectedFlowGrade();
  const classification = classifyCurrentPreset();
  const problem = getCurrentSessionProblem();
  const canvas = app.querySelector('[data-testid="session-canvas"]');
  const focusCanvas = app.querySelector('[data-testid="focus-stage-canvas"]');
  const phaseNode = app.querySelector('[data-testid="session-phase"]');
  const progressNode = app.querySelector('[data-testid="session-progress"]');
  const visibleNode = app.querySelector('[data-testid="session-visible"]');
  const answerKeyNode = app.querySelector('[data-testid="session-answer-key"]');

  if (phaseNode) {
    phaseNode.textContent = `Phase: ${state.session.questionState}`;
  }
  if (progressNode) {
    progressNode.textContent = `${state.session.currentIndex + 1} / ${state.session.questionCount}`;
  }
  if (visibleNode) {
    visibleNode.textContent = `Visible: ${state.session.questionFrame.displayText || "blank"}`;
  }
  if (answerKeyNode) {
    answerKeyNode.textContent = problem ? String(problem.answer) : "";
  }

  if (canvas) {
    paintStageCanvas(canvas, state.session.questionFrame, {
      gradeLabel: grade.label,
      progressLabel: state.session.questionFrame.progressLabel,
      compatibilityLabel: grade.compatibilityRequired ? classification.label : "通常練習",
      footerLabel: `${getPracticeModeLabel(state.flow.selectedPracticeMode)} / ${getQuestionStateDisplayLabel(state.session.questionState)}`
    });
  }

  if (focusCanvas) {
    paintStageCanvas(focusCanvas, state.session.questionFrame, {
      gradeLabel: grade.label,
      progressLabel: state.session.questionFrame.progressLabel,
      compatibilityLabel: grade.compatibilityRequired ? classification.label : "通常練習",
      footerLabel: `${getPracticeModeLabel(state.flow.selectedPracticeMode)} / ${getQuestionStateDisplayLabel(state.session.questionState)}`
    });
  }

  if (state.session.questionState === QUESTION_STATES.AWAITING_ANSWER) {
    focusSessionAnswerInput();
  }
}

function startStagePreview() {
  const grade = getSelectedStageGrade();
  const classification = classifyCurrentPreset();

  if (isStagePreviewBlocked(grade, classification)) {
    return;
  }

  stopStagePreview();

  const seed = createStageSeed();
  const [problem] = generateProblemSet({
    grade,
    practiceMode: state.stage.selectedPracticeMode,
    seed,
    questionCount: 1
  });
  const plan = buildStagePlan({
    grade,
    problem,
    speedMultiplier: state.stage.previewSpeed
  });

  state.stage.seed = seed;
  state.stage.problem = problem;
  state.stage.plan = plan;
  state.stage.frame = createIdleFrame();
  state.stage.status = "running";
  render();

  const runToken = state.stage.runToken + 1;
  state.stage.runToken = runToken;
  const startTimestamp = performance.now();

  function tick(timestamp) {
    if (state.stage.runToken !== runToken) return;

    const frame = getStageFrame(plan, timestamp - startTimestamp);
    state.stage.frame = frame;
    if (frame.completed) {
      state.stage.status = "complete";
      state.stage.rafId = null;
    }
    updateStagePreviewDom();

    if (!frame.completed) {
      state.stage.rafId = requestAnimationFrame(tick);
    }
  }

  state.stage.rafId = requestAnimationFrame(tick);
}

function commitRender() {
  const selectedPreset = getSelectedPreset();
  const currentClassification = classifyCurrentPreset();
  const benchmarkResult = state.benchmark.result;
  const benchmarkIntegrity = benchmarkResult?.integrity;
  const selectedStageGrade = getSelectedStageGrade();
  const guardianLocked = isGuardianSettingsLocked();
  const recentSessionRows = state.storage.recentSessions
    .slice(0, 5)
    .map(
      (entry, index) =>
        `<tr data-testid="storage-row-${index + 1}"><th>${formatTimestamp(entry.endedAt)}</th><td>${entry.gradeLabel}</td><td>${getPracticeModeLabel(
          entry.practiceMode
        )}</td><td>${entry.score} / ${entry.questionCount}</td><td>${entry.setOutcome}</td><td><div class="mini-action-group"><button type="button" class="mini-action" data-testid="storage-replay-${index + 1}" data-storage-session-id="${entry.id}" ${
          guardianLocked ? "disabled" : ""
        }>再練習</button><button type="button" class="mini-action" data-testid="storage-results-${index + 1}" data-storage-results-id="${entry.id}">結果</button><button type="button" class="mini-action" data-testid="storage-review-${index + 1}" data-storage-review-id="${entry.id}">復習</button></div></td></tr>`
    )
    .join("");

  document.title = isDeveloperMode() ? "Flash Anzan Verification Harness" : "フラッシュ暗算 自宅練習ソフト";
  const developerShellMarkup = `
    <main class="shell">
      <div class="official-ribbon">日本フラッシュ暗算検定協会・公式練習ソフトの公開画面を参考にした非公式の自宅練習UIです</div>
      <header class="hero">
        <div class="hero-brand">
          <div class="hero-main">
            <div class="software-menu-oval hero-oval">
              <p>一般社団法人 日本フラッシュ暗算検定協会 公開情報参考</p>
              <h1>フラッシュ暗算 自宅練習ソフト</h1>
            </div>
            <div class="software-character-row hero-character-row" aria-hidden="true">
              <span class="software-avatar avatar-boy">P</span>
              <span class="software-avatar avatar-girl">P</span>
            </div>
            <p class="lede">級段位、互換判定、出題導線、結果表示を、公開されているソフト画面と検定情報に寄せた非公式 Web 練習UIです。</p>
          </div>
          <div class="hero-board">
            <p class="hero-board-title">現在の練習条件</p>
            <p class="hero-board-grade">${getSelectedFlowGrade().label}</p>
            <p class="hero-board-meta">${getPracticeModeLabel(state.flow.selectedPracticeMode)} / ${state.flow.questionCount}問</p>
            <p class="hero-board-meta">${classifyCurrentPreset().label}</p>
          </div>
        </div>
        ${renderOfficialNav()}
      </header>
      <section class="grid">
        ${renderFlowPanel(currentClassification)}
        <article class="card software-diagnostic-card tone-green" data-testid="grade-summary">
          <h2>級段位プロファイル</h2>
          <p data-testid="grade-count">${gradeCount} levels loaded</p>
          <p>${timedCount} timed / ${imageCount} image</p>
          <p data-testid="has-20dan">${has20Dan ? "20段 included" : "20段 missing"}</p>
        </article>
        <article class="card software-diagnostic-card tone-green" data-testid="platform-summary">
          <h2>環境プロファイル</h2>
          <p data-testid="platform-count">${platformCount} platform classes loaded</p>
          <p>20段 handling remains environment-gated.</p>
        </article>
        <article class="card software-diagnostic-card tone-pink" data-testid="scope-summary">
          <h2>検証範囲</h2>
          <ul>
            <li>Contract tests</li>
            <li>Unit policy tests</li>
            <li>State machine tests</li>
            <li>Browser smoke tests</li>
          </ul>
        </article>
        <article class="card card-wide software-diagnostic-card tone-pink" data-testid="storage-screen">
          <h2>ローカルデータ</h2>
          <p>設定、20段互換判定の調整値、最近の練習結果をこのブラウザ内に自動保存します。外部送信はしません。</p>
          <div class="storage-layout">
            <div class="app-flow-panel software-tool-panel">
              <p data-testid="storage-status">状態: ${state.storage.status}</p>
              <p data-testid="storage-saved-at">最終保存: ${formatTimestamp(state.storage.lastSavedAt)}</p>
              <p data-testid="storage-restored-at">最終復元: ${formatTimestamp(state.storage.lastRestoredAt)}</p>
              <p data-testid="storage-recent-count">保存済みセッション: ${state.storage.recentSessions.length}</p>
              <label class="toggle">
                <input data-testid="display-fullscreen-toggle" name="displayFullscreen" type="checkbox" ${
                  state.display.preferFullscreenStage ? "checked" : ""
                } ${guardianLocked ? "disabled" : ""} />
                <span>出題中に fullscreen を試す</span>
              </label>
              <p data-testid="display-fullscreen-status">fullscreen: ${getFullscreenStatusLabel()}</p>
              <label class="toggle">
                <input data-testid="display-wakelock-toggle" name="displayWakeLock" type="checkbox" ${
                  state.display.preferWakeLock ? "checked" : ""
                } ${guardianLocked ? "disabled" : ""} />
                <span>出題中にスリープ防止を試す</span>
              </label>
              <p data-testid="display-wakelock-status">wake lock: ${getWakeLockStatusLabel()}</p>
              <p data-testid="guardian-status">保護者ロック: ${
                state.guardian.enabled ? (guardianLocked ? "locked" : "unlocked") : "off"
              }</p>
              ${
                !state.guardian.enabled
                  ? `<label class="field"><span>Guardian PIN</span><input data-testid="guardian-pin-input" name="guardianPin" inputmode="numeric" maxlength="4" value="${state.guardian.pinDraft}" /></label>
                     <div class="actions"><button type="button" class="action" data-testid="guardian-enable">保護者ロックを有効化</button></div>`
                  : guardianLocked
                    ? `<label class="field"><span>Guardian PIN</span><input data-testid="guardian-pin-input" name="guardianPin" inputmode="numeric" maxlength="4" value="${state.guardian.pinDraft}" /></label>
                       <div class="actions"><button type="button" class="action" data-testid="guardian-unlock">解除する</button></div>`
                    : `<div class="actions"><button type="button" class="action secondary" data-testid="guardian-lock">再ロックする</button><button type="button" class="action" data-testid="guardian-disable">保護者ロックを解除</button></div>`
              }
              ${state.guardian.error ? `<p class="error" data-testid="guardian-error">${state.guardian.error}</p>` : ""}
              <div class="actions">
                <button type="button" class="action" data-testid="storage-export">JSONを書き出す</button>
                <button type="button" class="action secondary" data-testid="storage-import-trigger" ${
                  guardianLocked ? "disabled" : ""
                }>JSONを復元する</button>
              </div>
              <input type="file" accept="application/json" class="sr-only" data-testid="storage-import-file" />
            </div>
            <table class="official-table" data-testid="storage-table">
              <thead>
                <tr><th>保存時刻</th><th>級段</th><th>モード</th><th>得点</th><th>結果</th><th>操作</th></tr>
              </thead>
              <tbody>
                ${
                  recentSessionRows ||
                  '<tr data-testid="storage-empty"><td colspan="6">まだ保存された練習結果はありません。</td></tr>'
                }
              </tbody>
            </table>
          </div>
        </article>
        <article class="card card-wide software-diagnostic-card tone-green" data-testid="compatibility-screen">
          <h2>20段動作判定</h2>
          <p>20段は別アプリにせず、同じアプリ内で gate します。ここで 20段の開始可否を先に確定させます。</p>
          <div class="compat-layout">
            <form class="compat-form software-tool-panel" data-testid="compatibility-form">
              <label class="field">
                <span>Preset</span>
                <select data-testid="compatibility-preset" name="preset" ${guardianLocked ? "disabled" : ""}>
                  ${compatibilityPresets
                    .map(
                      (preset) =>
                        `<option value="${preset.id}" ${preset.id === selectedPreset.id ? "selected" : ""}>${preset.label}</option>`
                    )
                    .join("")}
                </select>
              </label>
              <label class="field">
                <span>P95 Frame Delta</span>
                <input data-testid="metric-p95" name="p95FrameDeltaMs" type="number" min="1" value="${state.custom.metrics.p95FrameDeltaMs}" ${guardianLocked ? "disabled" : ""} />
              </label>
              <label class="field">
                <span>Max Phase Drift</span>
                <input data-testid="metric-drift" name="maxPhaseDriftMs" type="number" min="0" value="${state.custom.metrics.maxPhaseDriftMs}" ${guardianLocked ? "disabled" : ""} />
              </label>
              <label class="field">
                <span>Long Frame Count</span>
                <input data-testid="metric-long-frame" name="longFrameCount" type="number" min="0" value="${state.custom.metrics.longFrameCount}" ${guardianLocked ? "disabled" : ""} />
              </label>
              <label class="field">
                <span>Recent Invalid Count</span>
                <input data-testid="metric-invalid-count" name="recentInvalidCount" type="number" min="0" value="${state.custom.recentInvalidCount}" ${guardianLocked ? "disabled" : ""} />
              </label>
              <label class="toggle">
                <input data-testid="toggle-viewport" name="viewportChanged" type="checkbox" ${state.custom.env.viewportChanged ? "checked" : ""} ${guardianLocked ? "disabled" : ""} />
                <span>Viewport Changed</span>
              </label>
              <label class="toggle">
                <input data-testid="toggle-visibility" name="visibilityLost" type="checkbox" ${state.custom.env.visibilityLost ? "checked" : ""} ${guardianLocked ? "disabled" : ""} />
                <span>Visibility Lost</span>
              </label>
            </form>
            <div class="compat-panel software-tool-panel">
              <p class="status" data-testid="compatibility-label">${currentClassification.label}</p>
              <p data-testid="compatibility-status">Status: ${currentClassification.status}</p>
              <p data-testid="compatibility-platform">Platform: ${currentClassification.platformClass}</p>
              <p data-testid="compatibility-benchmark">Benchmark: Level ${currentClassification.benchmark.level}</p>
              <button type="button" data-testid="compatibility-start" class="action" ${currentClassification.allowedToStart ? "" : "disabled"}>${currentClassification.allowedToStart ? "20段を開始" : "20段開始不可"}</button>
              <div class="stack muted">
                <span>Device: ${state.custom.env.deviceType}</span>
                <span>Browser: ${state.custom.env.browserName}</span>
                <span>OS: ${state.custom.env.os}</span>
                <span data-testid="compatibility-integrity">Integrity: ${
                  state.custom.metrics.integrityValid === false ? "invalid" : "not applied / valid"
                }</span>
              </div>
            </div>
          </div>
        </article>
        <article class="card card-wide software-diagnostic-card tone-green" data-testid="benchmark-screen">
          <h2>20段ベンチマーク</h2>
          <p>このブラウザで requestAnimationFrame を実測し、20段の gate に使う数値を取ります。まだ本番 renderer 前なので、最初は benchmark を独立させています。</p>
          <div class="benchmark-layout">
            <div class="benchmark-controls software-tool-panel">
              <p class="status" data-testid="benchmark-status">
                ${
                  state.benchmark.status === "idle"
                    ? "benchmark idle"
                    : state.benchmark.status === "running"
                      ? "benchmark running"
                      : state.benchmark.status === "done"
                        ? "benchmark complete"
                        : "benchmark error"
                }
              </p>
              <div class="stack muted">
                <span>Target: 20段 / 15口 / 1.50秒</span>
                <span>Display: ${Math.round(timingProfile.strict20.displayRatio * 100)}% / Gap ${Math.round(
                  timingProfile.strict20.gapRatio * 100
                )}%</span>
              </div>
              <div class="actions">
                <button type="button" data-testid="benchmark-run" class="action" ${
                  state.benchmark.status === "running" ? "disabled" : ""
                }>Run 20段 benchmark</button>
                <button type="button" data-testid="benchmark-apply" class="action secondary" ${
                  benchmarkResult ? "" : "disabled"
                }>Use latest benchmark</button>
              </div>
              ${
                state.benchmark.error
                  ? `<p class="error" data-testid="benchmark-error">${state.benchmark.error}</p>`
                  : ""
              }
            </div>
            <div class="benchmark-panel software-tool-panel">
              <p data-testid="benchmark-samples">Samples: ${benchmarkResult?.sampleCount ?? 0}</p>
              <p data-testid="benchmark-p95">P95 Frame Delta: ${formatMetric(
                benchmarkResult?.metrics.p95FrameDeltaMs ?? Number.NaN
              )}ms</p>
              <p data-testid="benchmark-drift">Max Phase Drift: ${formatMetric(
                benchmarkResult?.metrics.maxPhaseDriftMs ?? Number.NaN
              )}ms</p>
              <p data-testid="benchmark-long-frame">Long Frame Count: ${benchmarkResult?.metrics.longFrameCount ?? "n/a"}</p>
              <p data-testid="benchmark-late-show">Late Show Count: ${benchmarkResult?.metrics.lateShowCount ?? "n/a"}</p>
              <p data-testid="benchmark-valid">Integrity: ${
                benchmarkIntegrity ? (benchmarkIntegrity.valid ? "valid" : "invalid") : "not run"
              }</p>
              <p data-testid="benchmark-reasons">Reasons: ${
                benchmarkIntegrity?.reasons.length ? benchmarkIntegrity.reasons.join(", ") : "none"
              }</p>
            </div>
          </div>
        </article>
        <article class="card card-wide software-diagnostic-card tone-black" data-testid="stage-preview">
          <h2>競技画面プレビュー</h2>
          <p>公開情報に寄せた黒背景・大数字の競技面を、同じ generator と timing profile で確認します。20段は上の gate をそのまま通します。</p>
          <div class="stage-layout">
            <form class="stage-controls software-tool-panel" data-testid="stage-controls">
              <label class="field">
                <span>Grade</span>
                <select data-testid="stage-grade" name="stageGrade" ${guardianLocked ? "disabled" : ""}>
                  ${gradeProfile.grades
                    .map(
                      (grade) =>
                        `<option value="${grade.id}" ${grade.id === selectedStageGrade.id ? "selected" : ""}>${grade.label}</option>`
                    )
                    .join("")}
                </select>
              </label>
              <label class="field">
                <span>Practice Mode</span>
                <select data-testid="stage-mode" name="stageMode" ${guardianLocked ? "disabled" : ""}>
                  ${selectedStageGrade.supportedPracticeModes
                    .map(
                      (mode) =>
                        `<option value="${mode}" ${mode === state.stage.selectedPracticeMode ? "selected" : ""}>${getPracticeModeLabel(mode)}</option>`
                    )
                    .join("")}
                </select>
              </label>
              <label class="field">
                <span>Preview Speed</span>
                <select data-testid="stage-speed" name="stageSpeed" ${guardianLocked ? "disabled" : ""}>
                  ${[1, 4, 12]
                    .map(
                      (speed) =>
                        `<option value="${speed}" ${speed === state.stage.previewSpeed ? "selected" : ""}>${speed}x</option>`
                    )
                    .join("")}
                </select>
              </label>
              <div class="actions">
                <button type="button" data-testid="stage-run" class="action">Run stage preview</button>
                <button type="button" data-testid="stage-stop" class="action secondary" ${
                  state.stage.status === "running" ? "" : "disabled"
                }>Stop</button>
              </div>
              <div class="stack muted">
                <span data-testid="stage-requirement">${
                  selectedStageGrade.compatibilityRequired
                    ? `20段 gate: ${currentClassification.label}`
                    : "20段 gate: not required"
                }</span>
                <span data-testid="stage-seed">Seed: ${state.stage.seed ?? "not generated"}</span>
              </div>
            </form>
            <div class="stage-panel software-tool-panel">
              <canvas class="stage-canvas" data-testid="stage-canvas"></canvas>
              <div class="stage-debug">
                <p data-testid="stage-phase">Phase: ${getStagePhaseLabel(state.stage.frame.phase)}</p>
                <p data-testid="stage-progress">Progress: ${state.stage.frame.progressLabel}</p>
                <p data-testid="stage-visible">Visible: ${state.stage.frame.displayText || "blank"}</p>
                <p data-testid="stage-answer">Answer: ${state.stage.problem ? state.stage.problem.answer : "n/a"}</p>
              </div>
            </div>
          </div>
        </article>
        <article class="card software-diagnostic-card tone-pink" data-testid="timing-mock">
          <h2>タイミング確認</h2>
          <p data-testid="timeline-mouth">20段 1口あたり ${strictTimeline[0].mouthDurationMs.toFixed(0)}ms</p>
          <p data-testid="timeline-show">表示 ${(
            strictTimeline[0].showEndMs - strictTimeline[0].showStartMs
          ).toFixed(0)}ms / 空白 ${(strictTimeline[0].gapEndMs - strictTimeline[0].showEndMs).toFixed(0)}ms</p>
          <p data-testid="integrity-valid">${integrityMock.valid ? "integrity valid" : "integrity invalid"}</p>
        </article>
      </section>
    </main>
  `;

  const softwareOnlyMarkup = `
    <main class="shell shell-runtime-only" data-testid="runtime-shell">
      <section class="runtime-flow-stack">
        ${renderFlowPanel(currentClassification)}
      </section>
    </main>
  `;

  app.innerHTML = `
    ${isDeveloperMode() ? developerShellMarkup : softwareOnlyMarkup}
    ${renderFocusStageOverlay()}
    ${renderRuntimeOverlay()}
  `;

  if (shouldResetViewportTop()) {
    syncViewportTop();
  }
  lastRenderedRoute = state.flow.route;
  lastRenderedSessionState = state.session.questionState;
  lastRenderedOverlay = state.ui.overlay;

  document.body.classList.toggle("focus-stage-open", isFocusStageVisible());
  document.body.classList.toggle("runtime-shell-open", !isDeveloperMode());
  document.body.classList.toggle("runtime-overlay-open", Boolean(state.ui.overlay));
  syncFullscreenExit();
  syncWakeLockExit();

  const presetSelect = app.querySelector('[data-testid="compatibility-preset"]');
  const p95Input = app.querySelector('[data-testid="metric-p95"]');
  const driftInput = app.querySelector('[data-testid="metric-drift"]');
  const longFrameInput = app.querySelector('[data-testid="metric-long-frame"]');
  const invalidInput = app.querySelector('[data-testid="metric-invalid-count"]');
  const viewportToggle = app.querySelector('[data-testid="toggle-viewport"]');
  const visibilityToggle = app.querySelector('[data-testid="toggle-visibility"]');
  const benchmarkRunButton = app.querySelector('[data-testid="benchmark-run"]');
  const benchmarkApplyButton = app.querySelector('[data-testid="benchmark-apply"]');
  const displayFullscreenToggle = app.querySelector('[data-testid="display-fullscreen-toggle"]');
  const displayWakeLockToggle = app.querySelector('[data-testid="display-wakelock-toggle"]');
  const storageExportButton = app.querySelector('[data-testid="storage-export"]');
  const storageImportTriggerButton = app.querySelector('[data-testid="storage-import-trigger"]');
  const storageImportFileInput = app.querySelector('[data-testid="storage-import-file"]');
  const storageReplayButtons = app.querySelectorAll("[data-storage-session-id]");
  const storageResultButtons = app.querySelectorAll("[data-storage-results-id]");
  const storageReviewButtons = app.querySelectorAll("[data-storage-review-id]");
  const guardianPinInput = app.querySelector('[data-testid="guardian-pin-input"]');
  const guardianEnableButton = app.querySelector('[data-testid="guardian-enable"]');
  const guardianUnlockButton = app.querySelector('[data-testid="guardian-unlock"]');
  const guardianLockButton = app.querySelector('[data-testid="guardian-lock"]');
  const guardianDisableButton = app.querySelector('[data-testid="guardian-disable"]');
  const flowOpenGradeSelectButton = app.querySelector('[data-testid="flow-open-grade-select"]');
  const flowOpenGradeSelectDisplayButton = app.querySelector('[data-testid="flow-open-grade-select-display"]');
  const flowBackHomeButton = app.querySelector('[data-testid="flow-back-home"]');
  const flowHomeIconButton = app.querySelector('[data-testid="flow-home-icon"]');
  const flowGradeSelect = app.querySelector('[data-testid="flow-grade-select"]');
  const flowGradeButtons = app.querySelectorAll("[data-flow-grade-button]");
  const flowModeFreeButton = app.querySelector('[data-testid="flow-mode-free"]');
  const flowModeOfficialButton = app.querySelector('[data-testid="flow-mode-official"]');
  const flowGradePrevButton = app.querySelector('[data-testid="flow-grade-prev"]');
  const flowGradeNextButton = app.querySelector('[data-testid="flow-grade-next"]');
  const flowFreeConfigCards = app.querySelectorAll("[data-free-config-field]");
  const flowOpenRecordsButton = app.querySelector('[data-testid="flow-open-records"]');
  const flowOpenSettingsButton = app.querySelector('[data-testid="flow-open-settings"]');
  const flowStartSetButton = app.querySelector('[data-testid="flow-start-set"]');
  const flowPracticeModeSelect = app.querySelector('[data-testid="flow-practice-mode"]');
  const flowQuestionCountSelect = app.querySelector('[data-testid="flow-question-count"]');
  const flowAnswerTimeLimitSelect = app.querySelector('[data-testid="flow-answer-time-limit"]');
  const flowBackGradeSelectButton = app.querySelector('[data-testid="flow-back-grade-select"]');
  const flowBackSetupButton = app.querySelector('[data-testid="flow-back-setup"]');
  const flowApplyCompatibilityButton = app.querySelector('[data-testid="flow-apply-compatibility"]');
  const flowReturnSetupButton = app.querySelector('[data-testid="flow-return-setup"]');
  const flowInvalidatedBackSetupButton = app.querySelector('[data-testid="flow-invalidated-back-setup"]');
  const flowResetSetupButton = app.querySelector('[data-testid="flow-reset-setup"]');
  const flowRunPreviewButton = app.querySelector('[data-testid="flow-run-preview"]');
  const flowOpenResultsButton = app.querySelector('[data-testid="flow-open-results"]');
  const flowSummaryReplaySeedButton = app.querySelector('[data-testid="flow-summary-replay-seed"]');
  const flowSummaryBackSetupButton = app.querySelector('[data-testid="flow-summary-back-setup"]');
  const flowResultsReplaySeedButton = app.querySelector('[data-testid="flow-results-replay-seed"]');
  const flowResultReplayButtons = app.querySelectorAll('[data-testid^="flow-result-replay-"]');
  const flowResultsBackSetupButton = app.querySelector('[data-testid="flow-results-back-setup"]');
  const flowOpenReviewButton = app.querySelector('[data-testid="flow-open-review"]');
  const flowReviewBackResultsButton = app.querySelector('[data-testid="flow-review-back-results"]');
  const flowReviewReplaySeedButton = app.querySelector('[data-testid="flow-review-replay-seed"]');
  const flowReviewReplayButtons = app.querySelectorAll('[data-testid^="flow-review-replay-"]');
  const flowReviewBackSetupButton = app.querySelector('[data-testid="flow-review-back-setup"]');
  const flowInvalidatedReplaySeedButton = app.querySelector('[data-testid="flow-invalidated-replay-seed"]');
  const sessionStartQuestionButton = app.querySelector('[data-testid="session-start-question"]');
  const sessionAcknowledgeAnswerButton = app.querySelector('[data-testid="session-acknowledge-answer"]');
  const sessionAnswerInput = app.querySelector('[data-testid="session-answer-input"]');
  const sessionRevealAnswerButton = app.querySelector('[data-testid="session-reveal-answer"]');
  const sessionKeypadButtons = app.querySelectorAll("[data-keypad-key]");
  const sessionKeypadActionButtons = app.querySelectorAll("[data-keypad-action]");
  const sessionSubmitAnswerButton = app.querySelector('[data-testid="session-submit-answer"]');
  const sessionContinueAfterJudgementButton = app.querySelector('[data-testid="session-continue-after-judgement"]');
  const sessionRetryQuestionButton = app.querySelector('[data-testid="session-retry-question"]');
  const sessionNextQuestionButton = app.querySelector('[data-testid="session-next-question"]');
  const sessionBackGradeSelectButton = app.querySelector('[data-testid="session-back-grade-select"]');
  const sessionBackHomeButton = app.querySelector('[data-testid="session-back-home"]');
  const overlayBackdrop = app.querySelector('[data-testid="overlay-backdrop"]');
  const overlayHomeIconButton = app.querySelector('[data-testid="overlay-home-icon"]');
  const settingsContinueButton = app.querySelector('[data-testid="settings-continue"]');
  const settingsReturnHomeButton = app.querySelector('[data-testid="settings-return-home"]');
  const settingsStartCueEnabledInput = app.querySelector('[data-testid="settings-startcue-enabled"]');
  const settingsStartCueVolumeInput = app.querySelector('[data-testid="settings-startcue-volume"]');
  const settingsFullscreenEnabledInput = app.querySelector('[data-testid="settings-fullscreen-enabled"]');
  const settingsWakeLockEnabledInput = app.querySelector('[data-testid="settings-wakelock-enabled"]');
  const recordsCloseButton = app.querySelector('[data-testid="records-close"]');
  const stageGradeSelect = app.querySelector('[data-testid="stage-grade"]');
  const stageModeSelect = app.querySelector('[data-testid="stage-mode"]');
  const stageSpeedSelect = app.querySelector('[data-testid="stage-speed"]');
  const stageRunButton = app.querySelector('[data-testid="stage-run"]');
  const stageStopButton = app.querySelector('[data-testid="stage-stop"]');

  flowOpenGradeSelectButton?.addEventListener("click", () => {
    persistState("saved");
    transitionFlow("OPEN_GRADE_SELECT");
    render();
  });

  flowOpenGradeSelectDisplayButton?.addEventListener("click", () => {
    setFlowTrainingMode("free");
    setFlowPracticeMode("display");
    persistState("saved");
    transitionFlow("OPEN_GRADE_SELECT");
    render();
  });

  flowBackHomeButton?.addEventListener("click", () => {
    navigateToHome();
  });

  flowHomeIconButton?.addEventListener("click", () => {
    navigateToHome();
  });

  flowGradeSelect?.addEventListener("change", (event) => {
    setFlowGrade(event.target.value);
    persistState("saved");
    render();
  });

  flowGradeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const gradeId = button.getAttribute("data-flow-grade-button");
      if (!gradeId || isGuardianSettingsLocked()) return;
      setFlowGrade(gradeId);
      persistState("saved");
      render();
    });
  });

  flowModeFreeButton?.addEventListener("click", () => {
    setFlowTrainingMode("free");
    persistState("saved");
    render();
  });

  flowModeOfficialButton?.addEventListener("click", () => {
    setFlowTrainingMode("official");
    persistState("saved");
    render();
  });

  flowGradePrevButton?.addEventListener("click", () => {
    stepFlowGrade(1);
    persistState("saved");
    render();
  });

  flowGradeNextButton?.addEventListener("click", () => {
    stepFlowGrade(-1);
    persistState("saved");
    render();
  });

  flowFreeConfigCards.forEach((button) => {
    button.addEventListener("click", (event) => {
      const field = button.getAttribute("data-free-config-field");
      if (!field || isGuardianSettingsLocked()) return;
      setFreeConfigField(field);

      const target = event.target;
      const upButton =
        target instanceof HTMLElement ? target.closest('[data-testid$="-up"]') : null;
      const downButton =
        target instanceof HTMLElement ? target.closest('[data-testid$="-down"]') : null;

      if (upButton) {
        stepFreeConfigField(field, 1);
      } else if (downButton) {
        stepFreeConfigField(field, -1);
      }

      persistState("saved");
      render();
    });
  });

  flowOpenRecordsButton?.addEventListener("click", () => {
    openOverlay("records");
    render();
  });

  flowOpenSettingsButton?.addEventListener("click", () => {
    openOverlay("settings");
    render();
  });

  flowPracticeModeSelect?.addEventListener("change", (event) => {
    setFlowPracticeMode(event.target.value);
    persistState("saved");
    render();
  });

  flowQuestionCountSelect?.addEventListener("change", (event) => {
    state.flow.questionCount = Number(event.target.value);
    persistState("saved");
    render();
  });

  flowAnswerTimeLimitSelect?.addEventListener("change", (event) => {
    state.flow.answerTimeLimitSec = Number(event.target.value);
    persistState("saved");
    render();
  });

  flowBackGradeSelectButton?.addEventListener("click", () => {
    state.flow.route = APP_STATES.GRADE_SELECT;
    render();
  });

  flowStartSetButton?.addEventListener("click", () => {
    state.flow.pendingReplaySeed = null;
    state.flow.pendingReplayProblemSet = null;
    state.flow.pendingReplayQuestionCount = null;
    transitionFlow("START_SET");
    if (state.flow.route === APP_STATES.SET_COUNTDOWN) {
      syncFlowToSession({ reset: true });
    }
    render();
  });

  flowBackSetupButton?.addEventListener("click", () => {
    state.flow.route = APP_STATES.GRADE_SELECT;
    render();
  });

  flowApplyCompatibilityButton?.addEventListener("click", () => {
    if (currentClassification.status === "Unsupported") {
      transitionFlow("CLASSIFIED_UNSUPPORTED");
    } else if (currentClassification.status === "Verified") {
      transitionFlow("CLASSIFIED_VERIFIED");
    } else {
      transitionFlow("CLASSIFIED_COMPATIBLE");
    }
    if (state.flow.route === APP_STATES.SET_COUNTDOWN) {
      syncFlowToSession({ reset: true });
    }
    render();
  });

  flowReturnSetupButton?.addEventListener("click", () => {
    transitionFlow("BACK_TO_SETUP");
    render();
  });

  flowInvalidatedBackSetupButton?.addEventListener("click", () => {
    state.session.invalidReasons = [];
    transitionFlow("BACK_TO_SETUP");
    render();
  });

  flowResetSetupButton?.addEventListener("click", () => {
    stopSessionPresentation({ resetFrame: true });
    transitionFlow("RESTART_SAME_CONDITIONS");
    render();
  });

  flowRunPreviewButton?.addEventListener("click", () => {
    syncFlowToStage();
    startStagePreview();
  });

  flowOpenResultsButton?.addEventListener("click", () => {
    transitionFlow("OPEN_RESULTS");
    render();
  });

  flowSummaryReplaySeedButton?.addEventListener("click", () => {
    beginSameSeedReplay();
  });

  flowSummaryBackSetupButton?.addEventListener("click", () => {
    stopSessionPresentation({ resetFrame: true });
    transitionFlow("RESTART_SAME_CONDITIONS");
    render();
  });

  flowResultsReplaySeedButton?.addEventListener("click", () => {
    beginSameSeedReplay();
  });

  flowResultReplayButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const indexText = button.getAttribute("data-testid")?.replace("flow-result-replay-", "");
      const index = Number(indexText) - 1;
      if (Number.isNaN(index)) return;
      beginSingleProblemReplay(index);
    });
  });

  flowResultsBackSetupButton?.addEventListener("click", () => {
    stopSessionPresentation({ resetFrame: true });
    transitionFlow("RESTART_SAME_CONDITIONS");
    render();
  });

  flowOpenReviewButton?.addEventListener("click", () => {
    transitionFlow("OPEN_REVIEW");
    render();
  });

  flowReviewBackResultsButton?.addEventListener("click", () => {
    transitionFlow("BACK_RESULTS");
    render();
  });

  flowReviewReplaySeedButton?.addEventListener("click", () => {
    beginSameSeedReplay();
  });

  flowReviewReplayButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const indexText = button.getAttribute("data-testid")?.replace("flow-review-replay-", "");
      const index = Number(indexText) - 1;
      if (Number.isNaN(index)) return;
      beginSingleProblemReplay(index);
    });
  });

  flowReviewBackSetupButton?.addEventListener("click", () => {
    stopSessionPresentation({ resetFrame: true });
    transitionFlow("BACK_SETUP");
    render();
  });

  flowInvalidatedReplaySeedButton?.addEventListener("click", () => {
    beginSameSeedReplay();
  });

  sessionStartQuestionButton?.addEventListener("click", () => {
    startSessionQuestion();
  });

  sessionAcknowledgeAnswerButton?.addEventListener("click", () => {
    acknowledgeDisplayedAnswer();
  });

  sessionAnswerInput?.addEventListener("input", (event) => {
    const nextValue = sanitizeAnswerInput(event.target.value);
    if (event.target.value !== nextValue) {
      event.target.value = nextValue;
    }
    state.session.answerInput = nextValue;
  });

  sessionAnswerInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      submitSessionAnswer();
    }
  });

  sessionRevealAnswerButton?.addEventListener("click", () => {
    revealCurrentSessionAnswer();
  });

  sessionKeypadButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const digit = button.getAttribute("data-keypad-key") ?? "";
      appendSessionAnswerDigit(digit);
    });
  });

  sessionKeypadActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applySessionAnswerAction(button.getAttribute("data-keypad-action"));
    });
  });

  sessionSubmitAnswerButton?.addEventListener("click", () => {
    submitSessionAnswer();
  });

  sessionContinueAfterJudgementButton?.addEventListener("click", () => {
    continueAfterJudgement();
  });

  sessionRetryQuestionButton?.addEventListener("click", () => {
    retryCurrentQuestion();
  });

  sessionNextQuestionButton?.addEventListener("click", () => {
    goToNextQuestion();
  });

  sessionBackGradeSelectButton?.addEventListener("click", () => {
    abandonSessionToGradeSelect();
  });

  sessionBackHomeButton?.addEventListener("click", () => {
    navigateToHome();
  });

  overlayBackdrop?.addEventListener("click", () => {
    closeOverlay();
    render();
  });

  overlayHomeIconButton?.addEventListener("click", () => {
    navigateToHome();
  });

  settingsContinueButton?.addEventListener("click", () => {
    closeOverlay();
    render();
  });

  settingsReturnHomeButton?.addEventListener("click", () => {
    navigateToHome();
  });

  settingsStartCueEnabledInput?.addEventListener("change", (event) => {
    state.preferences.startCueEnabled = event.target.checked;
    persistState("saved");
    render();
  });

  settingsStartCueVolumeInput?.addEventListener("input", (event) => {
    state.preferences.startCueVolume = Number(event.target.value);
    persistState("saved");
  });

  settingsFullscreenEnabledInput?.addEventListener("change", (event) => {
    state.display.preferFullscreenStage = event.target.checked;
    state.display.fullscreenStatus = state.display.preferFullscreenStage ? "ready" : "off";
    persistState("saved");
    render();
  });

  settingsWakeLockEnabledInput?.addEventListener("change", (event) => {
    state.display.preferWakeLock = event.target.checked;
    state.display.wakeLockStatus = state.display.preferWakeLock ? "ready" : "off";
    persistState("saved");
    render();
  });

  recordsCloseButton?.addEventListener("click", () => {
    closeOverlay();
    render();
  });

  presetSelect?.addEventListener("change", (event) => {
    const preset = compatibilityPresets.find((item) => item.id === event.target.value);
    if (!preset) return;
    state.selectedPresetId = preset.id;
    state.custom = clonePreset(preset);
    persistState("saved");
    render();
  });

  p95Input?.addEventListener("input", (event) => {
    state.custom.metrics.p95FrameDeltaMs = Number(event.target.value);
    persistState("saved");
    render();
  });

  driftInput?.addEventListener("input", (event) => {
    state.custom.metrics.maxPhaseDriftMs = Number(event.target.value);
    persistState("saved");
    render();
  });

  longFrameInput?.addEventListener("input", (event) => {
    state.custom.metrics.longFrameCount = Number(event.target.value);
    persistState("saved");
    render();
  });

  invalidInput?.addEventListener("input", (event) => {
    state.custom.recentInvalidCount = Number(event.target.value);
    persistState("saved");
    render();
  });

  viewportToggle?.addEventListener("change", (event) => {
    state.custom.env.viewportChanged = event.target.checked;
    persistState("saved");
    render();
  });

  visibilityToggle?.addEventListener("change", (event) => {
    state.custom.env.visibilityLost = event.target.checked;
    persistState("saved");
    render();
  });

  benchmarkRunButton?.addEventListener("click", () => {
    handleBenchmarkRun();
  });

  benchmarkApplyButton?.addEventListener("click", () => {
    applyLatestBenchmark();
    persistState("saved");
  });

  displayFullscreenToggle?.addEventListener("change", (event) => {
    state.display.preferFullscreenStage = event.target.checked;
    state.display.fullscreenStatus = state.display.preferFullscreenStage ? "ready" : "off";
    state.display.lastError = null;
    persistState("saved");
    render();
  });

  displayWakeLockToggle?.addEventListener("change", (event) => {
    state.display.preferWakeLock = event.target.checked;
    state.display.wakeLockStatus = state.display.preferWakeLock ? "ready" : "off";
    state.display.lastWakeLockError = null;
    persistState("saved");
    render();
  });

  storageExportButton?.addEventListener("click", () => {
    downloadStorageBackup();
  });

  storageImportTriggerButton?.addEventListener("click", () => {
    storageImportFileInput?.click();
  });

  storageImportFileInput?.addEventListener("change", async (event) => {
    const [file] = event.target.files ?? [];
    await handleStorageImportFile(file);
    event.target.value = "";
  });

  storageReplayButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const entryId = button.getAttribute("data-storage-session-id");
      if (!entryId) return;
      beginStoredSessionReplay(entryId);
    });
  });

  storageResultButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const entryId = button.getAttribute("data-storage-results-id");
      if (!entryId) return;
      openStoredSessionDetails(entryId, APP_STATES.SET_RESULTS);
    });
  });

  storageReviewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const entryId = button.getAttribute("data-storage-review-id");
      if (!entryId) return;
      openStoredSessionDetails(entryId, APP_STATES.REVIEW);
    });
  });

  guardianPinInput?.addEventListener("input", (event) => {
    state.guardian.pinDraft = event.target.value.replace(/\D+/g, "").slice(0, 4);
    state.guardian.error = null;
  });

  guardianEnableButton?.addEventListener("click", () => {
    enableGuardianLock();
    render();
  });

  guardianUnlockButton?.addEventListener("click", () => {
    unlockGuardianLock();
    render();
  });

  guardianLockButton?.addEventListener("click", () => {
    lockGuardianLock();
    render();
  });

  guardianDisableButton?.addEventListener("click", () => {
    disableGuardianLock();
    render();
  });

  stageGradeSelect?.addEventListener("change", (event) => {
    stopStagePreview({ resetFrame: true });
    state.stage.selectedGradeId = event.target.value;
    const selectedGrade = getSelectedStageGrade();
    if (!selectedGrade.supportedPracticeModes.includes(state.stage.selectedPracticeMode)) {
      state.stage.selectedPracticeMode = selectedGrade.defaultPracticeMode;
    }
    render();
  });

  stageModeSelect?.addEventListener("change", (event) => {
    stopStagePreview({ resetFrame: true });
    state.stage.selectedPracticeMode = event.target.value;
    render();
  });

  stageSpeedSelect?.addEventListener("change", (event) => {
    stopStagePreview({ resetFrame: true });
    state.stage.previewSpeed = Number(event.target.value);
    render();
  });

  stageRunButton?.addEventListener("click", () => {
    startStagePreview();
  });

  stageStopButton?.addEventListener("click", () => {
    stopStagePreview({ resetFrame: true });
    render();
  });

  updateStagePreviewDom();
  updateSessionDom();
}

function render() {
  if (shouldAnimateRenderCommit()) {
    renderTransitionInFlight = true;
    const transition = document.startViewTransition(() => {
      commitRender();
    });
    transition.finished.finally(() => {
      renderTransitionInFlight = false;
    });
    return;
  }

  commitRender();
}

function setupRuntimeWatchers() {
  let lastViewport = `${window.innerWidth}x${window.innerHeight}`;

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

    const target = event.target;
    const editable =
      target instanceof HTMLElement &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable);

    if (!editable && state.flow.route === APP_STATES.GRADE_SELECT) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        if (!event.repeat) {
          const changed = applyFlowPickerAction(event.key);
          if (changed) {
            persistState("saved");
            render();
          }
          startHeldPickerRepeat(event.key);
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        state.flow.pendingReplaySeed = null;
        state.flow.pendingReplayProblemSet = null;
        state.flow.pendingReplayQuestionCount = null;
        transitionFlow("START_SET");
        if (state.flow.route === APP_STATES.SET_COUNTDOWN) {
          syncFlowToSession({ reset: true });
        }
        render();
        return;
      }
    }

    if (editable) return;
    if (state.flow.route !== APP_STATES.SET_COUNTDOWN) return;

    if (state.session.questionState === QUESTION_STATES.AWAITING_ANSWER) {
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        appendSessionAnswerDigit(event.key);
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        applySessionAnswerAction("minus");
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        applySessionAnswerAction("backspace");
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        applySessionAnswerAction("clear");
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      runSessionPrimaryAction();
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === heldPickerKey) {
      clearHeldPickerRepeat();
    }
  });

  window.addEventListener("blur", () => {
    clearHeldPickerRepeat();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      invalidateActiveSession("visibility-lost");
      state.display.wakeLockStatus = state.display.preferWakeLock ? "ready" : "off";
    }
  });

  window.addEventListener("resize", () => {
    const currentViewport = `${window.innerWidth}x${window.innerHeight}`;
    if (currentViewport !== lastViewport) {
      lastViewport = currentViewport;
      const nextViewport = getCurrentViewportMetrics();
      if (shouldInvalidateForViewportChange(nextViewport)) {
        invalidateActiveSession("viewport-changed");
      } else {
        state.session.viewportBaseline = nextViewport;
      }
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      state.display.fullscreenStatus = "active";
      state.display.lastError = null;
      return;
    }

    if (state.display.preferFullscreenStage && isFocusStageVisible()) {
      state.display.fullscreenStatus = "fallback";
      state.display.lastError = "fullscreen exited";
      invalidateActiveSession("fullscreen-exited");
      return;
    }

    state.display.fullscreenStatus = state.display.preferFullscreenStage ? "ready" : "off";
  });

  window.__flashAnzan = {
    invalidateSession: invalidateActiveSession
  };
}

restoreFromStorage();
setupRuntimeWatchers();
render();
