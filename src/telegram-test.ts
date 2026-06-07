import "dotenv/config";

import { generateGlobalRisk } from "./signals/global-risk.js";
import { sendTelegramAlert } from "./alerts/telegram.js";

async function main() {
  const risk = await generateGlobalRisk();

  console.log(
    JSON.stringify(risk, null, 2)
  );

  if (risk.globalRisk >= 60) {
    await sendTelegramAlert(
`🚨 GeoMacro Oracle Alert

Global Risk: ${risk.globalRisk}

Rare Earth: ${risk.rareEarthRisk}
Energy: ${risk.energyRisk}
Shipping: ${risk.shippingRisk}
Sanctions: ${risk.sanctionsRisk}

Agent ID: ${risk.agentId}`
    );

    console.log("Alert Triggered");
  } else {
    console.log("Risk Below Threshold");
  }
}

main().catch(console.error);