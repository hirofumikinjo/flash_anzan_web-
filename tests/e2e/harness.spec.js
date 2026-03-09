import { test, expect } from "@playwright/test";

const DEV_URL = "/?dev=1";

async function continueAfterStart(page) {
  const compatibilityButton = page.getByTestId("flow-apply-compatibility");
  if (await compatibilityButton.count()) {
    await compatibilityButton.click();
  }
}

test("verification harness loads grade and platform summaries", async ({ page }) => {
  await page.goto(DEV_URL);

  await expect(page.getByRole("heading", { name: "フラッシュ暗算 自宅練習" })).toBeVisible();
  await expect(page.getByTestId("grade-count")).toHaveText("40 levels loaded");
  await expect(page.getByTestId("has-20dan")).toHaveText("20段 included");
  await expect(page.getByTestId("platform-count")).toHaveText("3 platform classes loaded");
  await expect(page.getByTestId("compatibility-label")).toHaveText("20段 Verified");
  await expect(page.getByTestId("integrity-valid")).toHaveText("integrity valid");
});

test("compatibility mock updates classification when preset and metrics change", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("compatibility-preset").selectOption("compatible-safari-mac");
  await expect(page.getByTestId("compatibility-label")).toHaveText("20段 参考練習");
  await expect(page.getByTestId("compatibility-start")).toBeEnabled();

  await page.getByTestId("metric-invalid-count").fill("1");
  await expect(page.getByTestId("compatibility-label")).toHaveText("20段はこの環境では不可");
  await expect(page.getByTestId("compatibility-start")).toBeDisabled();

  await page.getByTestId("compatibility-preset").selectOption("unsupported-iphone");
  await expect(page.getByTestId("compatibility-label")).toHaveText("20段は対象外");
  await expect(page.getByTestId("compatibility-start")).toBeDisabled();
});

test("local-first settings persist across reload", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("compatibility-preset").selectOption("compatible-safari-mac");
  await page.getByTestId("display-fullscreen-toggle").check();
  await page.getByTestId("display-wakelock-toggle").check();
  await page.getByTestId("flow-open-grade-select").click();
  await expect(page.getByTestId("flow-grade-screen")).toBeVisible();
  await page.getByTestId("flow-grade-select").selectOption("dan_20");
  await page.getByTestId("flow-practice-mode").selectOption("exam-like");
  await page.getByTestId("flow-question-count").selectOption("5");
  await page.getByTestId("flow-answer-time-limit").selectOption("15");
  await expect(page.getByTestId("storage-status")).toContainText("saved");

  await page.reload();

  await expect(page.getByTestId("compatibility-preset")).toHaveValue("compatible-safari-mac");
  await expect(page.getByTestId("display-fullscreen-toggle")).toBeChecked();
  await expect(page.getByTestId("display-wakelock-toggle")).toBeChecked();
  await page.getByTestId("flow-open-grade-select").click();
  await expect(page.getByTestId("flow-grade-screen")).toBeVisible();
  await expect(page.getByTestId("flow-grade-select")).toHaveValue("dan_20");
  await expect(page.getByTestId("flow-practice-mode")).toHaveValue("exam-like");
  await expect(page.getByTestId("flow-question-count")).toHaveValue("5");
  await expect(page.getByTestId("flow-answer-time-limit")).toHaveValue("15");
});

test("guardian lock freezes settings until unlocked", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("guardian-pin-input").fill("2468");
  await page.getByTestId("guardian-enable").click();
  await expect(page.getByTestId("guardian-status")).toContainText("unlocked");

  await page.getByTestId("guardian-lock").click();
  await expect(page.getByTestId("guardian-status")).toContainText("locked");
  await expect(page.getByTestId("compatibility-preset")).toBeDisabled();

  await page.reload();
  await expect(page.getByTestId("guardian-status")).toContainText("locked");
  await expect(page.getByTestId("compatibility-preset")).toBeDisabled();

  await page.getByTestId("guardian-pin-input").fill("2468");
  await page.getByTestId("guardian-unlock").click();
  await expect(page.getByTestId("guardian-status")).toContainText("unlocked");
  await expect(page.getByTestId("compatibility-preset")).toBeEnabled();
});

