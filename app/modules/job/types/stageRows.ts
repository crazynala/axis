import type { ExternalStepType } from "@prisma/client";
import type {
  DerivedExternalStep,
  ExternalLeadTimeSource,
  ExternalStepStatus,
} from "~/modules/job/types/externalSteps";

export type StageKey =
  | "order"
  | "cut"
  | "sew"
  | "finish"
  | "pack"
  | "qc";

export type InternalStageRow = {
  kind: "internal";
  stage: StageKey;
  label: string;
  breakdown: number[];
  total: number;
  loss?: number[];
  lossTotal?: number;
  loggedDefectTotal?: number;
  hint?: string;
};

export type ExternalStageRow = {
  kind: "external";
  stage: "external";
  label: string;
  externalStepType: ExternalStepType;
  expected: boolean;
  status: ExternalStepStatus;
  etaDate: string | null;
  isLate: boolean;
  vendor: { id: number; name: string | null } | null;
  lowConfidence: boolean;
  leadTimeDays: number | null;
  leadTimeSource: ExternalLeadTimeSource | null;
  activities: DerivedExternalStep["activities"];
  sent: number[];
  received: number[];
  net: number[];
  loss: number[];
  totals: {
    sent: number;
    received: number;
    net: number;
    loss: number;
  };
};

export type StageRow = InternalStageRow | ExternalStageRow;
