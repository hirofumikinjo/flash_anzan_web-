import { describe, expect, test } from "vitest";

import {
  buildStorageSnapshot,
  createDefaultStorageState,
  exportStorageBackup,
  importStorageBackup,
  loadStorageSnapshot,
  pushRecentSession,
  saveStorageSnapshot
} from "../../src/core/storage.js";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    }
  };
}

describe("storage", () => {
  test("creates a stable default snapshot", () => {
    const snapshot = createDefaultStorageState();
    expect(snapshot.schemaVersion).toBe("1.0.0");
    expect(snapshot.recentSessions).toEqual([]);
  });

  test("saves and loads a normalized snapshot", () => {
    const storage = createMemoryStorage();
    const snapshot = buildStorageSnapshot({
      flow: {
        selectedGradeId: "dan_20",
        selectedPracticeMode: "input",
        questionCount: 5,
        answerTimeLimitSec: 15
      },
      compatibility: {
        selectedPresetId: "verified-chrome-windows",
        custom: {
          env: { browserName: "chrome" },
          metrics: { p95FrameDeltaMs: 16 }
        }
      },
      display: {
        preferFullscreenStage: true,
        preferWakeLock: true
      },
      guardian: {
        enabled: true,
        pinHash: "g1234"
      },
      recentSessions: [
        {
          id: "seed-1",
          endedAt: "2026-03-07T00:00:00.000Z",
          gradeId: "dan_20",
          gradeLabel: "20段",
          practiceMode: "input",
          answerTimeLimitSec: 15,
          compatibilityStatus: "Verified",
          setOutcome: "clear",
          score: 1,
          questionCount: 1,
          correctCount: 1,
          incorrectCount: 0,
          timedOutCount: 0,
          seed: "seed-1",
          invalidReasons: [],
          problemSet: [{ numbers: [123, 456], answer: 579, practiceMode: "input" }],
          questionResults: [
            {
              answer: 579,
              userAnswer: "579",
              timedOut: false,
              revealedAnswer: false,
              isCorrect: true,
              isIncorrect: false
            }
          ],
          setScore: {
            score: 1,
            correctCount: 1,
            incorrectCount: 0,
            timedOutCount: 0,
            clearThreshold: 1,
            questionCount: 1,
            setOutcome: "clear",
            validSession: true,
            compatibilityStatus: "Verified"
          }
        }
      ]
    });

    expect(saveStorageSnapshot(snapshot, storage)).toBe(true);
    const loaded = loadStorageSnapshot(storage);

    expect(loaded.flow.selectedGradeId).toBe("dan_20");
    expect(loaded.flow.questionCount).toBe(5);
    expect(loaded.compatibility.selectedPresetId).toBe("verified-chrome-windows");
    expect(loaded.display.preferFullscreenStage).toBe(true);
    expect(loaded.display.preferWakeLock).toBe(true);
    expect(loaded.guardian.enabled).toBe(true);
    expect(loaded.guardian.pinHash).toBe("g1234");
    expect(loaded.recentSessions).toHaveLength(1);
    expect(loaded.recentSessions[0].answerTimeLimitSec).toBe(15);
    expect(loaded.recentSessions[0].problemSet[0].numbers).toEqual([123, 456]);
    expect(loaded.recentSessions[0].questionResults[0].userAnswer).toBe("579");
    expect(loaded.recentSessions[0].setScore?.setOutcome).toBe("clear");
  });

  test("pushRecentSession keeps newest entries first", () => {
    const next = pushRecentSession(
      [
        {
          id: "older",
          endedAt: "2026-03-06T00:00:00.000Z",
          gradeId: "kyu_20",
          gradeLabel: "20級",
          practiceMode: "display",
          answerTimeLimitSec: 10,
          compatibilityStatus: "Verified",
          setOutcome: "almost",
          score: 0,
          questionCount: 1,
          correctCount: 0,
          incorrectCount: 0,
          timedOutCount: 0,
          seed: "older",
          invalidReasons: [],
          problemSet: [],
          questionResults: [],
          setScore: null
        }
      ],
      {
        id: "newer",
        endedAt: "2026-03-07T00:00:00.000Z",
        gradeId: "dan_20",
        gradeLabel: "20段",
        practiceMode: "input",
        answerTimeLimitSec: 15,
        compatibilityStatus: "Verified",
        setOutcome: "clear",
        score: 1,
        questionCount: 1,
        correctCount: 1,
        incorrectCount: 0,
        timedOutCount: 0,
        seed: "newer",
        invalidReasons: [],
        problemSet: [],
        questionResults: [],
        setScore: null
      }
    );

    expect(next[0].id).toBe("newer");
    expect(next[1].id).toBe("older");
  });

  test("exports and imports a backup round-trip", () => {
    const snapshot = buildStorageSnapshot({
      flow: {
        selectedGradeId: "kyu_20",
        selectedPracticeMode: "display",
        questionCount: 10,
        answerTimeLimitSec: 10
      },
      compatibility: {
        selectedPresetId: "compatible-safari-mac",
        custom: null
      },
      display: {
        preferFullscreenStage: false,
        preferWakeLock: false
      },
      guardian: {
        enabled: false,
        pinHash: null
      },
      recentSessions: []
    });

    const raw = exportStorageBackup(snapshot);
    const restored = importStorageBackup(raw);

    expect(restored.flow.selectedGradeId).toBe("kyu_20");
    expect(restored.compatibility.selectedPresetId).toBe("compatible-safari-mac");
  });
});
