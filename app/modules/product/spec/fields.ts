import type { ProductFieldSpec } from "./types";

export const productFields: Record<string, ProductFieldSpec> = {
  id: { key: "id", label: "ID", type: "id" },
  sku: { key: "sku", label: "SKU", type: "text" },
  name: { key: "name", label: "Name", type: "text" },
  description: { key: "description", label: "Description", type: "text" },
  type: { key: "type", label: "Type", type: "enum" },
  categoryId: { key: "categoryId", label: "Category", type: "id" },
  subCategoryId: { key: "subCategoryId", label: "Subcategory", type: "id" },
  templateId: { key: "templateId", label: "Template", type: "id" },
  supplierId: { key: "supplierId", label: "Supplier", type: "id" },
  customerId: { key: "customerId", label: "Customer", type: "id" },
  variantSetId: { key: "variantSetId", label: "Variant Set", type: "id" },
  costPrice: { key: "costPrice", label: "Cost Price", type: "number" },
  manualSalePrice: {
    key: "manualSalePrice",
    label: "Manual Sale Price",
    type: "number",
  },
  purchaseTaxId: { key: "purchaseTaxId", label: "Purchase Tax", type: "id" },
  leadTimeDays: { key: "leadTimeDays", label: "Lead time (days)", type: "number" },
  stockTrackingEnabled: {
    key: "stockTrackingEnabled",
    label: "Stock Tracking",
    type: "bool",
  },
  batchTrackingEnabled: {
    key: "batchTrackingEnabled",
    label: "Batch Tracking",
    type: "bool",
  },
  flagIsDisabled: { key: "flagIsDisabled", label: "Disabled", type: "bool" },
  externalStepType: {
    key: "externalStepType",
    label: "External step type",
    type: "enum",
  },
  componentChildSku: {
    key: "componentChildSku",
    label: "Child SKU",
    type: "text",
  },
  componentChildName: {
    key: "componentChildName",
    label: "Child Name",
    type: "text",
  },
  componentChildType: {
    key: "componentChildType",
    label: "Child Type",
    type: "enum",
  },
  componentChildSupplierId: {
    key: "componentChildSupplierId",
    label: "Child Supplier",
    type: "id",
  },
};

// TODO: enrich with required/formatting rules once forms consolidate onto the registry.
