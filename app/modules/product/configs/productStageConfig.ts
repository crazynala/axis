import type { StateConfig } from "~/base/state/StateModel";

export const productStageConfig: StateConfig = {
  states: {
    SETUP: { label: "Setup", color: "gray" },
    LIVE: { label: "Live", color: "green" },
  },
  transitions: {
    SETUP: ["LIVE"],
    LIVE: ["SETUP"],
  },
  transitionMeta: {
    "SETUP->LIVE": {
      title: "Mark product as live?",
      text: "This will switch the product into quiet display mode by default. You can still edit fields via drawers.",
      confirmLabel: "Mark Live",
      cancelLabel: "Cancel",
    },
    "LIVE->SETUP": {
      title: "Move product back to setup?",
      text: "This will switch the product into setup mode (loud editing). Use this when fundamental attributes still need work.",
      confirmLabel: "Move to Setup",
      cancelLabel: "Cancel",
    },
  },
};
