import { useCallback } from "react";
import { useBaseFindify } from "~/base/find/baseFindify";
import { useFind } from "~/base/find/FindContext";

export type ProductFindFormValues = {
  id?: number | string | null;
  sku: string | null;
  name: string;
  description: string;
  type: string | null;
  costPrice?: number | null;
  manualSalePrice?: number | null;
  manualMargin?: number | null;
  purchaseTaxId?: number | null;
  categoryId?: number | null;
  customerId?: number | null;
  supplierId?: number | null;
  costGroupId?: number | null;
  stockTrackingEnabled?: boolean;
  batchTrackingEnabled?: boolean;
  variantSetId?: number | null;
  whiteboard?: string | null;
  flagIsDisabled?: boolean;
  leadTimeDays?: number | string | null;
  // tags
  tagNames?: string[];
  pricingGroupId?: number | null;
  salePriceGroupId?: number | null;
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
    costPrice: p.costPrice,
    manualSalePrice: p.manualSalePrice,
    manualMargin: p.manualMargin,
    purchaseTaxId: p.purchaseTaxId,
    categoryId: p.categoryId,
    customerId: p.customerId,
    supplierId: p.supplierId,
    variantSetId: p.variantSetId,
    costGroupId: p.costGroupId,
    salePriceGroupId: p.salePriceGroupId,
    stockTrackingEnabled: !!p.stockTrackingEnabled,
    batchTrackingEnabled: !!p.batchTrackingEnabled,
    whiteboard: p.whiteboard || "",
    flagIsDisabled: !!p.flagIsDisabled,
    leadTimeDays:
      p.leadTimeDays != null && !Number.isNaN(Number(p.leadTimeDays))
        ? Number(p.leadTimeDays)
        : null,
    tagNames: (p.productTags || [])
      .map((pt: any) => pt?.tag?.name)
      .filter(Boolean) as string[],
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
    manualMargin: undefined,
    purchaseTaxId: undefined,
    categoryId: undefined,
    customerId: undefined,
    supplierId: undefined,
    stockTrackingEnabled: undefined,
    batchTrackingEnabled: undefined,
    whiteboard: "",
    flagIsDisabled: false,
    leadTimeDays: undefined,
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

    // Encode null/undefined as empty string so the action sets null
    const put = (k: string, v: unknown) =>
      fd.set(k, v == null ? "" : String(v));

    // strings
    put("sku", values.sku);
    put("name", values.name);
    put("description", values.description);
    put("type", values.type);

    // numbers (allow 0; clear with "")
    put("costPrice", values.costPrice);
    put("manualSalePrice", values.manualSalePrice);
    put("manualMargin", values.manualMargin);
    put("purchaseTaxId", values.purchaseTaxId);
    put("categoryId", values.categoryId);
    put("customerId", values.customerId);
    put("supplierId", values.supplierId);
    put("costGroupId", values.costGroupId);
    put("salePriceGroupId", values.salePriceGroupId);
    put("whiteboard", values.whiteboard);
    put("leadTimeDays", values.leadTimeDays);
    fd.set(
      "flagIsDisabled",
      values.flagIsDisabled ? "true" : "false"
    );

    // booleans (always send explicit true/false)
    fd.set(
      "stockTrackingEnabled",
      values.stockTrackingEnabled ? "true" : "false"
    );
    fd.set(
      "batchTrackingEnabled",
      values.batchTrackingEnabled ? "true" : "false"
    );

    // tags: send JSON array of names
    try {
      const tags = Array.isArray(values.tagNames) ? values.tagNames : [];
      fd.set("tagNames", JSON.stringify(tags));
    } catch {
      // ignore
    }

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
