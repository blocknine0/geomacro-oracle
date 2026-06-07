import { getRareEarthRisk } from "../collectors/rare-earth.js";
import { getLiveNews } from "../collectors/live-news.js";

import { getEnergyRisk }
from "../collectors/energy-risk.js";

import { getShippingRisk }
from "../collectors/shipping-risk.js";

import { getSanctionsRisk }
from "../collectors/sanctions-risk.js";

import { scoreHeadline }
from "../scoring/headline-score.js";

export async function generateGlobalRisk() {

  const rareEarthRisk =
    await getRareEarthRisk();

  const articles =
    await getLiveNews();

  const energyRisk =
    getEnergyRisk(articles);

  const shippingRisk =
    getShippingRisk(articles);

  const sanctionsRisk =
    getSanctionsRisk(articles);

  let bestHeadline =
    "No major event";

  let bestScore = 0;

  let bestCategory =
    "general";

  let bestTags: string[] = [];

  const scoredEvents: any[] = [];

  for (const item of articles) {

    const result =
      scoreHeadline(
        item.title ?? ""
      );

    scoredEvents.push({
      headline:
        item.title ?? "",

      score:
        result.score,

      category:
        result.category,

      tags:
        result.tags
    });

    if (
      result.score >
      bestScore
    ) {

      bestScore =
        result.score;

      bestHeadline =
        item.title ?? "";

      bestCategory =
        result.category;

      bestTags =
        result.tags;
    }
  }

  const topEvents =
    scoredEvents
      .filter(
        e => e.score > 0
      )
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, 3);

console.log(
  "Energy:",
  energyRisk
);

console.log(
  "Shipping:",
  shippingRisk
);

console.log(
  "Sanctions:",
  sanctionsRisk
);

  const globalRisk =
    Math.min(
      100,
      Math.round(
        (
          rareEarthRisk +
          energyRisk +
          shippingRisk +
          sanctionsRisk
        ) / 4
      ) + bestScore
    );

  return {

    agentId: 39369,

    timestamp:
      Date.now(),

    rareEarthRisk,

    energyRisk,

    shippingRisk,

    sanctionsRisk,

    globalRisk,

    headline:
      bestHeadline,

    source:
      "BBC RSS",

    reason:
      bestCategory,

    confidence:
      80 +
      Math.min(
        bestScore,
        20
      ),

    tags:
      bestTags,

    topEvents
  };
}