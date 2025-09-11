import { JOB_DATES_STATUS_FIELDS } from "../constants/spec";
import type { FieldConfig } from "./fieldConfigShared";
export { renderField } from "./fieldConfigShared";

export const jobDateStatusLeft: FieldConfig[] = [
  {
    name: "status",
    label: "Status",
    widget: "select",
    optionsKey: "jobStatus",
    findOp: "contains",
  },
  {
    name: "jobType",
    label: "Job Type",
    widget: "select",
    optionsKey: "jobType",
    findOp: "contains",
  },
  { name: "endCustomerName", label: "End Customer", findOp: "contains" },
  {
    name: "customerOrderNumber",
    label: "Customer PO #",
    findOp: "equals",
    findPlaceholder: "equals...",
  },
];

export const jobDateStatusRight: FieldConfig[] = [
  {
    name: "customerOrderDate",
    label: "Order Date",
    type: "date",
    findOp: "equals",
  },
  { name: "targetDate", label: "Target Date", type: "date", findOp: "equals" },
  {
    name: "dropDeadDate",
    label: "Drop Dead Date",
    type: "date",
    findOp: "equals",
  },
  {
    name: "companyId",
    label: "Company ID",
    editable: false,
    findOp: "equals",
    findPlaceholder: "equals...",
  },
];

// Overview (ID + main fields; customer/company picker handled separately)
export const jobOverviewFields: FieldConfig[] = [
  {
    name: "id",
    label: "ID",
    editable: false,
    readOnly: true,
    hiddenInModes: ["create"],
    widget: "idStatic",
    findOp: "equals",
    findPlaceholder: "equals...",
  },
  { name: "projectCode", label: "Project Code", findOp: "contains" },
  { name: "name", label: "Name", findOp: "contains" },
  {
    name: "companyId",
    label: "Customer",
    widget: "select",
    optionsKey: "customer",
    findOp: "contains",
  },
];

export function validateJobDateStatusConfig() {
  const fields = [...jobDateStatusLeft, ...jobDateStatusRight].map(
    (f) => f.name
  );
  for (const f of JOB_DATES_STATUS_FIELDS) {
    if (!fields.includes(f)) {
      console.warn(
        `[jobDetailConfig] Missing spec field in date/status config: ${f}`
      );
    }
  }
}
