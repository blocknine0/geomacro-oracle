import fs from "fs/promises";

const FILE =
  "data/state/history.json";

export async function saveRisk(
  risk: number
) {
  let history: any[] = [];

  try {
    const raw =
      await fs.readFile(
        FILE,
        "utf8"
      );

    history =
      JSON.parse(
        raw.replace(/^\uFEFF/, "")
      );
  } catch {}

  history.push({
    timestamp: Date.now(),
    risk
  });

  history =
    history.slice(-100);

  await fs.writeFile(
    FILE,
    JSON.stringify(
      history,
      null,
      2
    )
  );
}

export async function getTrend() {

  try {

    const raw =
      await fs.readFile(
        FILE,
        "utf8"
      );

    const history =
      JSON.parse(
        raw.replace(/^\uFEFF/, "")
      );

    if (
      history.length < 2
    ) {
      return {
        trend: "unknown",
        change: 0
      };
    }

    const current =
      history[
        history.length - 1
      ].risk;

    const previous =
      history[
        history.length - 2
      ].risk;

    const change =
      current - previous;

    return {
      trend:
        change > 0
          ? "rising"
          : change < 0
          ? "falling"
          : "stable",

      change
    };

  } catch {

    return {
      trend: "unknown",
      change: 0
    };
  }
}