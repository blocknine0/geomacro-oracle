export function detectNarrative(
  headline: string
) {

  const text =
    headline.toLowerCase();

  if (
    text.includes("iran") &&
    text.includes("israel")
  ) {

    return {
      narrative:
        "Iran-Israel Escalation",

      escalationBonus: 35
    };
  }

  if (
    text.includes("china") &&
    text.includes("taiwan")
  ) {

    return {
      narrative:
        "Taiwan Strait Tension",

      escalationBonus: 30
    };
  }

  if (
    text.includes("russia") ||
    text.includes("ukraine")
  ) {

    return {
      narrative:
        "Russia-Ukraine War",

      escalationBonus: 25
    };
  }

  return {
    narrative: "General",
    escalationBonus: 0
  };
}