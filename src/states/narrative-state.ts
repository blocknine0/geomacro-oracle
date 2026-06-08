export function detectNarrativeState(
  headline: string
) {

  const text =
    headline.toLowerCase();

  if (
    text.includes("ceasefire")
  ) {

    return {
      stage:
        "Fragile Ceasefire",

      escalationBonus: 15
    };
  }

  if (
    text.includes("missile")
  ) {

    return {
      stage:
        "Direct Military Exchange",

      escalationBonus: 30
    };
  }

  if (
    text.includes("strike")
  ) {

    return {
      stage:
        "Retaliatory Strike",

      escalationBonus: 25
    };
  }

  return {
    stage:
      "Observation",

    escalationBonus: 0
  };
}