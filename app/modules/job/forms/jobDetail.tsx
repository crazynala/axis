import { JOB_DATES_STATUS_FIELDS } from "~/constants/spec";
import type { FieldConfig } from "~/base/forms/fieldConfigShared";
export { renderField } from "~/base/forms/fieldConfigShared";

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
    name: "customerPoNum",
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
    name: "stockLocationId",
    label: "Stock Location",
    widget: "select",
    optionsKey: "location",
    findOp: "equals",
  },
];

// Overview (ID + main fields; customer/company picker handled separately)
export const jobOverviewFields: FieldConfig[] = [
  { name: "projectCode", label: "Project Code", findOp: "contains" },
  { name: "name", label: "Name", findOp: "contains" },
  {
    name: "statusWhiteboard",
    label: "Status Whiteboard",
    widget: "textarea",
    props: { minRows: 2 },
    findOp: "contains",
  },
  {
    name: "companyId",
    label: "Customer",
    widget: "select",
    optionsKey: "customer",
    findOp: "contains",
  },

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
];

// Find-only: child assemblies
export const assemblyFields: FieldConfig[] = [
  {
    name: "assemblySku",
    label: "Assembly SKU",
    findOp: "contains",
    hiddenInModes: ["edit", "create"],
  },
  {
    name: "assemblyName",
    label: "Assembly Name",
    findOp: "contains",
    hiddenInModes: ["edit", "create"],
  },
  {
    name: "assemblyStatus",
    label: "Assembly Status",
    findOp: "contains",
    hiddenInModes: ["edit", "create"],
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
