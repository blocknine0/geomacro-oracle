import fs from "fs/promises";

const FILE =
  "data/arc-events.json";

export async function publishArcEvent(
  event: any
) {

  let events: any[] = [];

  try {

    const raw =
      await fs.readFile(
        FILE,
        "utf8"
      );

    events =
      JSON.parse(
        raw.replace(/^\uFEFF/, "")
      );

  } catch {

    events = [];
  }

  events.unshift(event);

  events =
    events.slice(0, 100);

  await fs.writeFile(
    FILE,
    JSON.stringify(
      events,
      null,
      2
    )
  );

  console.log(
    `ARC Event Published (${events.length})`
  );

  return event;
}