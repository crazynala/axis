import type { FieldConfig } from "~/base/forms/fieldConfigShared";
export { renderField } from "~/base/forms/fieldConfigShared";

export const purchaseOrderMainFields: FieldConfig[] = [
  {
    name: "companyId",
    label: "Vendor",
    widget: "select",
    optionsKey: "supplier",
    findOp: "equals",
    inlineWithNext: true,
    flex: 1,
  },
  { name: "date", label: "Date", type: "date", findOp: "equals", flex: 1 },
  {
    name: "consigneeCompanyId",
    label: "Consignee",
    widget: "select",
    optionsKey: "customer",
    findOp: "equals",
    inlineWithNext: true,
    flex: 1,
  },
  {
    name: "locationId",
    label: "Location",
    widget: "select",
    optionsKey: "location",
    findOp: "equals",
    editable: false,
    readOnly: true,
    hiddenInModes: ["create"],
    flex: 1,
  },
  { name: "memo", label: "Memo", findOp: "contains" },

  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
    hiddenInModes: ["create"],
  },
];

export function allPurchaseOrderFindFields() {
  return [...purchaseOrderMainFields];
}
