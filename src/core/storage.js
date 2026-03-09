import storageProfile from "../../profiles/storageProfile.json";

const STORAGE_KEY = "flashAnzanWeb.storage.v1";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDefaultStorageState() {
  return {
    schemaVersion: storageProfile.schemaVersion,
    profileId: storageProfile.profileId,
    flow: {
      selectedGradeId: null,
      selectedTrainingMode: "official",
      selectedPracticeMode: null,
      questionCount: 10,
      answerTimeLimitSec: 10,
      freeConfig: {
        digits: 1,
        count: 3,
        timeSec: 5
      }
    },
    compatibility: {
      selectedPresetId: null,
      custom: null
    },
    display: {
      preferFullscreenStage: false,
      preferWakeLock: false
    },
    preferences: {
      startCueEnabled: true,
      startCueVolume: 70
    },
    guardian: {
      enabled: false,
      pinHash: null
    },
    recentSessions: []
  };
}

function normalizeRecentSession(entry) {
  if (!entry || typeof entry !== "object") return null;

  return {
    id: String(entry.id ?? ""),
    endedAt: String(entry.endedAt ?? ""),
    gradeId: String(entry.gradeId ?? ""),
    gradeLabel: String(entry.gradeLabel ?? ""),
    practiceMode: String(entry.practiceMode ?? ""),
    answerTimeLimitSec: Number(entry.answerTimeLimitSec ?? 10),
    compatibilityStatus: String(entry.compatibilityStatus ?? ""),
    setOutcome: String(entry.setOutcome ?? ""),
    score: Number(entry.score ?? 0),
    questionCount: Number(entry.questionCount ?? 0),
    correctCount: Number(entry.correctCount ?? 0),
    incorrectCount: Number(entry.incorrectCount ?? 0),
    timedOutCount: Number(entry.timedOutCount ?? 0),
    seed: String(entry.seed ?? ""),
    invalidReasons: Array.isArray(entry.invalidReasons) ? entry.invalidReasons.map(String) : [],
    problemSet: Array.isArray(entry.problemSet)
      ? entry.problemSet.map((problem) => ({
          numbers: Array.isArray(problem?.numbers) ? problem.numbers.map((value) => Number(value)) : [],
          answer: Number(problem?.answer ?? 0),
          practiceMode: String(problem?.practiceMode ?? "")
        }))
      : [],
    questionResults: Array.isArray(entry.questionResults)
      ? entry.questionResults.map((result) => ({
          answer: Number(result?.answer ?? 0),
          userAnswer: result?.userAnswer == null ? "" : String(result.userAnswer),
          timedOut: Boolean(result?.timedOut),
          revealedAnswer: Boolean(result?.revealedAnswer),
          isCorrect: Boolean(result?.isCorrect),
          isIncorrect: Boolean(result?.isIncorrect)
        }))
      : [],
    setScore: entry.setScore
      ? {
          score: Number(entry.setScore.score ?? 0),
          correctCount: Number(entry.setScore.correctCount ?? 0),
          incorrectCount: Number(entry.setScore.incorrectCount ?? 0),
          timedOutCount: Number(entry.setScore.timedOutCount ?? 0),
          clearThreshold: Number(entry.setScore.clearThreshold ?? 0),
          questionCount: Number(entry.setScore.questionCount ?? 0),
          setOutcome: String(entry.setScore.setOutcome ?? ""),
          validSession: Boolean(entry.setScore.validSession),
          compatibilityStatus: String(entry.setScore.compatibilityStatus ?? "")
        }
      : null
  };
}

