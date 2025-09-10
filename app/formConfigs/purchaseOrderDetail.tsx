import type { FieldConfig } from "./fieldConfigShared";
export { renderField } from "./fieldConfigShared";

export const purchaseOrderMainFields: FieldConfig[] = [
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
  },
  { name: "date", label: "Date", type: "date", findOp: "equals" },
  { name: "status", label: "Status", findOp: "contains" },
  {
    name: "companyId",
    label: "Vendor",
    widget: "customerPicker",
    hiddenInModes: ["find"],
    editable: false,
  },
  {
    name: "consigneeCompanyId",
    label: "Consignee",
    editable: false,
    readOnly: true,
    findOp: "equals",
  },
  {
    name: "locationId",
    label: "Location",
    editable: false,
    readOnly: true,
    findOp: "equals",
  },
  {
    name: "vendorName",
    label: "Vendor Name",
    editable: false,
    readOnly: true,
    findOp: "contains",
  },
  {
    name: "consigneeName",
    label: "Consignee Name",
    editable: false,
    readOnly: true,
    findOp: "contains",
  },
  {
    name: "locationName",
    label: "Location Name",
    editable: false,
    readOnly: true,
    findOp: "contains",
  },
];

export function allPurchaseOrderFindFields() {
  return [...purchaseOrderMainFields];
}
