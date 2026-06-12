export function detectNarrative(
  text: string
) {

  const h =
    text.toLowerCase();

  let iran = 0;
  let israel = 0;
  let us = 0;
  let lebanon = 0;
  let hormuz = 0;

  if (h.includes("iran")) iran++;
  if (h.includes("israel")) israel++;
  if (h.includes("us")) us++;
  if (h.includes("american")) us++;
  if (h.includes("lebanon")) lebanon++;
  if (h.includes("hormuz")) hormuz++;

  if (
    iran &&
    us &&
    israel
  ) {
    return {
      narrative:
        "US-Iran-Israel Escalation",
      escalationBonus: 40
    };
  }

  if (
    iran &&
    us
  ) {
    return {
      narrative:
        "US-Iran Military Escalation",
      escalationBonus: 30
    };
  }

  if (
    iran &&
    israel
  ) {
    return {
      narrative:
        "Iran-Israel Escalation",
      escalationBonus: 25
    };
  }

  if (
    israel &&
    lebanon
  ) {
    return {
      narrative:
        "Israel-Lebanon Conflict",
      escalationBonus: 20
    };
  }

  if (
    hormuz
  ) {
    return {
      narrative:
        "Strait of Hormuz Risk",
      escalationBonus: 35
    };
  }

  return {
    narrative:
      "General",
    escalationBonus: 0
  };
}