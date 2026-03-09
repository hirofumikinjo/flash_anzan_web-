export const APP_STATES = {
  HOME: "Home",
  GRADE_SELECT: "GradeSelect",
  PRACTICE_SETUP: "PracticeSetup",
  COMPATIBILITY_CHECK: "CompatibilityCheck",
  SETUP_BLOCKED: "SetupBlocked",
  SET_COUNTDOWN: "SetCountdown",
  SET_REVIEW_SUMMARY: "SetReviewSummary",
  SET_RESULTS: "SetResults",
  REVIEW: "Review",
  INVALIDATED_RESULTS: "InvalidatedResults"
};

export const QUESTION_STATES = {
  READY: "Ready",
  COUNTDOWN: "Countdown",
  PRESENTING: "Presenting",
  SHOWING_ANSWER: "ShowingAnswer",
  AWAITING_ANSWER: "AwaitingAnswer",
  SHOWING_JUDGEMENT: "ShowingJudgement",
  ADVANCE_PROMPT: "AdvancePrompt",
  RETRY_QUEUED: "RetryQueued",
  COMPLETED: "Completed",
  INVALIDATED: "Invalidated"
};

export function nextAppState(state, event, context = {}) {
  const is20Dan = context.selectedGradeLabel === "20段";

  switch (state) {
    case APP_STATES.HOME:
      if (event === "OPEN_GRADE_SELECT") return APP_STATES.GRADE_SELECT;
      return state;
    case APP_STATES.GRADE_SELECT:
      if (event === "OPEN_SETUP" || event === "START_SET") {
        return is20Dan ? APP_STATES.COMPATIBILITY_CHECK : APP_STATES.SET_COUNTDOWN;
      }
      if (event === "BACK_HOME") return APP_STATES.HOME;
      return state;
    case APP_STATES.PRACTICE_SETUP:
      if (event === "BACK_HOME") return APP_STATES.HOME;
      if (event === "START_SET") {
        return is20Dan ? APP_STATES.COMPATIBILITY_CHECK : APP_STATES.SET_COUNTDOWN;
      }
      return state;
    case APP_STATES.COMPATIBILITY_CHECK:
      if (event === "CLASSIFIED_UNSUPPORTED") return APP_STATES.SETUP_BLOCKED;
      if (event === "CLASSIFIED_VERIFIED" || event === "CLASSIFIED_COMPATIBLE") {
        return APP_STATES.SET_COUNTDOWN;
      }
      return state;
    case APP_STATES.SETUP_BLOCKED:
      if (event === "BACK_TO_SETUP") return APP_STATES.GRADE_SELECT;
      return state;
    case APP_STATES.SET_COUNTDOWN:
      if (event === "SET_COMPLETED") return APP_STATES.SET_REVIEW_SUMMARY;
      if (event === "SESSION_INVALIDATED") return APP_STATES.INVALIDATED_RESULTS;
      return state;
    case APP_STATES.SET_REVIEW_SUMMARY:
      if (event === "OPEN_RESULTS") return APP_STATES.SET_RESULTS;
      return state;
    case APP_STATES.SET_RESULTS:
      if (event === "OPEN_REVIEW") return APP_STATES.REVIEW;
      if (event === "RESTART_SAME_CONDITIONS") return APP_STATES.GRADE_SELECT;
      if (event === "BACK_GRADE_SELECT") return APP_STATES.GRADE_SELECT;
      return state;
    case APP_STATES.REVIEW:
      if (event === "BACK_RESULTS") return APP_STATES.SET_RESULTS;
      if (event === "BACK_SETUP") return APP_STATES.GRADE_SELECT;
      return state;
    case APP_STATES.INVALIDATED_RESULTS:
      if (event === "BACK_TO_SETUP") return APP_STATES.GRADE_SELECT;
      return state;
    default:
      return state;
  }
}

export function nextQuestionState(state, event, context = {}) {
  const mode = context.practiceMode;
  const isLastQuestion = Boolean(context.isLastQuestion);

  switch (state) {
    case QUESTION_STATES.READY:
      if (event === "BEGIN_COUNTDOWN") return QUESTION_STATES.COUNTDOWN;
      return state;
    case QUESTION_STATES.COUNTDOWN:
      if (event === "COUNTDOWN_DONE") return QUESTION_STATES.PRESENTING;
      return state;
    case QUESTION_STATES.PRESENTING:
      if (event === "INVALIDATE") return QUESTION_STATES.INVALIDATED;
      if (event === "PRESENT_DONE") {
        if (mode === "display") return QUESTION_STATES.SHOWING_ANSWER;
        return QUESTION_STATES.AWAITING_ANSWER;
      }
      return state;
    case QUESTION_STATES.SHOWING_ANSWER:
      if (event === "ACKNOWLEDGE") return QUESTION_STATES.ADVANCE_PROMPT;
      return state;
    case QUESTION_STATES.AWAITING_ANSWER:
      if (event === "SUBMIT" || event === "TIMEOUT") {
        return QUESTION_STATES.SHOWING_JUDGEMENT;
      }
      return state;
    case QUESTION_STATES.SHOWING_JUDGEMENT:
      if (mode === "exam-like") {
        if (event === "AUTO_ADVANCE") {
          return isLastQuestion ? QUESTION_STATES.COMPLETED : QUESTION_STATES.READY;
        }
        return state;
      }
      if (event === "CONTINUE") return QUESTION_STATES.ADVANCE_PROMPT;
      return state;
    case QUESTION_STATES.ADVANCE_PROMPT:
      if (event === "RETRY_SAME") return QUESTION_STATES.RETRY_QUEUED;
      if (event === "NEXT_QUESTION") {
        return isLastQuestion ? QUESTION_STATES.COMPLETED : QUESTION_STATES.READY;
      }
      return state;
    case QUESTION_STATES.RETRY_QUEUED:
      if (event === "RETRY_BEGIN") return QUESTION_STATES.READY;
      return state;
    case QUESTION_STATES.INVALIDATED:
      if (event === "FINALIZE") return QUESTION_STATES.COMPLETED;
      return state;
    default:
      return state;
  }
}
