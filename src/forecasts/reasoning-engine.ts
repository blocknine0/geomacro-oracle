export function buildReasoning(
  risk: any,
  forecast: any
) {

  const reasons: string[] = [];

  if (
    risk.globalRisk >= 70
  ) {
    reasons.push(
      "Global risk above critical threshold"
    );
  }

  if (
    risk.headline
      .toLowerCase()
      .includes("iran")
  ) {
    reasons.push(
      "Iran-related escalation detected"
    );
  }

  if (
    risk.headline
      .toLowerCase()
      .includes("hormuz")
  ) {
    reasons.push(
      "Hormuz chokepoint risk active"
    );
  }

  if (
    forecast.stage ===
    "Active Conflict"
  ) {
    reasons.push(
      "Conflict stage elevated"
    );
  }

  return reasons;
}