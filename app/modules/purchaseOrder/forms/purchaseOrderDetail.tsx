import type { FieldConfig } from "~/base/forms/fieldConfigShared";
export { renderField } from "~/base/forms/fieldConfigShared";

export const purchaseOrderMainFields: FieldConfig[] = [
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
    hiddenInModes: ["create"],
  },
  {
    name: "status",
    label: "Status",
    findOp: "contains",
    hiddenInModes: ["create"],
  },
  {
    name: "companyId",
    label: "Vendor",
    widget: "select",
    optionsKey: "supplier",
  },
  {
    name: "consigneeCompanyId",
    label: "Consignee",
    widget: "select",
    optionsKey: "customer",
    findOp: "equals",
  },
  {
    name: "locationId",
    label: "Location",
    widget: "select",
    optionsKey: "location",
    findOp: "equals",
    readOnly: true,
    hiddenInModes: ["create"],
  },
  { name: "memo", label: "Memo", findOp: "contains" },
  { name: "date", label: "Date", type: "date", findOp: "equals" },
];

export function allPurchaseOrderFindFields() {
  return [...purchaseOrderMainFields];
}
