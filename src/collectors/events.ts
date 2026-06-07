import fs from "fs/promises";

export async function getLatestEvent() {
  const raw = await fs.readFile(
    "data/events.json",
    "utf-8"
  );

  const events = JSON.parse(raw);

  return events[0];
}