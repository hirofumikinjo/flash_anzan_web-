export function isRecommendationEligible({ grade, practiceMode, compatibilityStatus }) {
  if (!grade) return false;
  if (practiceMode === "display") return false;
  if (grade.recommendationEligible === false) return false;
  if (grade.recommendationEligible === "verified-only") {
    return compatibilityStatus === "Verified";
  }
  return compatibilityStatus !== "Unsupported";
}

export function classifyPracticeSession({ grade, practiceMode, compatibilityStatus }) {
  if (practiceMode === "display") {
    return "参考練習";
  }
  if (grade?.label === "20段" && compatibilityStatus === "Compatible") {
    return "参考練習";
  }
  if (isRecommendationEligible({ grade, practiceMode, compatibilityStatus })) {
    return "公式比較用練習";
  }
  return "自宅練習";
}
