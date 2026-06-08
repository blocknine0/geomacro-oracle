export function getShippingDisruptionProbability(
  shippingRisk: number
) {

  return Math.min(
    95,
    shippingRisk + 15
  );
}