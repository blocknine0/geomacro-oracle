export function detectNarrative(
  headline: string
) {

  const h =
    headline.toLowerCase();

  // US-Iran

  if (
    h.includes("iran") &&
    (
      h.includes("us") ||
      h.includes("american") ||
      h.includes("trump")
    )
  ) {

    return {
      narrative:
        "US-Iran Military Escalation",

      escalationBonus: 30
    };
  }

  // Iran-Israel

  if (
    h.includes("iran") &&
    h.includes("israel")
  ) {

    return {
      narrative:
        "Iran-Israel Escalation",

      escalationBonus: 25
    };
  }

  // Israel-Lebanon

  if (
    h.includes("lebanon") ||
    h.includes("hezbollah")
  ) {

    return {
      narrative:
        "Israel-Lebanon Conflict",

      escalationBonus: 20
    };
  }

  // Gaza

  if (
    h.includes("gaza") ||
    h.includes("hamas")
  ) {

    return {
      narrative:
        "Gaza Conflict",

      escalationBonus: 15
    };
  }

  // Hormuz

  if (
    h.includes("hormuz") ||
    h.includes("strait of hormuz")
  ) {

    return {
      narrative:
        "Strait of Hormuz Risk",

      escalationBonus: 35
    };
  }

  // Shipping

  if (
    h.includes("red sea") ||
    h.includes("shipping") ||
    h.includes("container")
  ) {

    return {
      narrative:
        "Global Shipping Disruption",

      escalationBonus: 20
    };
  }

  // Energy

  if (
    h.includes("oil") ||
    h.includes("energy") ||
    h.includes("gas") ||
    h.includes("lng")
  ) {

    return {
      narrative:
        "Energy Shock Risk",

      escalationBonus: 25
    };
  }

  // Sanctions

  if (
    h.includes("sanction") ||
    h.includes("tariff") ||
    h.includes("export ban")
  ) {

    return {
      narrative:
        "Sanctions Escalation",

      escalationBonus: 20
    };
  }

  // Ukraine

  if (
    h.includes("ukraine") ||
    h.includes("russia")
  ) {

    return {
      narrative:
        "Russia-Ukraine Conflict",

      escalationBonus: 20
    };
  }

  // China

  if (
    h.includes("china") &&
    (
      h.includes("taiwan") ||
      h.includes("south china sea")
    )
  ) {

    return {
      narrative:
        "China-Taiwan Tension",

      escalationBonus: 25
    };
  }

  return {

    narrative:
      "General",

    escalationBonus: 0
  };
}