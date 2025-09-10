import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

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
  const editForm = useForm<ProductFindFormValues>({ defaultValues: buildProductEditDefaults(product) });
  const findForm = useForm<ProductFindFormValues>({ defaultValues: buildProductFindDefaults() });
  const [mode, setMode] = useState<"edit" | "find">("edit");
  const [style, setStyle] = useState<"tint" | "dotted" | "accent" | "criteria">("tint");
  const wasSubmitting = useRef(false);

  // reset edit form when product id changes (navigation) & auto-exit find
  useEffect(() => {
    editForm.reset(buildProductEditDefaults(product));
    // on record change leave find mode (safety)
    setMode("edit");
  }, [product.id]);

  // dataset attributes for global styling
  useEffect(() => {
    try {
      const el = document.documentElement;
      el.dataset.mode = mode;
      if (mode === "find") {
        el.dataset.findMode = "true";
        el.dataset.findStyle = style;
      } else {
        delete el.dataset.findMode;
        delete el.dataset.findStyle;
      }
      return () => {
        delete el.dataset.mode;
      };
    } catch {}
  }, [mode, style]);

  // auto-exit after navigation completes (search result loaded)
  useEffect(() => {
    if (!nav) return;
    const submitting = nav.state !== "idle";
    if (mode === "find") {
      if (!wasSubmitting.current && submitting) wasSubmitting.current = true;
      if (wasSubmitting.current && !submitting) {
        setMode("edit");
        wasSubmitting.current = false;
      }
    } else if (!submitting) {
      wasSubmitting.current = false;
    }
  }, [nav?.state, mode]);

  // gating: only allow entering find when edit form not dirty
  const enterFind = useCallback(() => {
    if (editForm.formState.isDirty) {
      window.alert("Save or discard changes before entering Find mode.");
      return false;
    }
    findForm.reset(buildProductFindDefaults());
    setMode("find");
    return true;
  }, [editForm.formState.isDirty, findForm]);
  const exitFind = useCallback(() => setMode("edit"), []);
  const toggleFind = useCallback(() => {
    if (mode === "find") return exitFind();
    enterFind();
  }, [mode, enterFind, exitFind]);

  const buildUpdatePayload = useCallback((values: ProductFindFormValues) => {
    const fd = new FormData();
    fd.set("_intent", "update");
    if (values.sku != null) fd.set("sku", values.sku);
    if (values.name) fd.set("name", values.name);
    if (values.description) fd.set("description", values.description);
    if (values.type) fd.set("type", values.type);
    if (values.costPrice != null) fd.set("costPrice", String(values.costPrice));
    if (values.manualSalePrice != null) fd.set("manualSalePrice", String(values.manualSalePrice));
    if (values.purchaseTaxId != null) fd.set("purchaseTaxId", String(values.purchaseTaxId));
    if (values.categoryId != null) fd.set("categoryId", String(values.categoryId));
    if (values.customerId != null) fd.set("customerId", String(values.customerId));
    if (values.supplierId != null) fd.set("supplierId", String(values.supplierId));
    fd.set("stockTrackingEnabled", values.stockTrackingEnabled ? "true" : "false");
    fd.set("batchTrackingEnabled", values.batchTrackingEnabled ? "true" : "false");
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
    if (values.stockTrackingEnabled === true) fd.set("stockTrackingEnabled", "true");
    if (values.stockTrackingEnabled === false) fd.set("stockTrackingEnabled", "false");
    if (values.batchTrackingEnabled === true) fd.set("batchTrackingEnabled", "true");
    if (values.batchTrackingEnabled === false) fd.set("batchTrackingEnabled", "false");
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
    style,
    setStyle,
    setMode,
    enterFind,
    exitFind,
    toggleFind,
    buildUpdatePayload,
    buildFindPayload,
  };
}
