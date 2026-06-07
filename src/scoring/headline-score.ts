export function scoreHeadline(
  headline: string
) {

  const text =
    headline.toLowerCase();

 let score = 0;
 let category = "general";

const tags: string[] = [];


  // Russia / Ukraine

  if (
  (
    text.includes("russia") ||
    text.includes("ukraine")
  ) &&
  (
    text.includes("attack") ||
    text.includes("strike") ||
    text.includes("drone") ||
    text.includes("missile")
  )
) {
  score += 20;
  category = "war";

  tags.push("war");
}

if (
  (
    text.includes("russia") ||
    text.includes("ukraine") ||
    text.includes("iran") ||
    text.includes("israel") ||
    text.includes("israeli") ||
    text.includes("hezbollah") ||
    text.includes("gulf") ||
    text.includes("lebanon") ||
    text.includes("lebanese")
  ) &&
  (
    text.includes("attack") ||
    text.includes("strike") ||
    text.includes("drone") ||
    text.includes("missile")
  )
) {
  score += 15;

  tags.push("military_action");
}

  // Middle East

  if (
  text.includes("iran") ||
  text.includes("israel") ||
  text.includes("israeli") ||
  text.includes("hezbollah") ||
  text.includes("gulf") ||
  text.includes("lebanon") ||
  text.includes("lebanese")
) {
  score += 20;
  category = "middle_east";

  tags.push("middle_east");
}

  // Rare Earth

  if (
    text.includes("rare earth") ||
    text.includes("critical mineral")
  ) {
    score += 15;
    category = "rare_earth";
  }

  // Sanctions

  if (
    text.includes("sanction")
  ) {
    score += 12;
    category = "sanctions";
  }

  // Shipping

  if (
    text.includes("shipping") ||
    text.includes("red sea")
  ) {
    score += 10;
    category = "shipping";
  }

  // Energy

  if (
    text.includes("oil") ||
    text.includes("gas") ||
    text.includes("lng")
  ) {
    score += 10;
    category = "energy";
  }

  // Strategic Regions

  if (
    text.includes("taiwan") ||
    text.includes("south china sea") ||
    text.includes("hormuz")
  ) {
    score += 25;
    category = "strategic";
  }

  return {
  score,
  category,
  tags
};
}