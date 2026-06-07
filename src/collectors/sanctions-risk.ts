export function getSanctionsRisk(
  articles: any[]
): number {

  let score = 0;

  for (const item of articles) {

    const text =
      (item.title ?? "")
        .toLowerCase();

    if (
      text.includes("sanction") ||
      text.includes("tariff") ||
      text.includes("trade war") ||
      text.includes("export ban")
    ) {
      score += 15;
    }
  }

  return Math.min(
    100,
    score
  );
}