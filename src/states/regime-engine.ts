export function detectRegime(
  risk: number,
  momentum: number
) {

  if (
    risk >= 80 ||
    momentum >= 5
  ) {
    return "Active Conflict";
  }

  if (
    risk >= 65 ||
    momentum >= 3
  ) {
    return "Escalation";
  }

  if (
    risk >= 45
  ) {
    return "Tension Build-Up";
  }

  return "Observation";
}