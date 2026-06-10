import fs from "fs/promises";

const FILE =
  "data/forecasts/predictions.json";

export async function savePrediction(
  prediction: any
) {

  let predictions: any[] = [];

  try {

    predictions =
      JSON.parse(
        await fs.readFile(
          FILE,
          "utf8"
        )
      );

  } catch {}

  predictions.unshift(
    prediction
  );

  await fs.writeFile(
    FILE,
    JSON.stringify(
      predictions,
      null,
      2
    )
  );
}

export async function getAccuracy() {

  try {

    const predictions =
      JSON.parse(
        await fs.readFile(
          FILE,
          "utf8"
        )
      );

    const resolved =
      predictions.filter(
        (p: any) =>
          p.correct !== undefined
      );

    const correct =
      resolved.filter(
        (p: any) =>
          p.correct
      ).length;

    return {

      total:
        resolved.length,

      correct,

      accuracy:
        resolved.length
          ? Math.round(
              (correct /
                resolved.length) *
                100
            )
          : 0
    };

  } catch {

    return {
      total: 0,
      correct: 0,
      accuracy: 0
    };
  }
}