import type { FieldConfig } from "~/base/forms/fieldConfigShared";
export { renderField, extractFindValues } from "~/base/forms/fieldConfigShared";

export const BOX_STATE_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "sealed", label: "Sealed" },
  { value: "shipped", label: "Shipped" },
];

export const boxDetailIdentityFields: FieldConfig[] = [
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
    readOnlyIf: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
    disabledWhen: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
  },
  {
    name: "description",
    label: "Description",
    findOp: "contains",
    readOnlyIf: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
    disabledWhen: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
  },
  {
    name: "notes",
    label: "Notes",
    findOp: "contains",
    readOnlyIf: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
    disabledWhen: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
  },
];

export const boxFindIdentityFields: FieldConfig[] = [
  ...boxDetailIdentityFields,
  {
    name: "state",
    label: "State",
    widget: "select",
    options: BOX_STATE_OPTIONS,
    findOp: "equals",
  },
];

export const boxDetailContextFields: FieldConfig[] = [
  {
    name: "companyId",
    label: "Company",
    widget: "select",
    optionsKey: "companyAll",
    findOp: "equals",
    readOnlyIf: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
    disabledWhen: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
  },
  {
    name: "locationId",
    label: "Location",
    widget: "select",
    optionsKey: "location",
    findOp: "equals",
    readOnlyIf: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
    disabledWhen: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
  },
  {
    name: "shipmentId",
    label: "Shipment",
    findOp: "equals",
    editable: false,
    readOnly: true,
  },
  {
    name: "warehouseNumber",
    label: "Warehouse #",
    widget: "numberRange",
    findOp: "range",
    rangeFields: { min: "warehouseNumberMin", max: "warehouseNumberMax" },
    readOnlyIf: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
    disabledWhen: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
  },
  {
    name: "shipmentNumber",
    label: "Shipment #",
    widget: "numberRange",
    findOp: "range",
    rangeFields: { min: "shipmentNumberMin", max: "shipmentNumberMax" },
    readOnlyIf: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
    disabledWhen: ({ ctx, mode }) => mode === "edit" && Boolean(ctx?.isShipped),
  },
];

export const boxAuditFields: FieldConfig[] = [
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
    ...boxFindIdentityFields,
    ...boxDetailContextFields,
    ...boxAuditFields,
    ...boxLineCriteriaFields,
  ];
}
