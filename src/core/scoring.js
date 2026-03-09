export function scoreQuestion({ answer, userAnswer, timedOut = false, revealedAnswer = false }) {
  const normalizedAnswer = String(answer);
  const normalizedUserAnswer = userAnswer == null ? "" : String(userAnswer).trim();
  const isCorrect = !timedOut && normalizedUserAnswer !== "" && normalizedUserAnswer === normalizedAnswer;

  return {
    answer,
    userAnswer: normalizedUserAnswer,
    timedOut,
    revealedAnswer,
    isCorrect,
    isIncorrect: !isCorrect
  };
}

export function getSetOutcome({ correctCount, clearThreshold }) {
  if (correctCount >= clearThreshold) return "clear";
  if (correctCount === clearThreshold - 1) return "almost";
  return "retry";
}

export function scoreSet({ questionResults, clearThreshold = 7, validSession = true, compatibilityStatus = "Verified" }) {
  const correctCount = questionResults.filter((result) => result.isCorrect).length;
  const incorrectCount = questionResults.length - correctCount;
  const timedOutCount = questionResults.filter((result) => result.timedOut).length;
  const setOutcome = validSession ? getSetOutcome({ correctCount, clearThreshold }) : "invalidated";

  return {
    score: correctCount,
    correctCount,
    incorrectCount,
    timedOutCount,
    clearThreshold,
    questionCount: questionResults.length,
    setOutcome,
    validSession,
    compatibilityStatus
  };
}
