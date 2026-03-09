import { describe, expect, it } from "vitest";

import { paintStageCanvas } from "../../src/core/stageRenderer.js";

function createFakeCanvas() {
  const drawCalls = [];
  const context = {
    fillStyle: "",
    strokeStyle: "",
    font: "",
    lineWidth: 1,
    textAlign: "left",
    textBaseline: "alphabetic",
    shadowColor: "",
    shadowBlur: 0,
    setTransform() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    fillText(text) {
      drawCalls.push({
        text,
        fillStyle: this.fillStyle,
        shadowColor: this.shadowColor,
        shadowBlur: this.shadowBlur
      });
    }
  };

  return {
    width: 0,
    height: 0,
    getBoundingClientRect() {
      return { width: 640, height: 360 };
    },
    getContext() {
      return context;
    },
    drawCalls
  };
}

describe("stage renderer", () => {
  it("renders flash digits in green", () => {
    const canvas = createFakeCanvas();

    paintStageCanvas(
      canvas,
      {
        displayText: "123",
        progressLabel: "1 / 15",
        phase: "presenting"
      },
      {
        gradeLabel: "20段",
        compatibilityLabel: "Verified"
      }
    );

    const digitCall = canvas.drawCalls.find((call) => call.text === "123");
    expect(digitCall?.fillStyle).toBe("#66FF7A");
    expect(digitCall?.shadowColor).toContain("102,255,122");
  });
});
