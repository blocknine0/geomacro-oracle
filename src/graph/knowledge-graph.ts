export function buildKnowledgeGraph(
  headline: string
) {

  const nodes: string[] = [];
  const impacts: string[] = [];

  const text =
    headline.toLowerCase();

  if (
    text.includes("iran")
  ) {
    nodes.push(
      "Iran",
      "Hormuz",
      "Oil Markets"
    );

    impacts.push(
      "Shipping",
      "Energy",
      "Inflation"
    );
  }

  if (
    text.includes("israel")
  ) {
    nodes.push(
      "Israel",
      "Lebanon",
      "Middle East"
    );

    impacts.push(
      "Regional Security"
    );
  }

  if (
    text.includes("china")
  ) {
    nodes.push(
      "China",
      "Taiwan",
      "Semiconductors"
    );

    impacts.push(
      "Supply Chains"
    );
  }

  if (
    text.includes("russia")
  ) {
    nodes.push(
      "Russia",
      "Europe",
      "Energy"
    );

    impacts.push(
      "Natural Gas",
      "Inflation"
    );
  }

  return {
    nodes: [...new Set(nodes)],
    impacts: [...new Set(impacts)]
  };
}