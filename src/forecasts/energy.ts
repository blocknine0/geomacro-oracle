export function getEnergyShockProbability(
  energyRisk: number
) {

  return Math.min(
    95,
    energyRisk + 25
  );
}