test("benchmark runner collects runtime metrics and can apply them", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("metric-p95").fill("99");
  await expect(page.getByTestId("metric-p95")).toHaveValue("99");

  await page.getByTestId("benchmark-run").click();
  await expect(page.getByTestId("benchmark-status")).toHaveText("benchmark complete");
  await expect(page.getByTestId("benchmark-samples")).not.toHaveText("Samples: 0");
  await expect(page.getByTestId("benchmark-valid")).toContainText("Integrity:");

  await page.getByTestId("benchmark-apply").click();
  await expect(page.getByTestId("metric-p95")).not.toHaveValue("99");
});

test("stage preview runs a 20段 presentation and completes", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("stage-grade").selectOption("dan_20");
  await page.getByTestId("stage-speed").selectOption("12");
  await expect(page.getByTestId("stage-requirement")).toContainText("20段 gate: 20段 Verified");

  await page.getByTestId("stage-run").click();
  await expect(page.getByTestId("stage-phase")).not.toContainText("idle");
  await expect(page.getByTestId("stage-answer")).not.toHaveText("Answer: n/a");

  await expect(page.getByTestId("stage-phase")).toContainText("complete", { timeout: 3000 });
  await expect(page.getByTestId("stage-progress")).toContainText("15 / 15");
});

test("app flow routes 20段 through compatibility check into ready state", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await expect(page.getByTestId("flow-grade-screen")).toBeVisible();

  await page.getByTestId("flow-mode-official").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_20");
  await page.getByTestId("flow-question-count").selectOption("1");
  await expect(page.getByTestId("flow-grade-label")).toContainText("20段");
  await page.getByTestId("flow-start-set").click();

  await expect(page.getByTestId("flow-route")).toHaveText("CompatibilityCheck");
  await expect(page.getByTestId("flow-compatibility-label")).toContainText("20段 Verified");
  await continueAfterStart(page);

  await expect(page.getByTestId("flow-route")).toHaveText("SetCountdown");
  await expect(page.getByTestId("session-grade")).toContainText("20段");
  await expect(page.getByTestId("session-start-question")).toBeVisible();
});

test("app flow blocks unsupported 20段 environments and returns to setup", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("compatibility-preset").selectOption("unsupported-iphone");
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-mode-official").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_20");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-start-set").click();
  await continueAfterStart(page);

  await expect(page.getByTestId("flow-route")).toHaveText("SetupBlocked");
  await page.getByTestId("flow-return-setup").click();
  await expect(page.getByTestId("flow-route")).toHaveText("GradeSelect");
});

test("one-question input loop completes through summary and results", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("display-fullscreen-toggle").check();
  await page.getByTestId("display-wakelock-toggle").check();
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_20");
  await page.getByTestId("flow-practice-mode").selectOption("input");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-answer-time-limit").selectOption("15");
  await page.getByTestId("flow-start-set").click();
  await continueAfterStart(page);

  await expect(page.getByTestId("flow-route")).toHaveText("SetCountdown");
  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("Countdown");
  await expect(page.getByTestId("focus-stage-overlay")).toBeVisible();
  await expect(page.getByTestId("session-fullscreen-status")).not.toContainText("off");
  await expect(page.getByTestId("session-wakelock-status")).not.toContainText("off");
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });
  await expect(page.getByTestId("focus-stage-overlay")).toHaveCount(0);

  const answer = (await page.getByTestId("session-answer-key").textContent())?.trim() ?? "";
  await page.getByTestId("session-answer-input").fill(answer);
  await page.getByTestId("session-submit-answer").click();
  await expect(page.getByTestId("session-judgement")).toHaveText("正解");
  await page.getByTestId("session-continue-after-judgement").click();
  await page.getByTestId("session-next-question").click();

  await expect(page.getByTestId("flow-route")).toHaveText("SetReviewSummary");
  await expect(page.getByTestId("flow-summary-score")).toContainText("1 / 1");
  await expect(page.getByTestId("flow-summary-validity")).toContainText("valid");
  await page.getByTestId("flow-open-results").click();
  await expect(page.getByTestId("flow-route")).toHaveText("SetResults");
  await expect(page.getByTestId("flow-results-meta")).toContainText("練習番号");
  await expect(page.getByTestId("flow-result-row-1")).toContainText("正解");
  await page.getByTestId("flow-open-review").click();
  await expect(page.getByTestId("flow-route")).toHaveText("Review");
  await expect(page.getByTestId("flow-review-meta")).toContainText("分類");
  await expect(page.getByTestId("flow-review-row-1")).toContainText("判定: 正解");
  await page.getByTestId("flow-review-back-results").click();
  await expect(page.getByTestId("flow-route")).toHaveText("SetResults");
});

