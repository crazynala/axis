import type { FieldConfig } from "~/base/forms/fieldConfigShared";
export { renderField, extractFindValues } from "~/base/forms/fieldConfigShared";

export const BOX_STATE_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "sealed", label: "Sealed" },
  { value: "shipped", label: "Shipped" },
];

export const boxIdentityFields: FieldConfig[] = [
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
  },
  {
    name: "code",
    label: "Code / Label",
    findOp: "contains",
    placeholder: "e.g., BX00042",
  },
  {
    name: "description",
    label: "Description",
    findOp: "contains",
  },
  {
    name: "state",
    label: "State",
    widget: "select",
    options: BOX_STATE_OPTIONS,
    findOp: "equals",
  },
  {
    name: "notes",
    label: "Notes",
    findOp: "contains",
  },
];

export const boxContextFields: FieldConfig[] = [
  {
    name: "companyId",
    label: "Company",
    widget: "select",
    optionsKey: "companyAll",
    findOp: "equals",
  },
  {
    name: "locationId",
    label: "Location",
    widget: "select",
    optionsKey: "location",
    findOp: "equals",
  },
  {
    name: "shipmentId",
    label: "Shipment",
    findOp: "equals",
  },
  {
    name: "warehouseNumber",
    label: "Warehouse #",
    widget: "numberRange",
    findOp: "range",
    rangeFields: { min: "warehouseNumberMin", max: "warehouseNumberMax" },
  },
  {
    name: "shipmentNumber",
    label: "Shipment #",
    widget: "numberRange",
    findOp: "range",
    rangeFields: { min: "shipmentNumberMin", max: "shipmentNumberMax" },
  },
];

export const boxTimelineFields: FieldConfig[] = [
  {
    name: "createdAt",
    label: "Created",
    widget: "date",
    editable: false,
    readOnly: true,
    hiddenInModes: ["find"],
  },
  {
    name: "updatedAt",
    label: "Updated",
    widget: "date",
    editable: false,
    readOnly: true,
    hiddenInModes: ["find"],
  },
];

export const boxLineCriteriaFields: FieldConfig[] = [
  {
    name: "lineProductSku",
    label: "Line Product SKU",
    findOp: "contains",
    hiddenInModes: ["edit", "create"],
  },
  {
    name: "lineProductName",
    label: "Line Product Name",
    findOp: "contains",
    hiddenInModes: ["edit", "create"],
  },
  {
    name: "lineProductId",
    label: "Line Product ID",
    findOp: "equals",
    hiddenInModes: ["edit", "create"],
  },
  {
    name: "lineJobId",
    label: "Line Job ID",
    findOp: "equals",
    hiddenInModes: ["edit", "create"],
  },
  {
    name: "lineAssemblyId",
    label: "Line Assembly ID",
    findOp: "equals",
    hiddenInModes: ["edit", "create"],
  },
  {
    name: "lineBatchId",
    label: "Line Batch ID",
    findOp: "equals",
    hiddenInModes: ["edit", "create"],
  },
];

export function allBoxFieldConfigs(): FieldConfig[] {
  return [
    ...boxIdentityFields,
    ...boxContextFields,
    ...boxTimelineFields,
    ...boxLineCriteriaFields,
  ];
}
