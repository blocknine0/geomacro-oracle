import fs from "fs/promises";

export async function getRareEarthRisk(): Promise<number> {
  const raw = await fs.readFile(
    "data/risk.json",
    "utf-8"
  );

  const riskData = JSON.parse(raw);

  return riskData.rareEarthRisk;
}