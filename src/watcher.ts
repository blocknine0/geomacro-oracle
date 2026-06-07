import "dotenv/config";

import { publishArcEvent }
from "./arc/publish.js";
import { generateGlobalRisk } from "./signals/global-risk.js";
import { sendTelegramAlert } from "./alerts/telegram.js";
import { shouldSendAlert } from "./alerts/alert-guard.js";

async function runCycle() {
  try {
    const risk = await generateGlobalRisk();

    console.log(
      `[${new Date().toISOString()}]`,
      JSON.stringify(risk)
    );

    if (
  await shouldSendAlert(
  risk.globalRisk,
  risk.headline
)
) {
      
  await publishArcEvent({
  agentId: risk.agentId,
  timestamp: risk.timestamp,
  risk: risk.globalRisk,
  headline: risk.headline,
  category: risk.reason,
  confidence: risk.confidence,
  tags: risk.tags
});

 await sendTelegramAlert(
`[ALERT] GeoMacro Oracle

Global Risk: ${risk.globalRisk}

Headline:
${risk.headline}

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

      console.log("Alert Sent");
    } else {
      console.log("No Alert");
    }
  } catch (err) {
    console.error(err);
  }
}

async function main() {
  console.log(
    "GeoMacro Oracle Watcher Started"
  );

  await runCycle();

  setInterval(
    runCycle,
    15 * 60 * 1000
  ); // 15 minutes
}

main();