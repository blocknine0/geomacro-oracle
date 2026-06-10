export function detectNarrative(
  headline: string
) {
  const h =
    headline.toLowerCase();

  if (
    h.includes("iran") &&
    h.includes("israel")
  ) {
    return {
      narrative:
        "Iran-Israel Escalation",

      escalationBonus: 15
    };
  }

  if (
    h.includes("iran") &&
    (
      h.includes("us") ||
      h.includes("american")
    )
  ) {
    return {
      narrative:
        "US-Iran Military Escalation",

      escalationBonus: 30
    };
  }

  if (
    h.includes("hormuz")
  ) {
    return {
      narrative:
        "Strait of Hormuz Risk",

      escalationBonus: 35
    };
  }

  if (
    h.includes("sanction")
  ) {
    return {
      narrative:
        "Sanctions Escalation",

      escalationBonus: 20
    };
  }

  if (
    h.includes("oil") ||
    h.includes("energy")
  ) {
    return {
      narrative:
        "Energy Shock Risk",

      escalationBonus: 25
    };
  }

  return {
    narrative:
      "General",

    escalationBonus: 0
  };
}