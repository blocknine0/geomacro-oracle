export function buildReasoning(
  risk: any,
  forecast: any
) {

  const reasons: string[] = [];

  if (
    risk.tags?.includes(
      "military_action"
    )
  ) {

    reasons.push(
      "Military escalation detected"
    );
  }

  if (
    risk.shippingRisk > 15
  ) {

    reasons.push(
      "Shipping disruption risk elevated"
    );
  }

  if (
    risk.energyRisk > 5
  ) {

    reasons.push(
      "Energy market stress increasing"
    );
  }

  if (
    forecast.narrative !==
    "General"
  ) {

    reasons.push(
      `Narrative active: ${forecast.narrative}`
    );
  }

  if (
    forecast.escalationProbability >= 60
  ) {

    reasons.push(
      "Escalation probability above threshold"
    );
  }

  return reasons;
}