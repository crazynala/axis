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

export const jobStateKeys = [
  "DRAFT",
  "NEW",
  "CANCELED",
  "PENDING",
  "ON_HOLD",
  "IN_WORK",
  "COMPLETE",
] as const;

export const assemblyStateKeys = [
  "DRAFT",
  "NEW",
  "CANCELED",
  "PENDING",
  "ON_HOLD",
  "CUT_PLANNED",
  "PARTIAL_CUT",
  "FULLY_CUT",
  "COMPLETE",
] as const;

export const jobStateConfig: StateConfig = {
  states: {
    DRAFT: { label: "Draft", color: "gray" },
    NEW: { label: "New", color: "blue" },
    CANCELED: { label: "Canceled", color: "dark" },
    PENDING: { label: "Pending", color: "orange" },
    ON_HOLD: { label: "On Hold", color: "yellow" },
    IN_WORK: { label: "In Work", color: "teal" },
    COMPLETE: { label: "Complete", color: "green" },
  },
  transitions: {
    DRAFT: ["NEW", "CANCELED"],
    NEW: ["PENDING", "ON_HOLD", "IN_WORK", "CANCELED", "COMPLETE"],
    PENDING: ["ON_HOLD", "IN_WORK", "CANCELED", "COMPLETE", "NEW"],
    ON_HOLD: ["PENDING", "IN_WORK", "CANCELED", "COMPLETE", "NEW"],
    IN_WORK: ["ON_HOLD", "COMPLETE", "CANCELED"],
    COMPLETE: ["IN_WORK", "ON_HOLD"],
    CANCELED: [],
  },
  transitionMeta: {
    "DRAFT->NEW": {
      color: "blue",
      title: "Move job to New?",
      text: "Assemblies still in Draft will advance to New so the job stays in sync.",
      confirmLabel: "Move to New",
      cancelLabel: "Keep Draft",
    },
    "NEW->CANCELED": {
      color: "red",
      title: "Cancel job?",
      text: "Canceling will cancel every assembly as long as no activities have been recorded.",
      confirmLabel: "Cancel Job",
      cancelLabel: "Back",
    },
    "PENDING->CANCELED": {
      color: "red",
      title: "Cancel job?",
      text: "Canceling will cancel every assembly as long as no activities have been recorded.",
      confirmLabel: "Cancel Job",
      cancelLabel: "Back",
    },
    "ON_HOLD->CANCELED": {
      color: "red",
      title: "Cancel job?",
      text: "Canceling will cancel every assembly as long as no activities have been recorded.",
      confirmLabel: "Cancel Job",
      cancelLabel: "Back",
    },
    "IN_WORK->CANCELED": {
      color: "red",
      title: "Cancel job?",
      text: "Canceling will cancel every assembly as long as no activities have been recorded.",
      confirmLabel: "Cancel Job",
      cancelLabel: "Back",
    },
    "NEW->ON_HOLD": {
      color: "yellow",
      title: "Put job on hold?",
      text: "Assemblies that are not canceled will be marked On Hold.",
      confirmLabel: "On Hold",
      cancelLabel: "Back",
    },
    "PENDING->ON_HOLD": {
      color: "yellow",
      title: "Put job on hold?",
      text: "Assemblies that are not canceled will be marked On Hold.",
      confirmLabel: "On Hold",
      cancelLabel: "Back",
    },
    "IN_WORK->ON_HOLD": {
      color: "yellow",
      title: "Put job on hold?",
      text: "Assemblies that are not canceled will be marked On Hold.",
      confirmLabel: "On Hold",
      cancelLabel: "Back",
    },
    "ON_HOLD->COMPLETE": {
      color: "green",
      title: "Complete job?",
      text: "Assemblies that are not canceled will be marked Complete.",
      confirmLabel: "Complete Job",
      cancelLabel: "Back",
    },
    "IN_WORK->COMPLETE": {
      color: "green",
      title: "Complete job?",
      text: "Assemblies that are not canceled will be marked Complete.",
      confirmLabel: "Complete Job",
      cancelLabel: "Back",
    },
    "PENDING->COMPLETE": {
      color: "green",
      title: "Complete job?",
      text: "Assemblies that are not canceled will be marked Complete.",
      confirmLabel: "Complete Job",
      cancelLabel: "Back",
    },
  },
  ...commonFallbacks,
};

export const assemblyStateConfig: StateConfig = {
  states: {
    DRAFT: { label: "Draft", color: "gray" },
    NEW: { label: "New", color: "blue" },
    CANCELED: { label: "Canceled", color: "dark" },
    PENDING: { label: "Pending", color: "orange" },
    ON_HOLD: { label: "On Hold", color: "yellow" },
    CUT_PLANNED: { label: "Cut Planned", color: "cyan" },
    PARTIAL_CUT: { label: "Partial Cut", color: "teal" },
    FULLY_CUT: { label: "Fully Cut", color: "green" },
    COMPLETE: { label: "Complete", color: "lime" },
  },
  transitions: {
    DRAFT: ["NEW", "CANCELED"],
    NEW: ["PENDING", "ON_HOLD", "CUT_PLANNED", "COMPLETE", "CANCELED"],
    PENDING: ["ON_HOLD", "CUT_PLANNED", "CANCELED", "NEW"],
    ON_HOLD: ["PENDING", "CUT_PLANNED", "CANCELED"],
    CUT_PLANNED: [
      "PARTIAL_CUT",
      "FULLY_CUT",
      "ON_HOLD",
      "COMPLETE",
      "CANCELED",
    ],
    PARTIAL_CUT: ["FULLY_CUT", "ON_HOLD", "COMPLETE", "CANCELED"],
    FULLY_CUT: ["PARTIAL_CUT", "COMPLETE", "ON_HOLD", "CANCELED"],
    COMPLETE: [],
    CANCELED: [],
  },
  transitionMeta: {
    "CUT_PLANNED->COMPLETE": {
      color: "green",
      title: "Complete assembly?",
      text: "Make sure quantities and costs are finalized before completing.",
      confirmLabel: "Complete Assembly",
      cancelLabel: "Back",
    },
    "PARTIAL_CUT->COMPLETE": {
      color: "green",
      title: "Complete assembly?",
      text: "Make sure all cut quantities are reconciled before completing.",
      confirmLabel: "Complete Assembly",
      cancelLabel: "Back",
    },
    "FULLY_CUT->COMPLETE": {
      color: "green",
      title: "Complete assembly?",
      text: "Make sure downstream steps are done before completing.",
      confirmLabel: "Complete Assembly",
      cancelLabel: "Back",
    },
  },
  ...commonFallbacks,
};
