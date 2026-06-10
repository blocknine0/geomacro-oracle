export function buildEventChain(
  headline: string
) {

  const h =
    headline.toLowerCase();

  if (
    h.includes("iran") &&
    h.includes("hormuz")
  ) {
    return [
      "US-Iran Tensions",
      "Hormuz Incident",
      "Military Retaliation",
      "Shipping Disruption Risk",
      "Energy Market Shock",
      "Global Inflation Pressure"
    ];
  }

  if (
    h.includes("sanction")
  ) {
    return [
      "Sanctions",
      "Trade Restrictions",
      "Supply Chain Stress",
      "Commodity Inflation"
    ];
  }

  return [
    "Event Detected",
    "Monitoring"
  ];
}