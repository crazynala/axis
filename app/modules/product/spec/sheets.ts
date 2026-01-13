import type { ModuleSheetSpec, SheetViewSpec } from "~/base/sheets/sheetSpec";
import { rulesForType } from "~/modules/product/rules/productTypeRules";
import type { ProductAttributeDefinition } from "~/modules/productMetadata/types/productMetadata";

export type ProductBatchSheetRow = {
  id?: number | "";
  sku: string;
  name: string;
  type: string;
  supplierId?: string | number | "";
  categoryId?: string | number | "";
  subCategoryId?: string | number | "";
  purchaseTaxId?: string | number | "";
  costPrice?: number | string | "" | null;
  manualSalePrice?: number | string | "" | null;
  pricingModel?: string | null | "";
  pricingSpecId?: string | number | "";
  moqPrice?: number | string | "" | null;
  margin?: number | string | "" | null;
  transferPct?: number | string | "" | null;
  stockTrackingEnabled?: boolean;
  batchTrackingEnabled?: boolean;
  disableControls?: boolean;
};

export type ProductBomsSheetRow = {
  productId: number;
  productSku: string;
  productName: string;
  id: number | null;
  childSku: string;
  childName: string;
  activityUsed: string;
  type: string;
  supplier: string;
  quantity: number | string;
  groupStart?: boolean;
  disableControls?: boolean;
};

export type ProductDetailBomRow = {
  id: number | null;
  childSku: string;
  childName: string;
  activityUsed: string;
  type: string;
  supplier: string;
  quantity: number | string;
  disableControls?: boolean;
};

const nameWidthPresets = [
  { id: "s", label: "S", px: 180 },
  { id: "m", label: "M", px: 260 },
  { id: "l", label: "L", px: 420 },
  { id: "auto", label: "Auto" },
];

const batchView: SheetViewSpec<ProductBatchSheetRow> = {
  id: "batch",
  label: "Products Batch",
  defaultColumns: [
    "sku",
    "name",
    "type",
    "supplierId",
    "categoryId",
    "purchaseTaxId",
    "costPrice",
    "manualSalePrice",
  ],
  columns: [
    { key: "id", label: "ID", section: "base", baseWidthPx: 80 },
    {
      key: "sku",
      label: "SKU",
      section: "base",
      hideable: false,
      baseWidthPx: 140,
    },
    {
      key: "name",
      label: "Name",
      section: "base",
      hideable: false,
      baseWidthPx: 260,
      widthPresets: nameWidthPresets,
      defaultWidthPresetId: "m",
      grow: 1,
    },
    { key: "type", label: "Type", section: "base", baseWidthPx: 140 },
    {
      key: "supplierId",
      label: "Supplier",
      section: "base",
      baseWidthPx: 180,
      isApplicable: (row) => {
        const type = String(row?.type || "").trim();
        if (!type) return true;
        return rulesForType(type).showSupplier;
      },
      getInapplicableReason: (row) => {
        const type = String(row?.type || "").trim();
        if (!type) return "Set a product type to enable Supplier.";
        return "Supplier not applicable for this product type.";
      },
    },
    { key: "categoryId", label: "Category", section: "base", baseWidthPx: 170 },
    { key: "purchaseTaxId", label: "Tax", section: "base", baseWidthPx: 120 },
    {
      key: "costPrice",
      label: "Cost",
      section: "base",
      group: "Pricing",
      baseWidthPx: 120,
    },
    {
      key: "manualSalePrice",
      label: "Sell",
      section: "base",
      group: "Pricing",
      baseWidthPx: 120,
    },
    {
      key: "pricingModel",
      label: "Pricing Model",
      section: "base",
      group: "Pricing",
      defaultVisible: false,
      baseWidthPx: 200,
    },
    {
      key: "pricingSpecId",
      label: "Pricing Spec",
      section: "base",
      group: "Pricing",
      defaultVisible: false,
      baseWidthPx: 220,
      isApplicable: (row) => isCurvePricing(row),
      getInapplicableReason: () =>
        "Requires Curve (Sell at MOQ) pricing model.",
      isRelevant: (rows) => rows.some((row) => isCurvePricing(row)),
    },
    {
      key: "moqPrice",
      label: "MOQ Price",
      section: "base",
      group: "Pricing",
      defaultVisible: false,
      baseWidthPx: 130,
      isApplicable: (row) => isCurvePricing(row),
      getInapplicableReason: () => "Not used for this pricing model.",
      isRelevant: (rows) => rows.some((row) => isCurvePricing(row)),
    },
    {
      key: "margin",
      label: "Margin",
      section: "base",
      group: "Pricing",
      defaultVisible: false,
      baseWidthPx: 110,
      isApplicable: (row) => isMarginPricing(row),
      getInapplicableReason: () => "Not used for this pricing model.",
      isRelevant: (rows) => rows.some((row) => isMarginPricing(row)),
    },
    {
      key: "transferPct",
      label: "Transfer %",
      section: "base",
      group: "Pricing",
      defaultVisible: false,
      baseWidthPx: 120,
      isApplicable: (row) => isCurvePricing(row),
      getInapplicableReason: () => "Not used for this pricing model.",
      isRelevant: (rows) => rows.some((row) => isCurvePricing(row)),
    },
    {
      key: "stockTrackingEnabled",
      label: "Stock",
      section: "base",
      group: "Inventory",
      baseWidthPx: 110,
    },
    {
      key: "batchTrackingEnabled",
      label: "Batch",
      section: "base",
      group: "Inventory",
      baseWidthPx: 110,
    },
  ],
};

