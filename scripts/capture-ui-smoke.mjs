import fs from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4174/";
const outputDir = process.env.OUTPUT_DIR ?? "/Users/hirofumikinjo/Kinjo_WorkSpace/output/playwright";
const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const storageKey = "flashAnzanWeb.storage.v1";
const smokeDevice = (process.env.SMOKE_DEVICE ?? "desktop").toLowerCase();
const screenshotPrefix = smokeDevice === "iphone14" ? "flash_anzan_mobile_smoke" : "flash_anzan_smoke";

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({
    path: path.join(outputDir, `${name}_${stamp}.png`),
    fullPage: true
  });
}

async function shotLocator(locator, name) {
  await locator.screenshot({
    path: path.join(outputDir, `${name}_${stamp}.png`)
  });
}

async function assertNoBodyScroll(page, label) {
  const metrics = await page.evaluate(() => ({
    bodyScrollHeight: document.body.scrollHeight,
    bodyClientHeight: document.body.clientHeight,
    docScrollHeight: document.documentElement.scrollHeight,
    docClientHeight: document.documentElement.clientHeight,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth
  }));
  const verticalOverflow =
    metrics.bodyScrollHeight > metrics.bodyClientHeight + 1 ||
    metrics.docScrollHeight > metrics.docClientHeight + 1;
  const horizontalOverflow =
    metrics.bodyScrollWidth > metrics.bodyClientWidth + 1 ||
    metrics.docScrollWidth > metrics.docClientWidth + 1;

  if (verticalOverflow || horizontalOverflow) {
    throw new Error(
      `${label}: body overflow detected (${JSON.stringify(metrics)})`
    );
  }
}

async function assertInViewport(page, locator, label) {
  await locator.waitFor({ state: "visible", timeout: 10000 });
  const rect = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      left: box.left,
      width: box.width,
      height: box.height
    };
  });
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const fits =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= viewport.height &&
    rect.right <= viewport.width &&
    rect.width > 0 &&
    rect.height > 0;

  if (!fits) {
    throw new Error(
      `${label}: element is outside viewport (${JSON.stringify({ rect, viewport })})`
    );
  }
}

async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })
  );
  await page.waitForTimeout(220);
}

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await settle(page);
}

async function updateStoredFlow(page, patch) {
  await page.evaluate(
    ({ key, flowPatch }) => {
      const current = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      const next = {
        ...current,
        flow: {
          ...(current.flow ?? {}),
          ...flowPatch
        }
      };
      window.localStorage.setItem(key, JSON.stringify(next));
    },
    { key: storageKey, flowPatch: patch }
  );
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await settle(page);
}

async function captureHome(page) {
  await gotoApp(page);
  await page.getByTestId("flow-home-screen").waitFor({ state: "visible", timeout: 10000 });
  await assertNoBodyScroll(page, "home");
  await assertInViewport(page, page.getByTestId("flow-open-grade-select"), "home start");
  await shot(page, `${screenshotPrefix}_home`);
}

async function captureGrade(page) {
  await gotoApp(page);
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-mode-official").click();
  await assertNoBodyScroll(page, "grade");
  await assertInViewport(page, page.getByTestId("flow-start-set"), "grade start");
  await shot(page, `${screenshotPrefix}_grade`);
}

async function captureFree(page) {
  await gotoApp(page);
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-mode-free").click();
  await assertNoBodyScroll(page, "free");
  await assertInViewport(page, page.getByTestId("flow-start-set"), "free start");
  await shot(page, `${screenshotPrefix}_free`);
}

async function captureAnswer(page) {
  await gotoApp(page);
  await updateStoredFlow(page, {
    selectedPracticeMode: "input",
    questionCount: 1,
    answerTimeLimitSec: 15
  });
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-grade-select").selectOption("kyu_20");
  await page.getByTestId("flow-start-set").click();
  await page.getByTestId("session-start-question").click();
  await page.getByTestId("session-answer-input").waitFor({ state: "visible", timeout: 15000 });
  await assertNoBodyScroll(page, "answer");
  await assertInViewport(page, page.getByTestId("session-answer-input"), "answer input");
  await assertInViewport(page, page.getByTestId("session-submit-answer"), "answer submit");
  await shot(page, `${screenshotPrefix}_answer`);
}

async function captureAnswerReveal(page) {
  await gotoApp(page);
  await updateStoredFlow(page, {
    selectedPracticeMode: "input",
    questionCount: 1,
    answerTimeLimitSec: 15
  });
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-grade-select").selectOption("kyu_20");
  await page.getByTestId("flow-start-set").click();
  await page.getByTestId("session-start-question").click();
  await page.getByTestId("session-answer-input").waitFor({ state: "visible", timeout: 15000 });
  await page.getByTestId("session-reveal-answer").click();
  await page.getByTestId("session-answer-reveal").waitFor({ state: "visible", timeout: 10000 });
  await assertNoBodyScroll(page, "answer reveal");
  await assertInViewport(page, page.getByTestId("session-acknowledge-answer"), "answer reveal next");
  await shot(page, `${screenshotPrefix}_answer_reveal`);
}

async function captureJudgement(page) {
  await gotoApp(page);
  await updateStoredFlow(page, {
    selectedPracticeMode: "input",
    questionCount: 1,
    answerTimeLimitSec: 15
  });
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-grade-select").selectOption("dan_10");
  await page.getByTestId("flow-start-set").click();
  await page.getByTestId("session-start-question").click();
  await page.getByTestId("session-answer-input").waitFor({ state: "visible", timeout: 15000 });
  await page.getByTestId("session-answer-input").fill("0");
  await page.getByTestId("session-submit-answer").click();
  await page.getByTestId("session-judgement").waitFor({ state: "visible", timeout: 10000 });
  await assertNoBodyScroll(page, "judgement");
  await assertInViewport(page, page.getByTestId("session-continue-after-judgement"), "judgement next");
  await shot(page, `${screenshotPrefix}_judgement`);
}

