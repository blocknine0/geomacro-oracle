export function buildScenario(
  forecast: any
) {

  if (
    forecast.escalationProbability >= 85
  ) {
    return {
      scenario:
        "High Escalation",

      expectedOutcome:
        "Military confrontation likely",

      confidence:
        forecast.escalationProbability
    };
  }

  if (
    forecast.escalationProbability >= 60
  ) {
    return {
      scenario:
        "Contained Escalation",

      expectedOutcome:
        "Limited conflict expected",

      confidence:
        forecast.escalationProbability
    };
  }

  return {
    scenario:
      "Stable",

    expectedOutcome:
      "No major escalation expected",

    confidence:
      forecast.escalationProbability
  };
}