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

const state =
  detectNarrativeState(
    risk.headline
  );

  const narrative =
    detectNarrative(
      risk.headline
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
  regime,

  escalationProbability:

  Math.min(
    95,

    getEscalationProbability(
      risk.globalRisk
    ) +

    narrative.escalationBonus +

    state.escalationBonus +

    (momentum * 3)
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