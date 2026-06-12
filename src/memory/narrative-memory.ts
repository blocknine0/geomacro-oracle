import fs from "fs";

export function getNarrativeMomentum(
  narrative: string
) {

  try {

    const raw =
      fs.readFileSync(
        "data/memory/events.json",
        "utf8"
      );

    const events =
      JSON.parse(raw);

    const matching =
      events.filter(
        (e: any) =>
          e.narrative ===
          narrative
      );

    return Math.min(
      100,
      matching.length * 5
    );

  } catch {

    return 0;
  }
}