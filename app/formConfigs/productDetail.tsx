import type { FieldConfig } from "./fieldConfigShared";
import { extractFindValues } from "./fieldConfigShared";
export { renderField, extractFindValues } from "./fieldConfigShared";

// Overview / identity fields
export const productIdentityFields: FieldConfig[] = [
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
  },
  { name: "sku", label: "SKU", findOp: "contains" },
  { name: "name", label: "Name", findOp: "contains" },
  { name: "description", label: "Description", findOp: "contains" },
  {
    name: "type",
    label: "Type",
    findOp: "equals",
    findPlaceholder: "equals...",
    widget: "select",
    optionsKey: "productType",
  },
];

// Associations & toggles
export const productAssocFields: FieldConfig[] = [
  {
    name: "customerId",
    label: "Customer",
    widget: "select",
    optionsKey: "customer",
    findOp: "equals",
  },
  {
    name: "variantSet",
    label: "Variant Set",
    widget: "select",
    optionsKey: "variantSet",
  },
  {
    name: "stockTrackingEnabled",
    label: "Stock Tracking",
    widget: "triBool",
    findOp: "equals",
  },
  {
    name: "batchTrackingEnabled",
    label: "Batch Tracking",
    widget: "triBool",
    findOp: "equals",
  },
];

// Pricing & category
export const productPricingFields: FieldConfig[] = [
  {
    name: "costPrice",
    label: "Cost Price",
    widget: "numberRange",
    findOp: "range",
  },
  {
    name: "manualSalePrice",
    label: "Manual Sale Price",
    widget: "numberRange",
    findOp: "range",
  },
  {
    name: "purchaseTaxId",
    label: "Purchase Tax",
    widget: "select",
    optionsKey: "tax",
    findOp: "equals",
  },
  {
    name: "categoryId",
    label: "Category",
    widget: "select",
    optionsKey: "category",
    findOp: "equals",
  },
  {
    name: "supplierId",
    label: "Supplier",
    widget: "select",
    optionsKey: "supplier",
    findOp: "equals",
  },
];

// Bill of Materials find-only fields (component child criteria)
export const productBomFindFields: FieldConfig[] = [
  { name: "componentChildSku", label: "Child SKU", findOp: "contains" },
  { name: "componentChildName", label: "Child Name", findOp: "contains" },
  { name: "componentChildType", label: "Child Type", findOp: "equals" },
  {
    name: "componentChildSupplierId",
    label: "Child Supplier",
    widget: "select",
    optionsKey: "supplier",
    findOp: "equals",
  },
];

// Future: spec validation hook similar to jobs.

export function allProductFindFields() {
  return [
    ...productIdentityFields,
    ...productAssocFields,
    ...productPricingFields,
    ...productBomFindFields,
  ];
}
