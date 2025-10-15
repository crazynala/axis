import type { StateConfig } from "./StateModel";

const commonFallbacks = {
  fallbackLabel: (s: string) =>
    s
      ?.toString()
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (m) => m.toUpperCase()) || "Unknown",
  fallbackColor: (_s: string) => "gray",
};

export const purchaseOrderStateConfig: StateConfig = {
  states: {
    DRAFT: { label: "Draft", color: "green" },
    FINAL: { label: "Final", color: "orange" },
    COMPLETE: { label: "Complete", color: "blue" },
    CANCELED: { label: "Canceled", color: "dark" },
  },
  transitions: {
    DRAFT: ["FINAL", "CANCELED"],
    FINAL: ["COMPLETE", "CANCELED"],
    COMPLETE: [],
    CANCELED: [],
  },
  transitionMeta: {
    "DRAFT->FINAL": {
      color: "orange",
      title: "Finalize Purchase Order?",
      text: "Finalizing will lock certain fields and make this PO ready to send to the vendor.",
      confirmLabel: "Finalize",
      cancelLabel: "Keep Draft",
    },
    "FINAL->CANCELED": {
      color: "red",
      title: "Cancel Finalized PO?",
      text: "Canceling a finalized PO will stop further receiving. You can re-open later by setting back to Draft in admin.",
      confirmLabel: "Cancel PO",
      cancelLabel: "Back",
    },
  },
  ...commonFallbacks,
};

export const jobStateConfig: StateConfig = {
  states: {
    DRAFT: { label: "Draft", color: "green" },
    ACTIVE: { label: "Active", color: "blue" },
    COMPLETE: { label: "Complete", color: "teal" },
    CANCELED: { label: "Canceled", color: "dark" },
  },
  transitions: {
    DRAFT: ["ACTIVE", "CANCELED"],
    ACTIVE: ["COMPLETE", "CANCELED"],
    COMPLETE: [],
    CANCELED: [],
  },
  transitionMeta: {
    "ACTIVE->COMPLETE": {
      color: "teal",
      title: "Mark Job Complete?",
      text: "This will signal downstream processes and prevent further edits to assembly steps.",
      confirmLabel: "Complete Job",
      cancelLabel: "Not Yet",
    },
  },
  ...commonFallbacks,
};

export const assemblyStateConfig: StateConfig = {
  states: {
    DRAFT: { label: "Draft", color: "green" },
    WIP: { label: "In Progress", color: "yellow" },
    COMPLETE: { label: "Complete", color: "teal" },
    CANCELED: { label: "Canceled", color: "dark" },
  },
  transitions: {
    DRAFT: ["WIP", "CANCELED"],
    WIP: ["COMPLETE", "CANCELED"],
    COMPLETE: [],
    CANCELED: [],
  },
  transitionMeta: {
    "WIP->COMPLETE": {
      color: "teal",
      title: "Complete Assembly?",
      text: "Confirm all activities are finished; completing will lock the assembly.",
      confirmLabel: "Complete Assembly",
      cancelLabel: "Back",
    },
  },
  ...commonFallbacks,
};
