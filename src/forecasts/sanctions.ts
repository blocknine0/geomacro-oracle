export function getSanctionsProbability(
  sanctionsRisk: number
) {

  return Math.min(
    95,
    sanctionsRisk + 20
  );
}