async function capturePrestart(page) {
  await gotoApp(page);
  await updateStoredFlow(page, {
    selectedPracticeMode: "input",
    questionCount: 1,
    answerTimeLimitSec: 15
  });
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-grade-select").selectOption("kyu_20");
  await page.getByTestId("flow-start-set").click();
  await page.getByTestId("session-start-question").click();
  await page.getByTestId("focus-stage-overlay").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(120);
  await shot(page, `${screenshotPrefix}_prestart`);
}

async function captureResults(page) {
  await gotoApp(page);
  await updateStoredFlow(page, {
    selectedPracticeMode: "input",
    questionCount: 1,
    answerTimeLimitSec: 15
  });
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-grade-select").selectOption("kyu_20");
  await page.getByTestId("flow-start-set").click();
  await page.getByTestId("session-start-question").click();
  await page.getByTestId("session-answer-input").waitFor({ state: "visible", timeout: 15000 });
  const answer = ((await page.getByTestId("session-answer-key").textContent()) ?? "").trim();
  await page.getByTestId("session-answer-input").fill(answer);
  await page.getByTestId("session-submit-answer").click();
  await page.getByTestId("session-continue-after-judgement").click();
  await page.getByTestId("session-next-question").click();
  await page.getByTestId("flow-summary-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-open-results").click();
  await page.getByTestId("flow-results-screen").waitFor({ state: "visible", timeout: 10000 });
  await assertNoBodyScroll(page, "results");
  await assertInViewport(page, page.getByTestId("flow-open-review"), "results review button");
  await shot(page, `${screenshotPrefix}_results`);
}

async function captureSummary(page) {
  await gotoApp(page);
  await updateStoredFlow(page, {
    selectedPracticeMode: "input",
    questionCount: 1,
    answerTimeLimitSec: 15
  });
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-grade-select").selectOption("kyu_20");
  await page.getByTestId("flow-start-set").click();
  await page.getByTestId("session-start-question").click();
  await page.getByTestId("session-answer-input").waitFor({ state: "visible", timeout: 15000 });
  const answer = ((await page.getByTestId("session-answer-key").textContent()) ?? "").trim();
  await page.getByTestId("session-answer-input").fill(answer);
  await page.getByTestId("session-submit-answer").click();
  await page.getByTestId("session-continue-after-judgement").click();
  await page.getByTestId("session-next-question").click();
  await page.getByTestId("flow-summary-screen").waitFor({ state: "visible", timeout: 10000 });
  await assertNoBodyScroll(page, "summary");
  await assertInViewport(page, page.getByTestId("flow-open-results"), "summary results button");
  await shot(page, `${screenshotPrefix}_summary`);
}

async function captureReview(page) {
  await gotoApp(page);
  await updateStoredFlow(page, {
    selectedPracticeMode: "input",
    questionCount: 1,
    answerTimeLimitSec: 15
  });
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-grade-select").selectOption("kyu_20");
  await page.getByTestId("flow-start-set").click();
  await page.getByTestId("session-start-question").click();
  await page.getByTestId("session-answer-input").waitFor({ state: "visible", timeout: 15000 });
  const answer = ((await page.getByTestId("session-answer-key").textContent()) ?? "").trim();
  await page.getByTestId("session-answer-input").fill(answer);
  await page.getByTestId("session-submit-answer").click();
  await page.getByTestId("session-continue-after-judgement").click();
  await page.getByTestId("session-next-question").click();
  await page.getByTestId("flow-summary-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-open-results").click();
  await page.getByTestId("flow-results-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-open-review").click();
  await page.getByTestId("flow-review-screen").waitFor({ state: "visible", timeout: 10000 });
  await assertNoBodyScroll(page, "review");
  await assertInViewport(page, page.getByTestId("flow-review-screen"), "review screen");
  await shot(page, `${screenshotPrefix}_review`);
}

async function captureSettings(page) {
  await gotoApp(page);
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-open-settings").click();
  const dialog = page.getByRole("dialog", { name: "設定" });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  await dialog.getByText("スタート音", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
  await assertNoBodyScroll(page, "settings");
  await assertInViewport(page, dialog, "settings dialog");
  await shotLocator(dialog, `${screenshotPrefix}_settings`);
}

async function captureRecords(page) {
  await gotoApp(page);
  await page.getByTestId("flow-open-grade-select").click();
  await page.getByTestId("flow-grade-screen").waitFor({ state: "visible", timeout: 10000 });
  await page.getByTestId("flow-open-records").click();
  const dialog = page.getByRole("dialog", { name: "成績" });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  await dialog.getByText("保存数", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
  await assertNoBodyScroll(page, "records");
  await assertInViewport(page, dialog, "records dialog");
  await shotLocator(dialog, `${screenshotPrefix}_records`);
}

async function main() {
  await ensureDir(outputDir);
  const browser = await chromium.launch({ headless: true });
  const page =
    smokeDevice === "iphone14"
      ? await browser.newPage(devices["iPhone 14"])
      : await browser.newPage({ viewport: { width: 1280, height: 920 } });

  try {
    await captureHome(page);
    await captureGrade(page);
    await captureFree(page);
    await captureSettings(page);
    await captureRecords(page);
    await capturePrestart(page);
    await captureAnswer(page);
    await captureAnswerReveal(page);
    await captureJudgement(page);
    await captureSummary(page);
    await captureResults(page);
    await captureReview(page);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
