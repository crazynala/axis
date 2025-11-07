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
    RECEIVING: { label: "Receiving", color: "yellow" },
    COMPLETE: { label: "Complete", color: "blue" },
    CANCELED: { label: "Canceled", color: "dark" },
  },
  transitions: {
    DRAFT: ["FINAL", "CANCELED"],
    FINAL: ["RECEIVING", "COMPLETE", "CANCELED", "DRAFT"],
    RECEIVING: ["COMPLETE", "FINAL"],
    COMPLETE: ["RECEIVING"],
    CANCELED: [],
  },
  transitionMeta: {
    "DRAFT->FINAL": {
      color: "orange",
      title: "Finalize Purchase Order?",
      text: "Finalizing will lock pricing and product fields and set actual quantities to the ordered amounts.",
      confirmLabel: "Finalize",
      cancelLabel: "Keep Draft",
    },
    "FINAL->DRAFT": {
      color: "red",
      title: "Revert Finalized PO to Draft?",
      text: "Reverting to Draft will unlock product and pricing edits. Any received quantities remain recorded.",
      confirmLabel: "Revert to Draft",
      cancelLabel: "Back",
    },
    "FINAL->CANCELED": {
      color: "red",
      title: "Cancel Finalized PO?",
      text: "Canceling a finalized PO will stop further receiving. You can re-open later by setting back to Draft in admin.",
      confirmLabel: "Cancel PO",
      cancelLabel: "Back",
    },
    "FINAL->RECEIVING": {
      color: "yellow",
      title: "Start Receiving?",
      text: "This will mark the PO as in receiving. You can continue to edit actual quantities but not below what's already received.",
      confirmLabel: "Start Receiving",
      cancelLabel: "Back",
    },
    "RECEIVING->COMPLETE": {
      color: "teal",
      title: "Mark PO Complete?",
      text: "Completing will lock quantities. If not all items were received, remaining quantities will be set to the received amounts.",
      confirmLabel: "Complete PO",
      cancelLabel: "Back",
    },
    "COMPLETE->RECEIVING": {
      color: "yellow",
      title: "Reopen Receiving?",
      text: "This will allow receiving additional items. Quantities can be adjusted upward but not below what's already received.",
      confirmLabel: "Reopen Receiving",
      cancelLabel: "Back",
    },
    "RECEIVING->FINAL": {
      color: "orange",
      title: "Revert to Final?",
      text: "This will move the PO out of active receiving while keeping existing receipts.",
      confirmLabel: "Revert to Final",
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