test("keyboard digits and Enter drive input mode without extra clicks", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_10");
  await page.getByTestId("flow-practice-mode").selectOption("input");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-answer-time-limit").selectOption("15");
  await page.getByTestId("flow-start-set").click();

  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });

  const answer = (await page.getByTestId("session-answer-key").textContent())?.trim() ?? "";
  await page.keyboard.type(answer);
  await expect(page.getByTestId("session-answer-input")).toHaveValue(answer);

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("session-judgement")).toHaveText("正解");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("session-next-question")).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("flow-route")).toHaveText("SetReviewSummary");
});

test("completed sets are listed in local recent sessions", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("kyu_20");
  await page.getByTestId("flow-practice-mode").selectOption("display");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-start-set").click();

  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("ShowingAnswer", { timeout: 10000 });
  await page.getByTestId("session-acknowledge-answer").click();
  await page.getByTestId("session-next-question").click();
  await expect(page.getByTestId("storage-status")).toContainText("saved");
  await expect(page.getByTestId("storage-row-1")).toContainText("自由練習");
  await expect(page.getByTestId("storage-row-1")).toContainText("自由練習モード(表示)");

  await page.reload();
  await expect(page.getByTestId("storage-row-1")).toContainText("自由練習");
  await expect(page.getByTestId("storage-row-1")).toContainText("自由練習モード(表示)");
});

test("saved recent sessions can replay the same seeded set from local data", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_20");
  await page.getByTestId("flow-practice-mode").selectOption("input");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-answer-time-limit").selectOption("15");
  await page.getByTestId("flow-start-set").click();
  await continueAfterStart(page);

  const firstSeed = (await page.getByTestId("session-seed").textContent())?.trim() ?? "";
  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });
  const firstAnswer = (await page.getByTestId("session-answer-key").textContent())?.trim() ?? "";
  await page.getByTestId("session-answer-input").fill(firstAnswer);
  await page.getByTestId("session-submit-answer").click();
  await page.getByTestId("session-continue-after-judgement").click();
  await page.getByTestId("session-next-question").click();

  await expect(page.getByTestId("storage-row-1")).toContainText("自由練習");
  await page.getByTestId("storage-replay-1").click();
  await continueAfterStart(page);

  await expect(page.getByTestId("flow-route")).toHaveText("SetCountdown");
  await expect(page.getByTestId("session-grade")).toContainText("自由練習");
  await expect(page.getByTestId("session-seed")).toHaveText(firstSeed);
  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });
  await expect(page.getByTestId("session-answer-time-limit")).toContainText("制限 15秒");
});

test("saved recent sessions can reopen results and review from local data", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("kyu_20");
  await page.getByTestId("flow-practice-mode").selectOption("display");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-start-set").click();

  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("ShowingAnswer", { timeout: 10000 });
  await page.getByTestId("session-acknowledge-answer").click();
  await page.getByTestId("session-next-question").click();

  await page.getByTestId("storage-results-1").click();
  await expect(page.getByTestId("flow-route")).toHaveText("SetResults");
  await expect(page.getByTestId("flow-results-meta")).toContainText("練習番号");
  await expect(page.getByTestId("flow-result-row-1")).toBeVisible();

  await page.getByTestId("storage-review-1").click();
  await expect(page.getByTestId("flow-route")).toHaveText("Review");
  await expect(page.getByTestId("flow-review-meta")).toContainText("分類");
  await expect(page.getByTestId("flow-review-row-1")).toBeVisible();
});

test("active sessions invalidate on viewport change", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("display-fullscreen-toggle").uncheck();
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_20");
  await page.getByTestId("flow-practice-mode").selectOption("input");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-start-set").click();
  await continueAfterStart(page);
  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("Presenting", { timeout: 7000 });

  await page.setViewportSize({ width: 1100, height: 760 });

  await expect(page.getByTestId("flow-route")).toHaveText("InvalidatedResults");
  await expect(page.getByTestId("flow-invalidated-reasons")).toContainText("画面サイズが変わりました");
  await expect(page.getByTestId("storage-row-1")).toContainText("invalidated");
});

