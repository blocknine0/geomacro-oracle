import fs from "fs/promises";

export async function shouldSendAlert(
  currentRisk: number,
  currentHeadline: string
): Promise<boolean> {

  const file =
    "data/state/last-alert.json";

  let state: any = {};

  try {

    const raw =
      await fs.readFile(
        file,
        "utf-8"
      );

    state =
      JSON.parse(
        raw.replace(
          /^\uFEFF/,
          ""
        )
      );

  } catch {

    state = {};
  }

  const lastRisk =
    state.lastRisk ?? 0;

  const lastHeadline =
    state.lastHeadline ?? "";

  const diff =
    Math.abs(
      currentRisk -
      lastRisk
    );

  const headlineChanged =
    currentHeadline !==
    lastHeadline;

  console.log(
    `HeadlineChanged=${headlineChanged}`
  );

  console.log(
    `Current=${currentRisk}, Last=${lastRisk}, Diff=${diff}`
  );

  const shouldAlert =

    (
      currentRisk >= 60
      &&
      (
        diff >= 5 ||
        headlineChanged
      )
    )

    ||

    (
      currentRisk >= 80
    );

  if (!shouldAlert) {

    console.log(
      "Blocked: Alert conditions not met"
    );

    return false;
  }

  await fs.writeFile(
    file,
    JSON.stringify(
      {
        lastRisk:
          currentRisk,

        lastHeadline:
          currentHeadline
      },
      null,
      2
    )
  );

  return true;
}