const bomsView: SheetViewSpec<ProductBomsSheetRow> = {
  id: "boms",
  label: "Products BOMs",
  defaultColumns: [
    "product",
    "childSku",
    "childName",
    "activityUsed",
    "quantity",
  ],
  columns: [
    {
      key: "product",
      label: "Product",
      hideable: false,
      section: "base",
    },
    { key: "id", label: "Line ID", section: "base" },
    { key: "childSku", label: "SKU", section: "base" },
    { key: "childName", label: "Name", section: "base" },
    { key: "activityUsed", label: "Usage", section: "base", group: "Usage" },
    { key: "type", label: "Type", section: "base" },
    { key: "supplier", label: "Supplier", section: "base" },
    { key: "quantity", label: "Qty", section: "base", group: "Usage" },
  ],
};

const detailBomView: SheetViewSpec<ProductDetailBomRow> = {
  id: "detail-bom",
  label: "Product BOM",
  defaultColumns: ["childSku", "childName", "activityUsed", "quantity"],
  columns: [
    { key: "id", label: "ID", section: "base" },
    { key: "childSku", label: "SKU", section: "base", hideable: false },
    { key: "childName", label: "Name", section: "base" },
    { key: "activityUsed", label: "Usage", section: "base", group: "Usage" },
    { key: "type", label: "Type", section: "base" },
    { key: "supplier", label: "Supplier", section: "base" },
    { key: "quantity", label: "Qty", section: "base", group: "Usage" },
  ],
};

export const productSheetSpec: ModuleSheetSpec<any> = {
  views: {
    "batch": batchView,
    "boms": bomsView,
    "detail-bom": detailBomView,
  },
};

export function buildProductBatchSheetViewSpec(
  metadataDefinitions: ProductAttributeDefinition[]
): SheetViewSpec<ProductBatchSheetRow> {
  return {
    ...batchView,
    columns: [
      ...batchView.columns,
      ...buildProductBatchMetadataColumns(metadataDefinitions),
    ],
  };
}

export function buildProductMetadataColumnKey(key: string) {
  return `meta:${key}`;
}

