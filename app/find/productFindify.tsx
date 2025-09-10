import { useCallback } from "react";
import { useBaseFindify } from "./baseFindify";
import { useFind } from "./FindContext";

export type ProductFindFormValues = {
  id?: number | string | null;
  sku: string | null;
  name: string;
  description: string;
  type: string | null;
  costPrice?: number | null;
  manualSalePrice?: number | null;
  purchaseTaxId?: number | null;
  categoryId?: number | null;
  customerId?: number | null;
  supplierId?: number | null;
  stockTrackingEnabled?: boolean;
  batchTrackingEnabled?: boolean;
  // search-only ranges + component criteria
  costPriceMin?: number | null;
  costPriceMax?: number | null;
  manualSalePriceMin?: number | null;
  manualSalePriceMax?: number | null;
  componentChildSku?: string | null;
  componentChildName?: string | null;
  componentChildSupplierId?: number | null;
  componentChildType?: string | null;
};

// Build defaults for edit + find modes
export function buildProductEditDefaults(p: any): ProductFindFormValues {
  return {
    id: p.id,
    sku: p.sku || "",
    name: p.name || "",
    description: p.description || "",
    type: p.type || "",
    costPrice: p.costPrice ?? undefined,
    manualSalePrice: p.manualSalePrice ?? undefined,
    purchaseTaxId: p.purchaseTaxId ?? p.purchaseTax?.id ?? undefined,
    categoryId: p.categoryId ?? p.category?.id ?? undefined,
    customerId: p.customerId ?? p.customer?.id ?? null,
    supplierId: p.supplierId ?? p.supplier?.id ?? null,
    stockTrackingEnabled: !!p.stockTrackingEnabled,
    batchTrackingEnabled: !!p.batchTrackingEnabled,
  };
}

export function buildProductFindDefaults(): ProductFindFormValues {
  return {
    id: undefined,
    sku: "",
    name: "",
    description: "",
    type: "",
    costPrice: undefined,
    manualSalePrice: undefined,
    purchaseTaxId: undefined,
    categoryId: undefined,
    customerId: undefined,
    supplierId: undefined,
    stockTrackingEnabled: undefined,
    batchTrackingEnabled: undefined,
    costPriceMin: undefined,
    costPriceMax: undefined,
    manualSalePriceMin: undefined,
    manualSalePriceMax: undefined,
    componentChildSku: undefined,
    componentChildName: undefined,
    componentChildSupplierId: undefined,
    componentChildType: undefined,
  };
}

export function useProductFindify(product: any, nav?: { state: string }) {
  const { mode } = useFind();
  const { editForm, findForm, enterFind, exitFind, toggleFind } =
    useBaseFindify<ProductFindFormValues, ProductFindFormValues>({
      buildEditDefaults: buildProductEditDefaults,
      buildFindDefaults: buildProductFindDefaults,
      record: product,
      navState: nav?.state,
    });

  const buildUpdatePayload = useCallback((values: ProductFindFormValues) => {
    const fd = new FormData();
    fd.set("_intent", "update");
    if (values.sku != null) fd.set("sku", values.sku);
    if (values.name) fd.set("name", values.name);
    if (values.description) fd.set("description", values.description);
    if (values.type) fd.set("type", values.type);
    if (values.costPrice != null) fd.set("costPrice", String(values.costPrice));
    if (values.manualSalePrice != null)
      fd.set("manualSalePrice", String(values.manualSalePrice));
    if (values.purchaseTaxId != null)
      fd.set("purchaseTaxId", String(values.purchaseTaxId));
    if (values.categoryId != null)
      fd.set("categoryId", String(values.categoryId));
    if (values.customerId != null)
      fd.set("customerId", String(values.customerId));
    if (values.supplierId != null)
      fd.set("supplierId", String(values.supplierId));
    fd.set(
      "stockTrackingEnabled",
      values.stockTrackingEnabled ? "true" : "false"
    );
    fd.set(
      "batchTrackingEnabled",
      values.batchTrackingEnabled ? "true" : "false"
    );
    return fd;
  }, []);

  const buildFindPayload = useCallback((values: ProductFindFormValues) => {
    const fd = new FormData();
    fd.set("_intent", "find");
    const put = (k: string, val: any) => {
      if (val === undefined || val === null || val === "") return;
      fd.set(k, String(val));
    };
    put("id", values.id);
    put("sku", values.sku);
    put("name", values.name);
    put("description", values.description);
    put("type", values.type);
    put("costPriceMin", values.costPriceMin);
    put("costPriceMax", values.costPriceMax);
    put("manualSalePriceMin", values.manualSalePriceMin);
    put("manualSalePriceMax", values.manualSalePriceMax);
    put("purchaseTaxId", values.purchaseTaxId);
    put("categoryId", values.categoryId);
    put("customerId", values.customerId);
    put("supplierId", values.supplierId);
    if (values.stockTrackingEnabled === true)
      fd.set("stockTrackingEnabled", "true");
    if (values.stockTrackingEnabled === false)
      fd.set("stockTrackingEnabled", "false");
    if (values.batchTrackingEnabled === true)
      fd.set("batchTrackingEnabled", "true");
    if (values.batchTrackingEnabled === false)
      fd.set("batchTrackingEnabled", "false");
    put("componentChildSku", values.componentChildSku);
    put("componentChildName", values.componentChildName);
    put("componentChildSupplierId", values.componentChildSupplierId);
    put("componentChildType", values.componentChildType);
    return fd;
  }, []);

  const activeForm = mode === "find" ? findForm : editForm;
  return {
    editForm,
    findForm,
    activeForm,
    mode,
    enterFind,
    exitFind,
    toggleFind,
    buildUpdatePayload,
    buildFindPayload,
  };
}