test("input mode can retry the same question before advancing", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_20");
  await page.getByTestId("flow-practice-mode").selectOption("input");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-start-set").click();
  await continueAfterStart(page);

  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });
  const answer = (await page.getByTestId("session-answer-key").textContent())?.trim() ?? "";
  await page.getByTestId("session-answer-input").fill("0");
  await page.getByTestId("session-submit-answer").click();
  await expect(page.getByTestId("session-judgement")).toHaveText("不正解");
  await page.getByTestId("session-continue-after-judgement").click();
  await page.getByTestId("session-retry-question").click();
  await expect(page.getByTestId("session-start-question")).toBeVisible();

  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });
  await page.getByTestId("session-answer-input").fill(answer);
  await page.getByTestId("session-submit-answer").click();
  await expect(page.getByTestId("session-judgement")).toHaveText("正解");
  await page.getByTestId("session-continue-after-judgement").click();
  await page.getByTestId("session-next-question").click();

  await expect(page.getByTestId("flow-summary-score")).toContainText("1 / 1");
});

test("results can replay the same seeded question set", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_20");
  await page.getByTestId("flow-practice-mode").selectOption("input");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-start-set").click();
  await continueAfterStart(page);

  const firstSeed = (await page.getByTestId("session-seed").textContent())?.trim() ?? "";
  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });
  const firstAnswer = (await page.getByTestId("session-answer-key").textContent())?.trim() ?? "";
  await page.getByTestId("session-answer-input").fill(firstAnswer);
  await page.getByTestId("session-submit-answer").click();
  await page.getByTestId("session-continue-after-judgement").click();
  await page.getByTestId("session-next-question").click();
  await page.getByTestId("flow-open-results").click();
  await page.getByTestId("flow-results-replay-seed").click();
  await continueAfterStart(page);

  await expect(page.getByTestId("flow-route")).toHaveText("SetCountdown");
  await expect(page.getByTestId("session-seed")).toHaveText(firstSeed);
  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });
  await expect(page.getByTestId("session-answer-key")).toHaveText(firstAnswer);
});

test("results and review rows can replay a single problem", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_20");
  await page.getByTestId("flow-practice-mode").selectOption("input");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-start-set").evaluate((node) => node.click());
  await continueAfterStart(page);

  const firstSeed = (await page.getByTestId("session-seed").textContent())?.trim() ?? "";
  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });
  const firstAnswer = (await page.getByTestId("session-answer-key").textContent())?.trim() ?? "";
  await page.getByTestId("session-answer-input").fill(firstAnswer);
  await page.getByTestId("session-submit-answer").click();
  await page.getByTestId("session-continue-after-judgement").click();
  await page.getByTestId("session-next-question").click();
  await page.getByTestId("flow-open-results").click();

  await page.getByTestId("flow-result-replay-1").click();
  await continueAfterStart(page);
  await expect(page.getByTestId("flow-route")).toHaveText("SetCountdown");
  await expect(page.getByTestId("session-progress")).toContainText("1 / 1");
  await expect(page.getByTestId("session-seed")).toHaveText(`${firstSeed} / Q1`);
  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });
  await expect(page.getByTestId("session-answer-key")).toHaveText(firstAnswer);
  await page.getByTestId("session-answer-input").fill(firstAnswer);
  await page.getByTestId("session-submit-answer").click();
  await page.getByTestId("session-continue-after-judgement").click();
  await page.getByTestId("session-next-question").click();
  await page.getByTestId("flow-open-results").click();
  await page.getByTestId("flow-open-review").click();

  await page.getByTestId("flow-review-replay-1").click();
  await continueAfterStart(page);
  await expect(page.getByTestId("flow-route")).toHaveText("SetCountdown");
  await expect(page.getByTestId("session-progress")).toContainText("1 / 1");
  await expect(page.getByTestId("session-seed")).toHaveText(`${firstSeed} / Q1 / Q1`);
});

test("invalidated sessions can safely restart the same seeded question set", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("display-fullscreen-toggle").uncheck();
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_20");
  await page.getByTestId("flow-practice-mode").selectOption("input");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-start-set").click();
  await continueAfterStart(page);

  const firstSeed = (await page.getByTestId("session-seed").textContent())?.trim() ?? "";
  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("Presenting", { timeout: 4000 });

  await page.setViewportSize({ width: 1100, height: 760 });

  await expect(page.getByTestId("flow-route")).toHaveText("InvalidatedResults");
  await expect(page.getByTestId("flow-invalidated-reasons")).toContainText("画面サイズが変わりました");
  await page.getByTestId("flow-invalidated-replay-seed").click();
  await continueAfterStart(page);

  await expect(page.getByTestId("flow-route")).toHaveText("SetCountdown");
  await expect(page.getByTestId("session-seed")).toHaveText(firstSeed);
  await expect(page.getByTestId("session-progress")).toContainText("1 / 1");
});

