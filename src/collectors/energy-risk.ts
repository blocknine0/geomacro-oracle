export function getEnergyRisk(
  articles: any[]
): number {

  let score = 0;

  for (const item of articles) {

    const text =
      (item.title ?? "")
        .toLowerCase();

    if (
      text.includes("oil") ||
      text.includes("gas") ||
      text.includes("lng") ||
      text.includes("opec") ||
      text.includes("pipeline")
    ) {
      score += 5;
    }
  }

  return Math.min(
    100,
    score
  );
}