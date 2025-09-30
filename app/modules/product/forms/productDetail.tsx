import type { FieldConfig } from "../../../base/forms/fieldConfigShared";
import { calcPrice } from "../calc/calcPrice";
export {
  renderField,
  extractFindValues,
} from "../../../base/forms/fieldConfigShared";

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
    name: "variantSetId",
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
    rightSection: ({ ctx }) => {
      const has = (ctx as any)?.hasCostTiers;
      const open = (ctx as any)?.openCostTiersModal as (() => void) | undefined;
      if (!has || !open) return null;
      // Lazy import to avoid hard dependency on icon packs if needed
      return (
        // eslint-disable-next-line jsx-a11y/aria-role
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            open();
          }}
          title="View cost tiers"
          style={{
            background: "transparent",
            border: 0,
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          {/* Simple glyph to avoid adding new imports here */}
          <span style={{ fontWeight: 700 }}>≡</span>
        </button>
      );
    },
  },
  // Manual sale price override with computed default (edit/create only)
  {
    name: "manualSalePriceOverride",
    label: "Sell Price",
    widget: "defaultOverride",
    hiddenInModes: ["find"],
    overrideName: "manualSalePrice",
    inputType: "number",
    computeDefault: (values, ctx) => {
      const baseCost = Number(values?.costPrice ?? 0) || 0;
      const qty = Number(values?.defaultCostQty ?? 60) || 60;
      let taxRate = 0;
      const taxId = values?.purchaseTaxId ?? null;
      const rates = (ctx as any)?.options?.taxRateById || {};
      if (taxId != null && rates) {
        const key = String(taxId);
        const n = Number(rates[key] ?? 0);
        taxRate = Number.isFinite(n) ? n : 0;
      }
      const out = calcPrice({ baseCost, qty, taxRate });
      return out.unitPriceWithTax;
    },
    format: (v) => (v != null && v !== "" ? Number(v).toFixed(2) : ""),
  },
  // Find-only manual sale price range
  {
    name: "manualSalePrice",
    label: "Manual Sale Price",
    widget: "numberRange",
    findOp: "range",
    hiddenInModes: ["edit", "create"],
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