function normalizeSnapshot(snapshot) {
  const fallback = createDefaultStorageState();
  if (!snapshot || typeof snapshot !== "object") return fallback;

  const recentSeedLimit = storageProfile.retention.recentSeedLimit;
  const recentSessions = Array.isArray(snapshot.recentSessions)
    ? snapshot.recentSessions
        .map(normalizeRecentSession)
        .filter(Boolean)
        .slice(0, recentSeedLimit)
    : [];

  return {
    schemaVersion: storageProfile.schemaVersion,
    profileId: storageProfile.profileId,
    flow: {
      selectedGradeId: snapshot.flow?.selectedGradeId ? String(snapshot.flow.selectedGradeId) : null,
      selectedTrainingMode:
        snapshot.flow?.selectedTrainingMode === "free" || snapshot.flow?.selectedTrainingMode === "official"
          ? snapshot.flow.selectedTrainingMode
          : fallback.flow.selectedTrainingMode,
      selectedPracticeMode: snapshot.flow?.selectedPracticeMode ? String(snapshot.flow.selectedPracticeMode) : null,
      questionCount: Number(snapshot.flow?.questionCount ?? fallback.flow.questionCount),
      answerTimeLimitSec: Number(snapshot.flow?.answerTimeLimitSec ?? fallback.flow.answerTimeLimitSec),
      freeConfig: {
        digits: [1, 2, 3].includes(Number(snapshot.flow?.freeConfig?.digits))
          ? Number(snapshot.flow.freeConfig.digits)
          : fallback.flow.freeConfig.digits,
        count: [2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20].includes(Number(snapshot.flow?.freeConfig?.count))
          ? Number(snapshot.flow.freeConfig.count)
          : fallback.flow.freeConfig.count,
        timeSec: [1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15].includes(Number(snapshot.flow?.freeConfig?.timeSec))
          ? Number(snapshot.flow.freeConfig.timeSec)
          : fallback.flow.freeConfig.timeSec
      }
    },
    compatibility: {
      selectedPresetId: snapshot.compatibility?.selectedPresetId
        ? String(snapshot.compatibility.selectedPresetId)
        : null,
      custom: snapshot.compatibility?.custom ? cloneJson(snapshot.compatibility.custom) : null
    },
    display: {
      preferFullscreenStage: Boolean(snapshot.display?.preferFullscreenStage),
      preferWakeLock: Boolean(snapshot.display?.preferWakeLock)
    },
    preferences: {
      startCueEnabled:
        typeof snapshot.preferences?.startCueEnabled === "boolean"
          ? snapshot.preferences.startCueEnabled
          : fallback.preferences.startCueEnabled,
      startCueVolume: Math.max(
        0,
        Math.min(100, Number(snapshot.preferences?.startCueVolume ?? fallback.preferences.startCueVolume))
      )
    },
    guardian: {
      enabled: Boolean(snapshot.guardian?.enabled),
      pinHash: snapshot.guardian?.pinHash ? String(snapshot.guardian.pinHash) : null
    },
    recentSessions
  };
}

export function buildStorageSnapshot({ flow, compatibility, display, preferences, guardian, recentSessions }) {
  return normalizeSnapshot({
    flow,
    compatibility,
    display,
    preferences,
    guardian,
    recentSessions
  });
}

export function loadStorageSnapshot(storage = globalThis?.localStorage) {
  if (!storage?.getItem) {
    return createDefaultStorageState();
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultStorageState();
    const parsed = JSON.parse(raw);
    if (
      storageProfile.backup.requireSchemaVersionCheck &&
      parsed?.schemaVersion &&
      parsed.schemaVersion !== storageProfile.schemaVersion
    ) {
      return createDefaultStorageState();
    }
    return normalizeSnapshot(parsed);
  } catch {
    return createDefaultStorageState();
  }
}

export function saveStorageSnapshot(snapshot, storage = globalThis?.localStorage) {
  if (!storage?.setItem) {
    return false;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeSnapshot(snapshot)));
    return true;
  } catch {
    return false;
  }
}

export function pushRecentSession(recentSessions, sessionEntry) {
  const next = [normalizeRecentSession(sessionEntry), ...(recentSessions ?? []).map(normalizeRecentSession).filter(Boolean)];
  return next.slice(0, storageProfile.retention.recentSeedLimit);
}

export function exportStorageBackup(snapshot) {
  return JSON.stringify(normalizeSnapshot(snapshot), null, 2);
}

export function importStorageBackup(raw) {
  const parsed = JSON.parse(raw);
  if (
    storageProfile.backup.requireSchemaVersionCheck &&
    parsed?.schemaVersion &&
    parsed.schemaVersion !== storageProfile.schemaVersion
  ) {
    throw new Error("schema mismatch");
  }
  return normalizeSnapshot(parsed);
}

export { STORAGE_KEY };
