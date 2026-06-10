import "dotenv/config";
import {
  publishArcEvent
} from "./arc/publish.js";
import { generateGlobalRisk } from "./signals/global-risk.js";
import { sendTelegramAlert } from "./alerts/telegram.js";
import { shouldSendAlert } from "./alerts/alert-guard.js";
import {
  buildReasoning
}
from "./forecasts/reasoning-engine.js";
import {
  savePrediction,
  getAccuracy
}
from "./forecasts/accuracy-engine.js";
import {
  buildKnowledgeGraph
}
from "./graph/knowledge-graph.js";
import {
  buildEventChain
}
from "./chains/event-chain.js";
import {
  buildScenario
}
from "./forecasts/scenario-engine.js";
import {
  buildMarkets
}
from "./markets/market-builder.js";
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

await savePrediction({

  timestamp:
    risk.timestamp,

  headline:
    risk.headline,

  narrative:
    forecast.narrative,

  probability:
    forecast.escalationProbability,

  stage:
    forecast.stage
});

const graph =
  buildKnowledgeGraph(
    risk.headline
  );

console.log(
  "Knowledge Graph:",
  graph
);

const scenario =
  buildScenario(
    forecast
  );

const reasoning =
  buildReasoning(
    risk,
    forecast
  );

console.log(
  "Reasoning:",
  reasoning
);

const accuracy =
  await getAccuracy();

console.log(
  "Accuracy:",
  accuracy
);

const chain =
  buildEventChain(
    risk.headline
  );

console.log(
  "Event Chain:",
  chain
);

console.log(
  "Scenario:",
  scenario
);

const markets =
  buildMarkets(
    risk,
    forecast
  );

console.log(
  "Forecast:",
  forecast
);

console.log(
  "Markets:",
  JSON.stringify(
    markets,
    null,
    2
  )
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

forecast,
scenario,
graph,
accuracy,
reasoning
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

Forecast Narrative:
${forecast.narrative}

Forecast Stage:
${forecast.stage}

Escalation Probability:
${forecast.escalationProbability}%

Scenario:
${scenario.scenario}

Expected Outcome:
${scenario.expectedOutcome}

Scenario Confidence:
${scenario.confidence}%

Reasoning:

${reasoning.join("\n")}

Forecast Accuracy:
${accuracy.accuracy}%

Resolved Forecasts:
${accuracy.total}

Knowledge Nodes:
${graph.nodes.join(", ")}

Second Order Effects:
${graph.impacts.join(", ")}

Event Chain:

${chain.join(" -> ")}

Prediction Markets:

${markets
  .map(
    m =>
`${m.market}
Probability: ${m.probability}%`
  )
  .join("\n\n")}

Agent ID: ${risk.agentId}`
);


   console.log("Alert Triggered");
  } else {
  console.log("No Alert");
}
}

main().catch(console.error);