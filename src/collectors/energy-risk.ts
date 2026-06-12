export function getEnergyRisk(
  articles: any[]
): number {

  let score = 0;

  const keywords = [

    "oil",
    "crude",
    "brent",
    "gas",
    "natural gas",
    "lng",
    "fuel",
    "diesel",
    "petroleum",
    "energy",
    "energy market",
    "refinery",
    "opec",
    "pipeline",
    "tanker"
  ];

  for (const item of articles) {

    const text =
      `${item.title ?? ""} ${
        item.description ?? ""
      }`
      .toLowerCase();

    for (const word of keywords) {

      if (
        text.includes(word)
      ) {

        score += 5;
      }
    }
  }

  return Math.min(
    100,
    score
  );
}