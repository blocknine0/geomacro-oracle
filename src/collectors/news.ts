import { getLatestEvent } from "./events.js";

export async function getNewsContext() {
  const event = await getLatestEvent();

  return {
    headline: event.headline,
    source: event.source,
    reason: `Event category: ${event.category}`,
    confidence: 85,
    severity: event.severity
  };
}