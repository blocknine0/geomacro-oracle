export function buildMarkets(
  risk: any,
  forecast: any
) {

  const markets = [];

  if (
    forecast.narrative ===
    "US-Iran Military Escalation"
  ) {
    markets.push({
      market:
        "Will US-Iran conflict escalate within 30 days?",

      probability:
        forecast.escalationProbability,

      confidence:
        risk.confidence,

      state:
        forecast.stage,

      resolutionDate:
        "2026-07-01"
    });
  }

  if (
    forecast.narrative ===
    "Iran-Israel Escalation"
  ) {
    markets.push({
      market:
        "Will Iran-Israel conflict intensify within 30 days?",

      probability:
        forecast.escalationProbability,

      confidence:
        risk.confidence,

      state:
        forecast.stage,

      resolutionDate:
        "2026-07-01"
    });
  }

  if (
    forecast.narrative ===
    "Strait of Hormuz Risk"
  ) {
    markets.push({
      market:
        "Will Hormuz shipping face disruption within 30 days?",

      probability:
        forecast.escalationProbability,

      confidence:
        risk.confidence,

      state:
        forecast.stage,

      resolutionDate:
        "2026-07-01"
    });
  }

  markets.push({
    market:
      "Will new sanctions be announced within 30 days?",

    probability:
      forecast.sanctionsProbability,

    confidence:
      risk.confidence,

    state:
      forecast.stage,

    resolutionDate:
      "2026-07-01"
  });

  return markets;
}