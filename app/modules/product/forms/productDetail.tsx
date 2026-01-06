import type { FieldConfig } from "../../../base/forms/fieldConfigShared";
import { calcPrice } from "../calc/calcPrice";
import { Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import {
  deriveExternalStepTypeFromCategoryCode,
  rulesForType,
} from "../rules/productTypeRules";
export {
  renderField,
  extractFindValues,
} from "../../../base/forms/fieldConfigShared";

const EXTERNAL_STEP_OPTIONS = [
  { value: "EMBROIDERY", label: "Embroidery" },
  { value: "WASH", label: "Wash" },
  { value: "DYE", label: "Dye" },
];

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
  {
    name: "type",
    label: "Type",
    findOp: "equals",
    findPlaceholder: "equals...",
    widget: "select",
    optionsKey: "productType",
  },
  { name: "sku", label: "SKU", findOp: "contains" },
  { name: "name", label: "Name", findOp: "contains" },
  { name: "description", label: "Description", findOp: "contains" },
];

// Associations & toggles
export const productAssocFields: FieldConfig[] = [
  {
    name: "categoryId",
    label: "Category",
    widget: "select",
    optionsKey: "category",
    findOp: "equals",
  },
  {
    name: "subCategoryId",
    label: "Subcategory",
    widget: "select",
    optionsKey: "subcategory",
    findOp: "equals",
  },
  {
    name: "templateId",
    label: "Template",
    widget: "select",
    optionsKey: "productTemplate",
    findOp: "equals",
    showIf: ({ ctx }) => !ctx?.hideTemplateField,
  },
  {
    name: "supplierId",
    label: "Supplier",
    widget: "select",
    optionsKey: "supplier",
    findOp: "equals",
    showIf: ({ form }) => rulesForType(form.watch("type")).showSupplier,
  },
  {
    name: "customerId",
    label: "Customer",
    widget: "select",
    optionsKey: "customer",
    allOptionsKey: "customerAll",
    findOp: "equals",
    showIf: ({ form }) => rulesForType(form.watch("type")).showCustomer,
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
  {
    name: "flagIsDisabled",
    label: "Disabled",
    widget: "triBool",
    findOp: "equals",
  },
  {
    name: "leadTimeDays",
    label: "Lead time (days)",
    hiddenInModes: ["find"],
    widget: "numberRange",
    placeholder: "e.g. 14",
    rightSection: () => (
      <Tooltip
        label="Overrides supplier default lead time"
        withArrow
        multiline
        maw={220}
      >
        <IconInfoCircle size={16} stroke={1.5} style={{ cursor: "help" }} />
      </Tooltip>
    ),
  },
  {
    name: "externalStepType",
    label: "External step type",
    widget: "select",
    options: EXTERNAL_STEP_OPTIONS,
    findOp: "equals",
    showIf: ({ form, ctx }) => {
      const rules = rulesForType(form.watch("type"));
      if (!rules.showExternalStepType) return false;
      const catId = form.watch("categoryId");
      const meta = ctx?.options?.categoryMetaById?.[String(catId)];
      const implied = deriveExternalStepTypeFromCategoryCode(meta?.code);
      return true;
    },
  },
];

// Pricing & category
export const productPricingFields: FieldConfig[] = [
  {
    name: "costPrice",
    label: "Cost Price",
    widget: "numberRange",
    findOp: "range",
    readOnlyIf: ({ mode, ctx }) => {
      if (mode === "find") return false;
      return Boolean((ctx as any)?.costPriceLocked);
    },
    rightSection: ({ ctx }) => {
      const has = (ctx as any)?.hasCostTiers;
      const open = (ctx as any)?.openCostTiersModal as (() => void) | undefined;
      const locked = Boolean((ctx as any)?.costPriceLocked);
      if (!has && !locked) return null;
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {has && open ? (
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
              <span style={{ fontWeight: 700 }}>≡</span>
            </button>
          ) : null}
        </div>
      );
    },
  },
  {
    name: "purchaseTaxId",
    label: "Purchase Tax",
    widget: "select",
    optionsKey: "tax",
    findOp: "equals",
  },
  {
    name: "costGroupId",
    label: "Cost Group",
    widget: "select",
    optionsKey: "costGroup",
    hiddenInModes: ["find"],
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
      // Prefer server-computed preview when available (includes vendor/global defaults)
      // const preview = (ctx as any)?.pricingPreview;
      // if (
      //   preview?.unitSellPrice != null &&
      //   Number(preview.unitSellPrice) > 0 &&
      //   Number.isFinite(Number(preview.unitSellPrice))
      // ) {
      //   return Number(preview.unitSellPrice);
      // }

      const baseCost = Number(values?.costPrice ?? 0) || 0;
      const qty =
        Number((ctx as any)?.pricingQty ?? values?.defaultCostQty ?? 60) || 60;
      // tax rate
      let taxRate = 0;
      const taxId = values?.purchaseTaxId ?? null;
      const rates = (ctx as any)?.options?.taxRateById || {};
      if (taxId != null && rates) {
        const key = String(taxId);
        const n = Number(rates[key] ?? 0);
        taxRate = Number.isFinite(n) ? n : 0;
      }
      // sale tiers: selected group cache → product group → product
      const saleProduct = ((ctx as any)?.product?.salePriceRanges ||
        []) as any[];
      const saleGroupOnProduct = ((ctx as any)?.product?.salePriceGroup
        ?.saleRanges || []) as any[];
      const cachedMap = ((ctx as any)?.salePriceGroupRangesById ||
        {}) as Record<string, Array<{ minQty: number; unitPrice: number }>>;
      const selectedSpgId =
        values?.salePriceGroupId != null
          ? String(values.salePriceGroupId)
          : null;
      let saleTiers: Array<{ minQty: number; unitPrice: number }> = [];
      if (selectedSpgId && cachedMap[selectedSpgId]) {
        saleTiers = (cachedMap[selectedSpgId] || [])
          .map((t) => ({
            minQty: Number(t.minQty) || 0,
            unitPrice: Number(t.unitPrice) || 0,
          }))
          .sort((a, b) => a.minQty - b.minQty);
      } else if (
        Array.isArray(saleGroupOnProduct) &&
        saleGroupOnProduct.length
      ) {
        saleTiers = saleGroupOnProduct
          .filter((r: any) => r && r.rangeFrom != null && r.price != null)
          .map((r: any) => ({
            minQty: Number(r.rangeFrom) || 0,
            unitPrice: Number(r.price) || 0,
          }))
          .sort((a, b) => a.minQty - b.minQty);
      } else if (Array.isArray(saleProduct) && saleProduct.length) {
        saleTiers = saleProduct
          .filter((r: any) => r && r.rangeFrom != null && r.price != null)
          .map((r: any) => ({
            minQty: Number(r.rangeFrom) || 0,
            unitPrice: Number(r.price) || 0,
          }))
          .sort((a, b) => a.minQty - b.minQty);
      }
      // cost tiers: selected cost group cache → product's cost group
      const selectedCgId =
        values?.costGroupId != null ? String(values.costGroupId) : null;
      const costMap = ((ctx as any)?.costGroupRangesById || {}) as Record<
        string,
        Array<{ minQty: number; unitCost: number; unitSellManual: number }>
      >;
      const costRanges = selectedCgId
        ? costMap[selectedCgId] || []
        : (((ctx as any)?.product?.costGroup?.costRanges || []) as any[]).map(
            (r: any) => ({
              minQty: Number(r.rangeFrom) || 0,
              unitCost: Number(r.costPrice ?? 0) || 0,
              unitSellManual: Number(r.sellPriceManual ?? 0) || 0,
            })
          );
      const tiers = (costRanges || []).map((r: any) => ({
        minQty: Number(r.minQty) || 0,
        priceCost: Number(r.unitCost ?? (r as any).costPrice ?? 0) || 0,
      }));
      const priceMultiplier =
        Number(
          (ctx as any)?.priceMultiplier ??
            (ctx as any)?.customer?.priceMultiplier ??
            1
        ) || 1;
      // Resolve margin precedence for cost+margin mode when no sale tiers apply
      const manualMarginRaw = (values as any)?.manualMargin;
      let marginPct: number | undefined = undefined;
      if (manualMarginRaw != null && String(manualMarginRaw) !== "") {
        marginPct = Number(manualMarginRaw);
      } else {
        const md = (ctx as any)?.pricingMarginDefaults as
          | {
              marginOverride?: number | null;
              vendorDefaultMargin?: number | null;
              globalDefaultMargin?: number | null;
            }
          | undefined;
        if (md?.marginOverride != null) marginPct = Number(md.marginOverride);
        else if (md?.vendorDefaultMargin != null)
          marginPct = Number(md.vendorDefaultMargin);
        else if (md?.globalDefaultMargin != null)
          marginPct = Number(md.globalDefaultMargin);
        else marginPct = undefined; // let calcPrice fall back (e.g., 0.1)
      }
      const out = calcPrice({
        baseCost,
        qty,
        taxRate,
        saleTiers,
        tiers,
        priceMultiplier,
        marginPct,
      });
      // console.log("!! Computed manualSalePriceOverride default:", out);
      return out.unitSellPrice;
    },
    format: (v) => (v != null && v !== "" ? Number(v).toFixed(2) : ""),
  },
  {
    name: "baselinePriceAtMoq",
    label: "Price at MOQ",
    widget: "numberRange",
    hiddenInModes: ["find"],
    showIf: ({ form }) =>
      String(form.watch("pricingModel") || "").toUpperCase() ===
      "CURVE_SELL_AT_MOQ",
    format: (v) => (v != null && v !== "" ? Number(v).toFixed(2) : ""),
  },
  {
    name: "transferPercent",
    label: "Transfer %",
    widget: "numberRange",
    hiddenInModes: ["find"],
    showIf: ({ form }) =>
      String(form.watch("pricingModel") || "").toUpperCase() ===
      "CURVE_SELL_AT_MOQ",
    format: (v) => (v != null && v !== "" ? Number(v).toFixed(4) : ""),
  },
  // Find-only manual sale price range
  {
    name: "manualSalePrice",
    label: "Manual Sale Price",
    widget: "numberRange",
    findOp: "range",
    hiddenInModes: ["edit", "create"],
  },
  // Manual margin (mutually exclusive with manualSalePrice). Edit-only numeric field.
  {
    name: "manualMargin",
    label: "Margin",
    widget: "defaultOverride",
    hiddenInModes: ["find"],
    overrideName: "manualMargin",
    inputType: "number",
    placeholder: "e.g., 20 for 20%",
    // Treat 0 as empty so we use the computed/default margin instead of sticking to 0 override
    overrideIsEmpty: (v) => v == null || v === "" || Number(v) === 0,
    overrideAdapter: {
      toInput: (v: any) => {
        if (v == null || v === "") return "";
        const n = Number(v);
        if (!Number.isFinite(n)) return "";
        const scaled = n * 100;
        return Number.isInteger(scaled)
          ? String(scaled)
          : String(Math.round(scaled * 100) / 100);
      },
      fromInput: (raw: any) => {
        if (raw == null || raw === "") return null;
        const n = Number(raw);
        if (!Number.isFinite(n)) return null;
        return n / 100;
      },
    },
    computeDefault: (values, ctx) => {
      const qty =
        Number((ctx as any)?.pricingQty ?? values?.defaultCostQty ?? 60) || 60;
      // tax rate
      let taxRate = 0;
      const taxId = values?.purchaseTaxId ?? null;
      const rates = (ctx as any)?.options?.taxRateById || {};
      if (taxId != null && rates) {
        const key = String(taxId);
        const n = Number(rates[key] ?? 0);
        taxRate = Number.isFinite(n) ? n : 0;
      }
      // Derive implied margin from local calc when sale tiers present; otherwise use cost+margin defaults
      const saleProduct = ((ctx as any)?.product?.salePriceRanges ||
        []) as any[];
      const saleGroupOnProduct = ((ctx as any)?.product?.salePriceGroup
        ?.saleRanges || []) as any[];
      const cachedMap = ((ctx as any)?.salePriceGroupRangesById ||
        {}) as Record<string, Array<{ minQty: number; unitPrice: number }>>;
      const selectedSpgId =
        values?.salePriceGroupId != null
          ? String(values.salePriceGroupId)
          : null;
      let saleTiers: Array<{ minQty: number; unitPrice: number }> = [];
      if (selectedSpgId && cachedMap[selectedSpgId]) {
        saleTiers = (cachedMap[selectedSpgId] || [])
          .map((t) => ({
            minQty: Number(t.minQty) || 0,
            unitPrice: Number(t.unitPrice) || 0,
          }))
          .sort((a, b) => a.minQty - b.minQty);
      } else if (
        Array.isArray(saleGroupOnProduct) &&
        saleGroupOnProduct.length
      ) {
        saleTiers = saleGroupOnProduct
          .filter((r: any) => r && r.rangeFrom != null && r.price != null)
          .map((r: any) => ({
            minQty: Number(r.rangeFrom) || 0,
            unitPrice: Number(r.price) || 0,
          }))
          .sort((a, b) => a.minQty - b.minQty);
      } else if (Array.isArray(saleProduct) && saleProduct.length) {
        saleTiers = saleProduct
          .filter((r: any) => r && r.rangeFrom != null && r.price != null)
          .map((r: any) => ({
            minQty: Number(r.rangeFrom) || 0,
            unitPrice: Number(r.price) || 0,
          }))
          .sort((a, b) => a.minQty - b.minQty);
      }
      if (!saleTiers.length) {
        // No sale tiers: we will use cost+margin path's margin precedence
        const manualMarginRaw = (values as any)?.manualMargin;
        if (manualMarginRaw != null && String(manualMarginRaw) !== "")
          return Number(manualMarginRaw);
        const md = (ctx as any)?.pricingMarginDefaults as
          | {
              marginOverride?: number | null;
              vendorDefaultMargin?: number | null;
              globalDefaultMargin?: number | null;
            }
          | undefined;
        if (md?.marginOverride != null) return Number(md.marginOverride);
        if (md?.vendorDefaultMargin != null)
          return Number(md.vendorDefaultMargin);
        if (md?.globalDefaultMargin != null)
          return Number(md.globalDefaultMargin);
        // Fall back to calcPrice's internal default (0.1); display it to avoid blank
        return 0.1;
      }
      // compute cost at qty
      const selectedCgId2 =
        values?.costGroupId != null ? String(values.costGroupId) : null;
      const costMap2 = ((ctx as any)?.costGroupRangesById || {}) as Record<
        string,
        Array<{ minQty: number; unitCost: number; unitSellManual: number }>
      >;
      const costRanges2 = selectedCgId2
        ? costMap2[selectedCgId2] || []
        : (((ctx as any)?.product?.costGroup?.costRanges || []) as any[]).map(
            (r: any) => ({
              minQty: Number(r.rangeFrom) || 0,
              unitCost: Number(r.costPrice ?? 0) || 0,
              unitSellManual: Number(r.sellPriceManual ?? 0) || 0,
            })
          );
      let unitCost2 = Number(values?.costPrice ?? 0) || 0;
      if (costRanges2 && costRanges2.length) {
        const sorted = [...costRanges2].sort((a, b) => a.minQty - b.minQty);
        for (const r of sorted) if (qty >= r.minQty) unitCost2 = r.unitCost;
      }
      // choose sale tier for qty and multiplier
      let picked: { minQty: number; unitPrice: number } | null = null;
      for (const t of saleTiers) if (qty >= t.minQty) picked = t;
      if (!picked) return undefined;
      const multiplier =
        Number(
          (ctx as any)?.priceMultiplier ??
            (ctx as any)?.customer?.priceMultiplier ??
            1
        ) || 1;
      const unitPreTax = Number(picked.unitPrice) * multiplier;
      if (!Number.isFinite(unitCost2) || unitCost2 <= 0) return undefined;
      const margin = unitPreTax / unitCost2 - 1;
      return Number.isFinite(margin) ? margin : undefined;
    },
    format: (v) => {
      if (v == null || v === "") return "";
      const n = Number(v);
      if (!Number.isFinite(n)) return "";
      const scaled = n * 100;
      return Number.isInteger(scaled)
        ? String(scaled)
        : String(Math.round(scaled * 100) / 100);
    },
  },

  {
    name: "salePriceGroupId",
    label: "Price Group",
    widget: "select",
    optionsKey: "salePriceGroup",
    hiddenInModes: ["find"],
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

export function allProductFindFields(extraFields: FieldConfig[] = []) {
  return [
    ...productIdentityFields,
    ...productAssocFields,
    ...productPricingFields,
    ...productBomFindFields,
    ...extraFields,
  ];
}
