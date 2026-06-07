export function getShippingRisk(
  articles: any[]
): number {

  let score = 0;

  for (const item of articles) {

    const text =
      (item.title ?? "")
        .toLowerCase();

    if (
      text.includes("shipping") ||
      text.includes("red sea") ||
      text.includes("suez") ||
      text.includes("strait") ||
      text.includes("container")
    ) {
      score += 10;
    }
  }

  return Math.min(
    100,
    score
  );
}