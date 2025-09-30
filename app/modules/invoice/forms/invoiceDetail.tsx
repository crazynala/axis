import type { FieldConfig } from "~/base/forms/fieldConfigShared";
export { renderField } from "~/base/forms/fieldConfigShared";

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
    widget: "select",
    optionsKey: "customer",
  },
  { name: "notes", label: "Notes", findOp: "contains" },
];

export function allInvoiceFindFields() {
  return [...invoiceMainFields];
}
