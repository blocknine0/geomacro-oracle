import fs from "fs/promises";

export async function resolveForecasts() {

  console.log(
    "Resolving forecasts..."
  );

  try {

    const raw =
      await fs.readFile(
        "data/forecasts/predictions.json",
        "utf8"
      );

    const forecasts =
      JSON.parse(raw);

    const now =
      Date.now();

    let updated = false;

    for (const forecast of forecasts) {

      if (
        !forecast.resolved &&
        forecast.timestamp <
        now - 86400000
      ) {

        forecast.resolved = true;

        forecast.correct =
          forecast.probability >= 50;

        updated = true;
      }
    }

    if (updated) {

      await fs.writeFile(
        "data/forecasts/predictions.json",
        JSON.stringify(
          forecasts,
          null,
          2
        )
      );
    }

  } catch {

    console.log(
      "No forecasts yet"
    );
  }
}