export function getEscalationProbability(
  risk: number
) {

  if (risk >= 90) return 85;

  if (risk >= 80) return 70;

  if (risk >= 70) return 55;

  if (risk >= 60) return 40;

  return 20;
}