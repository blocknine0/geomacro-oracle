import "dotenv/config";
import {
  publishArcEvent
} from "./arc/publish.js";
import { generateGlobalRisk } from "./signals/global-risk.js";
import { sendTelegramAlert } from "./alerts/telegram.js";
import { shouldSendAlert } from "./alerts/alert-guard.js";
import {
  saveEvent
}
from "./memory/event-memory.js";
import {
  buildForecast
}
from "./forecasts/forecast-engine.js";
import {
  saveRisk,
  getTrend
} 

from "./history/risk-history.js";


async function main() {
  const risk = await generateGlobalRisk();

await saveRisk(
  risk.globalRisk
);

const forecast =
  buildForecast(risk);

console.log(
  "Forecast:",
  forecast
);

await saveEvent({

  timestamp:
    risk.timestamp,

  headline:
    risk.headline,

  narrative:
    forecast.narrative,

  risk:
    risk.globalRisk
});

console.log(
  "Memory Saved"
);

const trend =
  await getTrend();

await publishArcEvent({
  agentId: risk.agentId,
  timestamp: risk.timestamp,

  risk: risk.globalRisk,

  trend: trend.trend,
  change: trend.change,

  headline: risk.headline,
  category: risk.reason,

  confidence: risk.confidence,

  tags: risk.tags,

  topEvents: risk.topEvents,

  forecast
});

console.log(
  "Trend:",
  trend
);
  console.log(
    JSON.stringify(risk, null, 2)
  );

  if (
  await shouldSendAlert(
  risk.globalRisk,
  risk.headline
)
  ) {

await sendTelegramAlert(
`[ALERT] GeoMacro Oracle

Global Risk: ${risk.globalRisk}
Trend:
${trend.trend}

Change:
${trend.change}

Headline:
${risk.headline}

Top Events:

${risk.topEvents
  .map(
    (e, i) =>
      `${i + 1}. ${e.headline}`
  )
  .join("\n")}

Reason:
${risk.reason}

Source:
${risk.source}

Confidence:
${risk.confidence}%

Drivers:
${risk.tags.join(", ")}

Rare Earth: ${risk.rareEarthRisk}
Energy: ${risk.energyRisk}
Shipping: ${risk.shippingRisk}
Sanctions: ${risk.sanctionsRisk}

Agent ID: ${risk.agentId}`
);


    console.log("Alert Triggered");
  } else {
  console.log("No Alert");
}
}

main().catch(console.error);