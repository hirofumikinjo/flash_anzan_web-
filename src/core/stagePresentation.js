import timingProfile from "../../profiles/timingProfile.json";
import { createTimedTimeline } from "./timingHarness.js";

export function getPresentationDurationMs(grade, speedMultiplier = 1) {
  if (grade.mode === "image") {
    const imageTimeSec = grade.hardTimeSec ?? grade.officialTimeSec;
    if (typeof imageTimeSec === "number") {
      return (imageTimeSec * 1000) / speedMultiplier;
    }
    return timingProfile.image.previewMs / speedMultiplier;
  }

  const baseTimeSec = grade.hardTimeSec ?? grade.officialTimeSec;
  if (typeof baseTimeSec !== "number") {
    throw new Error(`Missing presentation time for ${grade.label}`);
  }

  return (baseTimeSec * 1000) / speedMultiplier;
}

export function buildStagePlan({
  grade,
  problem,
  speedMultiplier = 1
}) {
  const countdownDurationMs = timingProfile.prestart.pauseAfterSecondBeepMs / speedMultiplier;
  const presentationDurationMs = getPresentationDurationMs(grade, speedMultiplier);
  const introDisplayText = `${grade.digits}桁\n${grade.count}口\n${
    typeof (grade.hardTimeSec ?? grade.officialTimeSec) === "number"
      ? `${(grade.hardTimeSec ?? grade.officialTimeSec).toFixed(grade.mode === "image" ? 2 : 2)}秒`
      : "イメージ"
  }`;

  if (grade.mode === "image") {
    const timeline = createTimedTimeline({
      count: grade.count,
      totalDurationMs: presentationDurationMs,
      displayRatio: timingProfile.image.displayRatio,
      gapRatio: timingProfile.image.gapRatio
    });

    return {
      gradeLabel: grade.label,
      practiceMode: problem.practiceMode,
      mode: grade.mode,
      countdownDurationMs,
      presentationDurationMs,
      totalDurationMs: countdownDurationMs + presentationDurationMs,
      introDisplayText,
      numbers: [...problem.numbers],
      timeline
    };
  }

  const timeline = createTimedTimeline({
    count: grade.count,
    totalDurationMs: presentationDurationMs,
    displayRatio: timingProfile.strict20.displayRatio,
    gapRatio: timingProfile.strict20.gapRatio
  });

  return {
    gradeLabel: grade.label,
    practiceMode: problem.practiceMode,
    mode: grade.mode,
    countdownDurationMs,
    presentationDurationMs,
    totalDurationMs: countdownDurationMs + presentationDurationMs,
    introDisplayText,
    numbers: [...problem.numbers],
    timeline
  };
}

export function getStageFrame(plan, elapsedMs) {
  if (elapsedMs < 0) {
    return {
      phase: "idle",
      displayText: "READY",
      progressLabel: "0 / 0",
      isVisible: false,
      completed: false
    };
  }

  if (elapsedMs < plan.countdownDurationMs) {
    return {
      phase: "countdown",
      displayText: "",
      progressLabel: "準備",
      isVisible: false,
      completed: false
    };
  }

  const presentationElapsedMs = elapsedMs - plan.countdownDurationMs;

  if (plan.mode === "image") {
    if (presentationElapsedMs >= plan.presentationDurationMs) {
      return {
        phase: "complete",
        displayText: "END",
        progressLabel: "完了",
        isVisible: true,
        completed: true
      };
    }

    const activeMouth = plan.timeline.find((mouth) => presentationElapsedMs < mouth.gapEndMs);
    if (!activeMouth) {
      return {
        phase: "complete",
        displayText: "END",
        progressLabel: `${plan.numbers.length} / ${plan.numbers.length}`,
        isVisible: true,
        completed: true
      };
    }

    const isVisible = presentationElapsedMs >= activeMouth.showStartMs && presentationElapsedMs < activeMouth.showEndMs;
    return {
      phase: isVisible ? "presenting" : "gap",
      displayText: isVisible ? String(plan.numbers[activeMouth.index]) : "",
      progressLabel: `${activeMouth.index + 1} / ${plan.numbers.length}`,
      isVisible,
      completed: false
    };
  }

  if (presentationElapsedMs >= plan.presentationDurationMs) {
    return {
      phase: "complete",
      displayText: "END",
      progressLabel: `${plan.numbers.length} / ${plan.numbers.length}`,
      isVisible: true,
      completed: true
    };
  }

  const activeMouth = plan.timeline.find((mouth) => presentationElapsedMs < mouth.gapEndMs);

  if (!activeMouth) {
    return {
      phase: "complete",
      displayText: "END",
      progressLabel: `${plan.numbers.length} / ${plan.numbers.length}`,
      isVisible: true,
      completed: true
    };
  }

  const currentNumber = String(plan.numbers[activeMouth.index]);
  const isVisible = presentationElapsedMs >= activeMouth.showStartMs && presentationElapsedMs < activeMouth.showEndMs;

  return {
    phase: isVisible ? "presenting" : "gap",
    displayText: isVisible ? currentNumber : "",
    progressLabel: `${activeMouth.index + 1} / ${plan.numbers.length}`,
    isVisible,
    completed: false
  };
}
