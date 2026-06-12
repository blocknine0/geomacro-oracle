import fs from "fs/promises";

export async function getRareEarthRisk(
  articles: any[]
): Promise<number> {

  let score = 0;

  const keywords = [

    "rare earth",
    "rare-earth",

    "critical minerals",

    "rare earth exports",

    "mineral exports",

    "strategic minerals",

    "lithium",

    "graphite",

    "gallium",

    "germanium",

    "cobalt",

    "nickel",

    "export controls",

    "export restrictions",

    "supply chain",

    "critical materials",

    "mining disruption",

    "resource nationalism",

    "china minerals",

    "rare earth supply"
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
        score += 6;
      }
    }
  }

  let manualRisk = 0;

  try {

    const raw =
      await fs.readFile(
        "data/risk.json",
        "utf8"
      );

    const risk =
      JSON.parse(raw);

    manualRisk =
      risk.rareEarthRisk || 0;

  } catch {}

  return Math.max(
    manualRisk,
    Math.min(100, score)
  );
}