test("display mode reveals answer and advances through the loop", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("kyu_20");
  await page.getByTestId("flow-practice-mode").selectOption("display");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-start-set").click();

  await expect(page.getByTestId("flow-route")).toHaveText("SetCountdown");
  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("Countdown");
  await expect(page.getByTestId("session-phase")).toContainText("ShowingAnswer", { timeout: 10000 });
  await expect(page.getByTestId("session-answer-reveal")).not.toHaveText("");
  await page.getByTestId("session-acknowledge-answer").click();
  await expect(page.getByTestId("session-next-question")).toBeVisible();
  await page.getByTestId("session-next-question").click();

  await expect(page.getByTestId("flow-route")).toHaveText("SetReviewSummary");
  await expect(page.getByTestId("flow-summary-outcome")).toContainText("almost");
});

test("input mode can reveal the answer and continue through the loop", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("kyu_20");
  await page.getByTestId("flow-practice-mode").selectOption("input");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-start-set").click();

  await expect(page.getByTestId("flow-route")).toHaveText("SetCountdown");
  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });

  const answer = (await page.getByTestId("session-answer-key").textContent())?.trim() ?? "";
  await page.getByTestId("session-reveal-answer").click();
  await expect(page.getByTestId("session-answer-reveal")).toHaveText(answer);
  await page.getByTestId("session-acknowledge-answer").click();
  await expect(page.getByTestId("session-next-question")).toBeVisible();
  await page.getByTestId("session-next-question").click();

  await expect(page.getByTestId("flow-route")).toHaveText("SetReviewSummary");
  await expect(page.getByTestId("flow-summary-score")).toContainText("0 / 1");
});

test("incorrect input shows the compare board before continuing", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_10");
  await page.getByTestId("flow-practice-mode").selectOption("input");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-answer-time-limit").selectOption("15");
  await page.getByTestId("flow-start-set").click();

  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });
  const answerKey = (await page.getByTestId("session-answer-key").textContent())?.trim() ?? "";
  const parsedAnswer = Number.parseInt(answerKey, 10);
  const incorrectAnswer = Number.isFinite(parsedAnswer)
    ? String(parsedAnswer === 0 ? 1 : 0)
    : "0";
  await page.getByTestId("session-answer-input").fill(incorrectAnswer);
  await page.getByTestId("session-submit-answer").click();

  await expect(page.getByTestId("session-judgement")).toHaveText("不正解");
  await expect(page.locator(".software-session-compare")).toContainText("正解");
  await expect(page.locator(".software-session-compare")).toContainText("入力");
  await page.getByTestId("session-continue-after-judgement").click();
  await expect(page.getByTestId("session-next-question")).toBeVisible();
});

test("exam-like mode auto-advances after a correct answer", async ({ page }) => {
  await page.goto(DEV_URL);

  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-select").selectOption("dan_20");
  await page.getByTestId("flow-practice-mode").selectOption("exam-like");
  await page.getByTestId("flow-question-count").selectOption("1");
  await page.getByTestId("flow-start-set").click();
  await continueAfterStart(page);

  await page.getByTestId("session-start-question").click();
  await expect(page.getByTestId("session-phase")).toContainText("AwaitingAnswer", { timeout: 12000 });
  const answer = (await page.getByTestId("session-answer-key").textContent())?.trim() ?? "";
  await page.getByTestId("session-answer-input").fill(answer);
  await page.getByTestId("session-answer-input").press("Enter");

  await expect(page.getByTestId("session-judgement")).toHaveText("正解");
  await expect(page.getByTestId("flow-route")).toHaveText("SetReviewSummary", { timeout: 3000 });
  await expect(page.getByTestId("flow-summary-score")).toContainText("1 / 1");
});

test("default route shows software-only UI without developer panels", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("フラッシュ暗算 自宅練習ソフト");
  await expect(page.getByTestId("runtime-shell")).toBeVisible();
  await expect(page.getByTestId("flow-home-screen")).toBeVisible();
  await expect(page.locator(".official-title-note")).toContainText("非公式");
  await expect(page.getByTestId("grade-summary")).toHaveCount(0);
  await expect(page.getByTestId("compatibility-screen")).toHaveCount(0);
});
