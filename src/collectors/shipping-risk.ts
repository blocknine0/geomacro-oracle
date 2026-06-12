export function getShippingRisk(
  articles: any[]
): number {

  let score = 0;

  const keywords = [

    "shipping",
    "ship",
    "vessel",
    "cargo",
    "container",
    "freight",
    "logistics",

    "red sea",
    "suez",
    "hormuz",
    "strait of hormuz",
    "bab el mandeb",

    "tanker",
    "oil tanker",
    "maritime",

    "port",
    "harbor",

    "blockade",
    "disruption"
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