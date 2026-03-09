import { describe, expect, it } from "vitest";
import gradeProfile from "../../profiles/gradeProfile.json";
import platformProfile from "../../profiles/platformProfile.json";
import practiceModeProfile from "../../profiles/practiceModeProfile.json";
import resultPolicyProfile from "../../profiles/resultPolicyProfile.json";
import timingProfile from "../../profiles/timingProfile.json";
import generatorProfile from "../../profiles/generatorProfile.json";
import uiProfile from "../../profiles/uiProfile.json";
import audioProfile from "../../profiles/audioProfile.json";
import storageProfile from "../../profiles/storageProfile.json";

describe("profile contracts", () => {
  it("contains all expected profiles", () => {
    expect(gradeProfile.profileId).toBeTruthy();
    expect(platformProfile.profileId).toBeTruthy();
    expect(practiceModeProfile.profileId).toBeTruthy();
    expect(resultPolicyProfile.profileId).toBeTruthy();
    expect(timingProfile.profileId).toBeTruthy();
    expect(generatorProfile.profileId).toBeTruthy();
    expect(uiProfile.profileId).toBeTruthy();
    expect(audioProfile.profileId).toBeTruthy();
    expect(storageProfile.profileId).toBeTruthy();
  });

  it("covers 20級から20段まで without duplicates", () => {
    const labels = gradeProfile.grades.map((grade) => grade.label);
    expect(labels).toHaveLength(40);
    expect(new Set(labels).size).toBe(40);
    expect(labels[0]).toBe("20級");
    expect(labels.at(-1)).toBe("20段");
    expect(labels).toContain("初段");
  });

  it("keeps 18級〜20級 as image-only practice", () => {
    const imageGrades = gradeProfile.grades.filter((grade) => ["18級", "19級", "20級"].includes(grade.label));
    for (const grade of imageGrades) {
      expect(grade.mode).toBe("image");
      expect(grade.supportedPracticeModes).toEqual(["input", "display"]);
      if (grade.label === "20級") {
        expect(grade.officialTimeSec).toBe(5);
        expect(grade.hardTimeSec).toBe(5);
      } else {
        expect(grade.officialTimeSec).toBeNull();
      }
    }
  });

  it("marks 20段 as compatibility-gated high speed profile", () => {
    const top = gradeProfile.grades.find((grade) => grade.label === "20段");
    expect(top).toBeTruthy();
    expect(top.compatibilityRequired).toBe(true);
    expect(top.generatorFamily).toBe("highSpeedStable");
    expect(top.recommendationEligible).toBe("verified-only");
    expect(top.defaultPracticeMode).toBe("exam-like");
  });

  it("keeps timed grades on timed mode with time settings", () => {
    const timedGrades = gradeProfile.grades.filter((grade) => grade.mode === "timed");
    for (const grade of timedGrades) {
      expect(typeof grade.officialTimeSec).toBe("number");
      expect(typeof grade.hardTimeSec).toBe("number");
    }
  });

  it("defines required practice modes and platform classes", () => {
    expect(Object.keys(practiceModeProfile.modes)).toEqual(["display", "input", "exam-like"]);
    expect(Object.keys(platformProfile.classes)).toEqual([
      "desktop-chromium",
      "desktop-safari-firefox",
      "mobile-web"
    ]);
  });

  it("defines recommendation and timing contracts", () => {
    expect(resultPolicyProfile.practiceClassification.compatible20).toBe("参考練習");
    expect(timingProfile.image.previewMs).toBe(2500);
    expect(timingProfile.strict20.maxPhaseDriftMs).toBe(10);
    expect(timingProfile.strict20.longFrameMs).toBe(18);
    expect(generatorProfile.families.highSpeedStable).toBeTruthy();
  });
});
