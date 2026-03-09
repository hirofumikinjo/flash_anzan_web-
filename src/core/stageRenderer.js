import uiProfile from "../../profiles/uiProfile.json";

function getCanvasSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width || 1),
    height: Math.max(1, rect.height || 1)
  };
}

export function resizeStageCanvas(canvas, dpr = globalThis.devicePixelRatio || 1) {
  const { width, height } = getCanvasSize(canvas);
  const targetWidth = Math.round(width * dpr);
  const targetHeight = Math.round(height * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return context;
}

export function paintStageCanvas(canvas, frame, options = {}) {
  const context = resizeStageCanvas(canvas);
  const { width, height } = getCanvasSize(canvas);
  const colors = uiProfile.brand.colors;
  const fonts = uiProfile.brand.fonts;

  context.clearRect(0, 0, width, height);
  context.fillStyle = colors.stageBlack;
  context.fillRect(0, 0, width, height);

  const fieldInsetX = Math.max(18, width * 0.05);
  const fieldInsetY = Math.max(18, height * 0.06);
  const fieldWidth = width - fieldInsetX * 2;
  const fieldHeight = height - fieldInsetY * 2;

  context.fillStyle = "rgba(0,0,0,0)";
  context.fillRect(fieldInsetX, fieldInsetY, fieldWidth, fieldHeight);

  context.fillStyle = frame.phase === "countdown" ? "#ffffff" : colors.stageDigitGreen;
  context.shadowColor =
    frame.phase === "countdown" ? "rgba(255,255,255,0.02)" : "rgba(102,255,122,0.06)";
  context.shadowBlur = Math.max(2, Math.min(width, height) * 0.008);
  context.textAlign = "center";
  context.textBaseline = "middle";
  const digitScaleBase = Math.min(fieldWidth * 0.72, fieldHeight * 0.86);
  const fontSize =
    frame.phase === "countdown"
      ? Math.max(24, digitScaleBase * 0.22)
      : Math.max(28, Math.min(fieldWidth * 0.46, fieldHeight * 0.54));
  context.font = `${
    frame.phase === "countdown" ? "400" : "italic 300"
  } ${fontSize}px ${frame.phase === "countdown" ? fonts.body : fonts.digits}`;

  const lines = String(frame.displayText ?? "")
    .split("\n")
    .filter(Boolean);

  if (lines.length > 1) {
    const lineHeight = Math.max(48, Math.min(fieldWidth, fieldHeight) * 0.26);
    const blockHeight = lineHeight * lines.length;
    lines.forEach((line, index) => {
      context.fillText(line, width / 2, height / 2 - blockHeight / 2 + index * lineHeight + lineHeight / 2);
    });
  } else {
    context.fillText(frame.displayText ?? "", width / 2, height / 2);
  }

  context.shadowBlur = 0;
  if (frame.phase === "countdown") {
    return;
  }
}
