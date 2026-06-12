import {
  getEscalationProbability
}
from "./escalation.js";

import {
  detectRegime
}
from "../states/regime-engine.js";

import {
  getSanctionsProbability
}
from "./sanctions.js";

import {
  detectNarrativeState
}
from "../states/narrative-state.js";

import {
  getNarrativeMomentum
}
from "../memory/narrative-memory.js";

import {
  getShippingDisruptionProbability
}
from "./shipping.js";

import {
  getEnergyShockProbability
}
from "./energy.js";

import {
  detectNarrative
}
from "./narrative-engine.js";

export function buildForecast(
  risk: any
) {

const narrativeText =
  risk.topEvents
    .map(
      (e: any) =>
        e.headline
    )
    .join(" ");

const state =
  detectNarrativeState(
    narrativeText
  );

const narrative =
  detectNarrative(
    narrativeText
  );

const momentum =
  getNarrativeMomentum(
    narrative.narrative
  );

const regime =
  detectRegime(
    risk.globalRisk,
    momentum
  );

console.log(
  "Narrative Momentum:",
  momentum
);

  return {

  narrative:
    narrative.narrative,

  stage:
  state.stage,

  regime:
    regime,

  escalationProbability:

Math.min(
  95,

  getEscalationProbability(
  risk.globalRisk
) +

state.escalationBonus +

  Math.floor(
    momentum / 4
  )
),

  sanctionsProbability:

    getSanctionsProbability(
      risk.sanctionsRisk
    ),

  shippingProbability:

    getShippingDisruptionProbability(
      risk.shippingRisk
    ),

  energyShockProbability:

    getEnergyShockProbability(
      risk.energyRisk
    )
};
}