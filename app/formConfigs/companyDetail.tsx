import type { FieldConfig } from "./fieldConfigShared";
export { renderField } from "./fieldConfigShared";

export const companyMainFields: FieldConfig[] = [
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
  },
  { name: "name", label: "Name", findOp: "contains" },
  { name: "notes", label: "Notes", findOp: "contains" },
  { name: "isCarrier", label: "Carrier", widget: "triBool", findOp: "equals" },
  {
    name: "isCustomer",
    label: "Customer",
    widget: "triBool",
    findOp: "equals",
  },
  {
    name: "isSupplier",
    label: "Supplier",
    widget: "triBool",
    findOp: "equals",
  },
  {
    name: "isInactive",
    label: "Inactive",
    widget: "triBool",
    findOp: "equals",
  },
  { name: "isActive", label: "Active", widget: "triBool", findOp: "equals" },
];

export function allCompanyFindFields() {
  return [...companyMainFields];
}
