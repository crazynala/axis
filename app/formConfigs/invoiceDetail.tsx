import type { FieldConfig } from "./fieldConfigShared";
export { renderField } from "./fieldConfigShared";

export const invoiceMainFields: FieldConfig[] = [
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
  },
  { name: "invoiceCode", label: "Code", findOp: "contains" },
  { name: "date", label: "Date", type: "date", findOp: "equals" },
  { name: "status", label: "Status", findOp: "contains" },
  {
    name: "companyId",
    label: "Customer",
    widget: "customerPicker",
    hiddenInModes: ["find"],
    editable: false,
  },
  { name: "notes", label: "Notes", findOp: "contains" },
  // Derived / read-only helpers for find mode
  {
    name: "companyName",
    label: "Company",
    editable: false,
    readOnly: true,
    findOp: "contains",
  },
];

export function allInvoiceFindFields() {
  return [...invoiceMainFields];
}
