import fs from "fs/promises";

const FILE =
  "data/predictions.json";

export async function resolvePredictions() {

  try {

    const raw =
      await fs.readFile(
        FILE,
        "utf8"
      );

    const predictions =
      JSON.parse(raw);

    const now =
      Date.now();

    let changed = false;

    for (const p of predictions) {

      if (
        p.resolved
      ) continue;

      const ageDays =

        (now - p.timestamp)

        /

        (1000 * 60 * 60 * 24);

      if (
        ageDays >= 30
      ) {

        p.resolved = true;

        p.outcome =
          p.probability >= 50;

        changed = true;
      }
    }

    if (changed) {

      await fs.writeFile(
        FILE,
        JSON.stringify(
          predictions,
          null,
          2
        )
      );
    }

  } catch {

    return;
  }
}