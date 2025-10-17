import type { FieldConfig } from "~/base/forms/fieldConfigShared";
export { renderField } from "~/base/forms/fieldConfigShared";

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
    label: "Archived",
    widget: "triBool",
    findOp: "equals",
  },
  {
    name: "defaultMarginOverride",
    label: "Default Margin Override",
    widget: "text",
    showIf: ({ form }) => !!(form.getValues() as any)?.isSupplier,
    hiddenInModes: ["find"],
  },
];

export function allCompanyFindFields() {
  return [...companyMainFields];
}
