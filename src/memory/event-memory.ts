import fs from "fs/promises";

const FILE =
  "data/memory/events.json";

export async function saveEvent(
  event: any
) {

  console.log(
    "Saving Event:",
    event.headline
  );

  let events: any[] = [];

  try {

    const raw =
      await fs.readFile(
        FILE,
        "utf8"
      );

    events =
      JSON.parse(raw);

  } catch {

    events = [];
  }

  events.unshift(event);

  await fs.writeFile(
    FILE,
    JSON.stringify(
      events,
      null,
      2
    )
  );
}

export async function getRecentEvents() {

  try {

    const raw =
      await fs.readFile(
        FILE,
        "utf8"
      );

    return JSON.parse(raw);

  } catch {

    return [];
  }
}