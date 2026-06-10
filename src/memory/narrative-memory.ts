import fs from "fs";

export function getNarrativeMomentum(
  narrative: string
) {
  try {

    const raw =
      fs.readFileSync(
        "data/memory/events.json",
        "utf-8"
      );

    const events =
      JSON.parse(raw);

    const matching =
      events.filter(
        (e: any) =>
          e.narrative ===
          narrative
      );

    return matching.length;

  } catch {

    return 0;
  }
}