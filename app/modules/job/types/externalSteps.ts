import type {
  ActivityAction,
  ActivityKind,
  ExternalStepType,
} from "@prisma/client";

export type ExternalStepStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "DONE"
  | "IMPLICIT_DONE";

export type ExternalLeadTimeSource = "COSTING" | "PRODUCT" | "COMPANY";

export type DerivedExternalStepActivity = {
  id: number;
  action: ActivityAction | null;
  kind: ActivityKind | null;
  activityDate: string | null;
  quantity: number | null;
  vendor: { id: number; name: string | null } | null;
};

export type DerivedExternalStep = {
  type: ExternalStepType;
  label: string;
  expected: boolean;
  status: ExternalStepStatus;
  sentDate: string | null;
  receivedDate: string | null;
  qtyOut: number | null;
  qtyIn: number | null;
  defectQty: number | null;
  vendor: { id: number; name: string | null } | null;
  etaDate: string | null;
  leadTimeDays: number | null;
  leadTimeSource: ExternalLeadTimeSource | null;
  isLate: boolean;
  lowConfidence: boolean;
  inferredStartDate: string | null;
  inferredEndDate: string | null;
  activities: DerivedExternalStepActivity[];
};
