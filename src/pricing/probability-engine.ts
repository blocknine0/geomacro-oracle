export function calculateMarketProbability(
  probability: number
) {
  return {
    yesPrice: probability,
    noPrice: 100 - probability
  };
}