function buildProductBatchMetadataColumns(
  metadataDefinitions: ProductAttributeDefinition[]
): SheetViewSpec<ProductBatchSheetRow>["columns"] {
  return (metadataDefinitions || []).map((def) => {
    const isJson = def.dataType === "JSON";
    const baseWidthPx = getMetadataBaseWidth(def);
    if (isJson) {
      return {
        key: buildProductMetadataColumnKey(def.key),
        label: def.label || def.key,
        section: "metadata",
        group: "Metadata",
        defaultVisible: false,
        baseWidthPx,
        isApplicable: () => false,
        getInapplicableReason: () => "Editing not supported in sheet yet.",
        isRelevant: () => true,
      };
    }
    return {
      key: buildProductMetadataColumnKey(def.key),
      label: def.label || def.key,
      section: "metadata",
      group: "Metadata",
      defaultVisible: false,
      baseWidthPx,
      isApplicable: (row) => isMetadataApplicable(def, row),
      getInapplicableReason: (row) => getMetadataInapplicableReason(def, row),
      isRelevant: (rows) =>
        rows.some((row) => isMetadataApplicable(def, row)),
    };
  });
}

function getMetadataBaseWidth(def: ProductAttributeDefinition) {
  switch (def.dataType) {
    case "NUMBER":
      return 120;
    case "BOOLEAN":
      return 100;
    case "ENUM":
      return 180;
    case "JSON":
      return 220;
    default:
      return 180;
  }
}

function isCurvePricing(row: ProductBatchSheetRow) {
  return String(row?.pricingModel || "").toUpperCase() === "CURVE_SELL_AT_MOQ";
}

function isMarginPricing(row: ProductBatchSheetRow) {
  const model = String(row?.pricingModel || "").toUpperCase();
  return (
    model === "COST_PLUS_MARGIN" || model === "TIERED_COST_PLUS_MARGIN"
  );
}

function isMetadataApplicable(
  def: ProductAttributeDefinition,
  row: ProductBatchSheetRow
) {
  const typeList = Array.isArray(def.appliesToProductTypes)
    ? def.appliesToProductTypes
    : [];
  const type = String(row?.type || "").toLowerCase();
  if (typeList.length) {
    if (!type) return false;
    const matches = typeList.some(
      (entry) => String(entry || "").toLowerCase() === type
    );
    if (!matches) return false;
  }
  const categoryId =
    row?.categoryId != null && String(row.categoryId) !== ""
      ? Number(row.categoryId)
      : null;
  const subCategoryId =
    row?.subCategoryId != null && String(row.subCategoryId) !== ""
      ? Number(row.subCategoryId)
      : null;
  if (
    Array.isArray(def.appliesToCategoryIds) &&
    def.appliesToCategoryIds.length
  ) {
    if (!categoryId) return false;
    if (!def.appliesToCategoryIds.includes(categoryId)) return false;
  }
  if (
    Array.isArray(def.appliesToSubcategoryIds) &&
    def.appliesToSubcategoryIds.length
  ) {
    if (!subCategoryId) return false;
    if (!def.appliesToSubcategoryIds.includes(subCategoryId)) return false;
  }
  return true;
}

function getMetadataInapplicableReason(
  def: ProductAttributeDefinition,
  row: ProductBatchSheetRow
) {
  const typeList = Array.isArray(def.appliesToProductTypes)
    ? def.appliesToProductTypes
    : [];
  const type = String(row?.type || "").toLowerCase();
  if (typeList.length) {
    if (!type) return "Set a product type to enable this field.";
    const matches = typeList.some(
      (entry) => String(entry || "").toLowerCase() === type
    );
    if (!matches) return "Not applicable for this product type.";
  }
  const categoryId =
    row?.categoryId != null && String(row.categoryId) !== ""
      ? Number(row.categoryId)
      : null;
  const subCategoryId =
    row?.subCategoryId != null && String(row.subCategoryId) !== ""
      ? Number(row.subCategoryId)
      : null;
  if (
    Array.isArray(def.appliesToCategoryIds) &&
    def.appliesToCategoryIds.length
  ) {
    if (!categoryId) return "Not applicable for this category.";
    if (!def.appliesToCategoryIds.includes(categoryId))
      return "Not applicable for this category.";
  }
  if (
    Array.isArray(def.appliesToSubcategoryIds) &&
    def.appliesToSubcategoryIds.length
  ) {
    if (!subCategoryId) return "Not applicable for this subcategory.";
    if (!def.appliesToSubcategoryIds.includes(subCategoryId))
      return "Not applicable for this subcategory.";
  }
  return "Not applicable to this product.";
}
