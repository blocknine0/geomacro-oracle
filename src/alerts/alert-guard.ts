import fs from "fs/promises";

export async function shouldSendAlert(
  currentRisk: number,
  currentHeadline: string
): Promise<boolean> {

  const raw = await fs.readFile(
  "data/state/last-alert.json",
  "utf-8"
);

const state = JSON.parse(
  raw.replace(/^\uFEFF/, "")
);

  const lastRisk = state.lastRisk ?? 0;
  const lastHeadline =
  state.lastHeadline ?? "";

  const diff =
  Math.abs(currentRisk - lastRisk);
  const headlineChanged =
  currentHeadline !== lastHeadline;

console.log(
  `HeadlineChanged=${headlineChanged}`
);
console.log(
  `Current=${currentRisk}, Last=${lastRisk}, Diff=${diff}`
);

if (currentRisk < 75) {
  console.log(
    "Blocked: Risk below threshold"
  );
}

if (
  diff < 5 &&
  !headlineChanged
) {
  console.log(
    "Blocked: Change too small"
  );
}

if (
  currentRisk >= 75 &&
  (
    diff >= 5 ||
    headlineChanged
  )
) {
    await fs.writeFile(
  "data/state/last-alert.json",
  JSON.stringify(
    {
      lastRisk: currentRisk,
      lastHeadline: currentHeadline
    },
    null,
    2
  )
);

    return true;
  }

  return false;
}