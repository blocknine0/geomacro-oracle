import {
  getEscalationProbability
}
from "./escalation.js";

import {
  getSanctionsProbability
}
from "./sanctions.js";

import {
  detectNarrativeState
}
from "../states/narrative-state.js";

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

  return {

  narrative:
    narrative.narrative,

  stage:
    state.stage,

  escalationProbability:

    Math.min(
      95,

      getEscalationProbability(
        risk.globalRisk
      ) +

      narrative.escalationBonus +

      state.escalationBonus
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