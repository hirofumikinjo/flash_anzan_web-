import { describe, expect, it } from "vitest";
import { APP_STATES, QUESTION_STATES, nextAppState, nextQuestionState } from "../../src/core/stateMachine.js";

describe("app state machine", () => {
  it("routes 20段 through compatibility check", () => {
    const next = nextAppState(APP_STATES.PRACTICE_SETUP, "START_SET", {
      selectedGradeLabel: "20段"
    });
    expect(next).toBe(APP_STATES.COMPATIBILITY_CHECK);
  });

  it("routes non-20段 directly to countdown", () => {
    const next = nextAppState(APP_STATES.PRACTICE_SETUP, "START_SET", {
      selectedGradeLabel: "10級"
    });
    expect(next).toBe(APP_STATES.SET_COUNTDOWN);
  });

  it("blocks unsupported compatibility result", () => {
    const next = nextAppState(APP_STATES.COMPATIBILITY_CHECK, "CLASSIFIED_UNSUPPORTED");
    expect(next).toBe(APP_STATES.SETUP_BLOCKED);
  });

  it("routes invalidated sessions to invalidated results", () => {
    const next = nextAppState(APP_STATES.SET_COUNTDOWN, "SESSION_INVALIDATED");
    expect(next).toBe(APP_STATES.INVALIDATED_RESULTS);
  });
});

describe("question state machine", () => {
  it("routes display mode to showingAnswer after presenting", () => {
    const next = nextQuestionState(QUESTION_STATES.PRESENTING, "PRESENT_DONE", {
      practiceMode: "display"
    });
    expect(next).toBe(QUESTION_STATES.SHOWING_ANSWER);
  });

  it("routes input mode to awaitingAnswer after presenting", () => {
    const next = nextQuestionState(QUESTION_STATES.PRESENTING, "PRESENT_DONE", {
      practiceMode: "input"
    });
    expect(next).toBe(QUESTION_STATES.AWAITING_ANSWER);
  });

  it("auto advances exam-like last question to completed", () => {
    const next = nextQuestionState(QUESTION_STATES.SHOWING_JUDGEMENT, "AUTO_ADVANCE", {
      practiceMode: "exam-like",
      isLastQuestion: true
    });
    expect(next).toBe(QUESTION_STATES.COMPLETED);
  });

  it("queues retry from advance prompt", () => {
    const next = nextQuestionState(QUESTION_STATES.ADVANCE_PROMPT, "RETRY_SAME", {
      practiceMode: "input",
      isLastQuestion: false
    });
    expect(next).toBe(QUESTION_STATES.RETRY_QUEUED);
  });

  it("invalidates presenting sessions", () => {
    const next = nextQuestionState(QUESTION_STATES.PRESENTING, "INVALIDATE", {
      practiceMode: "input"
    });
    expect(next).toBe(QUESTION_STATES.INVALIDATED);
  });
});
