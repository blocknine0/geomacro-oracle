export function buildMarkets(
  risk: any,
  forecast: any
) {

  const markets: any[] = [];

  // US-Iran

  if (
    forecast.narrative ===
    "US-Iran Military Escalation"
  ) {

    markets.push({
      id: "USIRAN-30D",
      market:
        "Will US-Iran conflict escalate within 30 days?",
      probability:
        forecast.escalationProbability,
      confidence:
        risk.confidence,
      state:
        forecast.stage,
      resolutionDate:
        "2026-07-01",
      category:
        "Military"
    });

  }

  // Iran-Israel

  if (
    forecast.narrative ===
    "Iran-Israel Escalation"
  ) {

    markets.push({
      id: "IRANISR-30D",
      market:
        "Will Iran-Israel conflict intensify within 30 days?",
      probability:
        forecast.escalationProbability,
      confidence:
        risk.confidence,
      state:
        forecast.stage,
      resolutionDate:
        "2026-07-01",
      category:
        "Military"
    });

  }

  // Israel-Lebanon

  if (
    forecast.narrative ===
    "Israel-Lebanon Conflict"
  ) {

    markets.push({
      id: "LEBANON-30D",
      market:
        "Will Israel-Lebanon conflict escalate within 30 days?",
      probability:
        forecast.escalationProbability,
      confidence:
        risk.confidence,
      state:
        forecast.stage,
      resolutionDate:
        "2026-07-01",
      category:
        "Military"
    });

  }

  // Gaza

  if (
    forecast.narrative ===
    "Gaza Conflict"
  ) {

    markets.push({
      id: "GAZA-30D",
      market:
        "Will Gaza conflict intensify within 30 days?",
      probability:
        forecast.escalationProbability,
      confidence:
        risk.confidence,
      state:
        forecast.stage,
      resolutionDate:
        "2026-07-01",
      category:
        "Military"
    });

  }

  // Hormuz

  if (
    forecast.narrative ===
    "Strait of Hormuz Risk"
  ) {

    markets.push({
      id: "HORMUZ-30D",
      market:
        "Will Hormuz shipping face disruption within 30 days?",
      probability:
        forecast.shippingProbability,
      confidence:
        risk.confidence,
      state:
        forecast.stage,
      resolutionDate:
        "2026-07-01",
      category:
        "Shipping"
    });

  }

  // Sanctions

  markets.push({
    id: "SANCTIONS-30D",
    market:
      "Will new sanctions be announced within 30 days?",
    probability:
      forecast.sanctionsProbability,
    confidence:
      risk.confidence,
    state:
      forecast.stage,
    resolutionDate:
      "2026-07-01",
    category:
      "Sanctions"
  });

  return markets;

}