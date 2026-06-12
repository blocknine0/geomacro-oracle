export function getSanctionsRisk(
  articles: any[]
): number {

  let score = 0;

  const keywords = [

    "sanction",
    "sanctions",

    "tariff",
    "trade war",

    "export ban",
    "export restrictions",

    "secondary sanctions",

    "embargo",

    "blacklist",

    "asset freeze",

    "price cap",

    "economic restrictions",

    "trade restrictions",

    "export controls",

    "technology restrictions",

    "financial restrictions",

    "swift",

    "frozen assets"
  ];

  for (const item of articles) {

    const text =
      `${item.title ?? ""} ${
        item.description ?? ""
      }`
      .toLowerCase();

    for (const keyword of keywords) {

      if (
        text.includes(keyword)
      ) {

        score += 8;
      }
    }
  }

  return Math.min(
    100,
    score
  );
}