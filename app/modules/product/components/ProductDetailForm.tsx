import React from "react";
import { Card, Grid, SimpleGrid, Center } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { RenderGroup } from "../../../base/forms/fieldConfigShared";
import {
  getGlobalOptions,
  type OptionsData,
} from "../../../base/options/OptionsClient";
import {
  deriveExternalStepTypeFromCategoryCode,
  rulesForType,
} from "../rules/productTypeRules";
import { useOptions } from "~/base/options/OptionsContext";
import {
  productIdentityFields,
  productAssocFields,
  productPricingFields,
} from "../forms/productDetail";
import { ProductCostTiersModal } from "../components/ProductCostTiersModal";
import { PricingPreviewWidget } from "./PricingPreviewWidget";

export type ProductDetailFormProps = {
  mode: "edit" | "find" | "create";
  form: UseFormReturn<any>;
  product?: any; // initial product record when editing
  categoryOptions?: { value: string; label: string }[];
  subcategoryOptions?: { value: string; label: string }[];
  taxCodeOptions?: { value: string; label: string }[];
  templateOptions?: { value: string; label: string }[];
  requireTemplate?: boolean;
  hideTemplateField?: boolean;
  templateDefs?: Record<
    string,
    {
      id: number;
      code: string;
      label: string | null;
      productType: string;
      defaultCategoryId: number | null;
      defaultSubCategoryId: number | null;
      defaultExternalStepType?: string | null;
      requiresSupplier?: boolean | null;
      requiresCustomer?: boolean | null;
      defaultStockTracking?: boolean | null;
      defaultBatchTracking?: boolean | null;
      skuSeriesKey?: string | null;
    }
  >;
};

export function ProductDetailForm({
  mode,
  form,
  product,
  categoryOptions,
  subcategoryOptions,
  templateOptions,
  templateDefs,
  requireTemplate = false,
  hideTemplateField,
}: ProductDetailFormProps) {
  const optionsCtx = useOptions();
  const [tiersOpen, setTiersOpen] = React.useState(false);
  // Live pricing prefs from the PricingPreviewWidget (qty + customer multiplier)
  function usePricingPrefsFromWidget() {
    const [qty, setQty] = React.useState<number>(() => {
      if (typeof window === "undefined") return 60;
      const raw = window.sessionStorage.getItem("pricing.qty");
      const n = raw ? Number(raw) : 60;
      return Number.isFinite(n) ? n : 60;
    });
    const [customerId, setCustomerId] = React.useState<string | null>(() => {
      if (typeof window === "undefined") return null;
      return window.sessionStorage.getItem("pricing.customerId");
    });
    const [priceMultiplier, setPriceMultiplier] = React.useState<number>(() => {
      if (typeof window === "undefined") return 1;
      const raw = window.sessionStorage.getItem("pricing.mult");
      const n = raw ? Number(raw) : 1;
      return Number.isFinite(n) ? n : 1;
    });
    const [preview, setPreview] = React.useState<any>(() => {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.sessionStorage.getItem("pricing.preview");
        return raw ? JSON.parse(raw) : null;
      } catch {}
      return null;
    });
    const [margins, setMargins] = React.useState<{
      marginOverride?: number | null;
      vendorDefaultMargin?: number | null;
      globalDefaultMargin?: number | null;
    } | null>(() => {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.sessionStorage.getItem("pricing.margins");
        return raw ? JSON.parse(raw) : null;
      } catch {}
      return null;
    });
    React.useEffect(() => {
      if (typeof window === "undefined") return;
      const handler = (e: any) => {
        const det = e?.detail || {};
        if (det.qty != null) {
          const q = Number(det.qty);
          setQty(Number.isFinite(q) ? q : 60);
        }
        if (det.customerId != null) {
          setCustomerId(String(det.customerId));
        }
        if (det.priceMultiplier != null) {
          const m = Number(det.priceMultiplier);
          setPriceMultiplier(Number.isFinite(m) ? m : 1);
        }
        if (det.margins != null) {
          setMargins(det.margins);
        }
      };
      window.addEventListener("pricing:prefs", handler as any);
      const onPreview = (e: any) => setPreview(e?.detail ?? null);
      window.addEventListener("pricing:preview", onPreview as any);
      return () => {
        window.removeEventListener("pricing:prefs", handler as any);
        window.removeEventListener("pricing:preview", onPreview as any);
      };
    }, []);
    return { qty, customerId, priceMultiplier, preview, margins } as const;
  }
  // Local caches for on-demand loaded ranges keyed by group id
  const [salePriceGroupRangesById, setSalePriceGroupRangesById] =
    React.useState<
      Record<string, Array<{ minQty: number; unitPrice: number }>>
    >({});
  const [costGroupRangesById, setCostGroupRangesById] = React.useState<
    Record<
      string,
      Array<{ minQty: number; unitCost: number; unitSellManual: number }>
    >
  >({});

  // Seed caches from loaded product baseline (does not change after mount)
  React.useEffect(() => {
    const nextSale: Record<
      string,
      Array<{ minQty: number; unitPrice: number }>
    > = {};
    const spgId = product?.salePriceGroupId ?? product?.salePriceGroup?.id;
    const saleRanges = (product?.salePriceGroup?.saleRanges || []) as any[];
    if (spgId && Array.isArray(saleRanges) && saleRanges.length) {
      nextSale[String(spgId)] = saleRanges
        .filter((r: any) => r && r.rangeFrom != null && r.price != null)
        .map((r: any) => ({
          minQty: Number(r.rangeFrom) || 0,
          unitPrice: Number(r.price) || 0,
        }))
        .sort((a, b) => a.minQty - b.minQty);
    }
    const nextCost: Record<
      string,
      Array<{ minQty: number; unitCost: number; unitSellManual: number }>
    > = {};
    const cgId = product?.costGroupId ?? product?.costGroup?.id;
    const costRanges = (product?.costGroup?.costRanges || []) as any[];
    if (cgId && Array.isArray(costRanges) && costRanges.length) {
      nextCost[String(cgId)] = costRanges
        .filter((r: any) => r && r.rangeFrom != null)
        .map((r: any) => ({
          minQty: Number(r.rangeFrom) || 0,
          unitCost: Number(r.costPrice ?? 0) || 0,
          unitSellManual: Number(r.sellPriceManual ?? 0) || 0,
        }))
        .sort((a, b) => a.minQty - b.minQty);
    }
    if (Object.keys(nextSale).length)
      setSalePriceGroupRangesById((prev) => ({ ...prev, ...nextSale }));
    if (Object.keys(nextCost).length)
      setCostGroupRangesById((prev) => ({ ...prev, ...nextCost }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // Watch form fields for changes and fetch ranges on demand
  const watchedSaleGroupId = form.watch("salePriceGroupId") as unknown as
    | number
    | string
    | undefined;
  const watchedCostGroupId = (form as any).watch?.("costGroupId") as
    | number
    | string
    | undefined;
  const costPriceLocked = React.useMemo(() => {
    if (mode === "find") return false;
    const raw =
      watchedCostGroupId != null && watchedCostGroupId !== ""
        ? watchedCostGroupId
        : product?.costGroupId;
    if (raw == null || raw === "") return false;
    const num = Number(raw);
    if (Number.isFinite(num)) return num > 0;
    return true;
  }, [mode, watchedCostGroupId, product?.costGroupId]);

  React.useEffect(() => {
    const id = watchedSaleGroupId != null ? Number(watchedSaleGroupId) : NaN;
    if (!Number.isFinite(id) || id <= 0) return;
    const key = String(id);
    if (salePriceGroupRangesById[key]) return; // already cached
    let abort = false;
    (async () => {
      try {
        const res = await fetch(`/api/sale-price-groups/${id}/ranges`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          ranges?: Array<{ minQty: number; unitPrice: number }>;
        };
        if (!abort && data?.ranges) {
          setSalePriceGroupRangesById((prev) => ({
            ...prev,
            [key]: data.ranges!,
          }));
        }
      } catch {}
    })();
    return () => {
      abort = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedSaleGroupId]);

  React.useEffect(() => {
    const id = watchedCostGroupId != null ? Number(watchedCostGroupId) : NaN;
    if (!Number.isFinite(id) || id <= 0) return;
    const key = String(id);
    if (costGroupRangesById[key]) return; // already cached
    let abort = false;
    (async () => {
      try {
        const res = await fetch(`/api/cost-groups/${id}/ranges`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          ranges?: Array<{
            minQty: number;
            unitCost: number;
            unitSellManual: number;
          }>;
        };
        if (!abort && data?.ranges) {
          setCostGroupRangesById((prev) => ({ ...prev, [key]: data.ranges! }));
        }
      } catch {}
    })();
    return () => {
      abort = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCostGroupId]);

  const hasCostTiers = React.useMemo(() => {
    const ranges = (product?.costGroup?.costRanges || []) as any[];
    if (Array.isArray(ranges) && ranges.length > 1) return true;
    const cid = watchedCostGroupId != null ? String(watchedCostGroupId) : null;
    const fetched = cid ? costGroupRangesById[cid] || [] : [];
    return fetched.length > 1;
  }, [product, watchedCostGroupId, costGroupRangesById]);
  const pricingPrefs = usePricingPrefsFromWidget();
  const templateId = form.watch("templateId");
  const template =
    templateId && templateDefs ? templateDefs[String(templateId)] : null;
  const needsTemplate = Boolean(requireTemplate && !template);
  const typeValue = form.watch("type");
  const categoryId = form.watch("categoryId");
  const externalStepValue = form.watch("externalStepType");
  const globalOptions = getGlobalOptions();
  const categoryMetaById =
    categoryOptions?.length || optionsCtx?.categoryMetaById
      ? optionsCtx?.categoryMetaById || globalOptions?.categoryMetaById
      : globalOptions?.categoryMetaById;
  const filteredCategoryOptions = React.useMemo(() => {
    const rules = rulesForType(typeValue);
    const group = (rules.categoryGroupCode || "").toUpperCase();
    const grouped =
      optionsCtx?.categoryOptionsByGroupCode ||
      globalOptions?.categoryOptionsByGroupCode ||
      null;
    if (grouped && group && grouped[group]?.length) {
      return grouped[group];
    }
    const opts =
      categoryOptions ||
      optionsCtx?.categoryOptions ||
      globalOptions?.categoryOptions ||
      [];
    const meta =
      categoryMetaById ||
      globalOptions?.categoryMetaById ||
      {};
    console.log("[product form] category meta available", {
      fromCtx: !!optionsCtx?.categoryMetaById,
      fromGlobal: !!globalOptions?.categoryMetaById,
      metaKeys: Object.keys(meta || {}).length,
    });
    if (!group) return opts;
    const filtered = opts.filter((o) => {
      const m = meta[String(o.value)];
      const parent = (m?.parentCode || "").toUpperCase();
      return parent === group.toUpperCase();
    });
    console.log("[product form] category filter", {
      typeValue,
      group,
      opts: opts.length,
      filtered: filtered.length,
    });
    return filtered;
  }, [categoryOptions, categoryMetaById, typeValue]);

  React.useEffect(() => {
    if (!template || !requireTemplate) return;
    form.setValue("type", template.productType, { shouldDirty: true });
    if (template.defaultCategoryId) {
      form.setValue("categoryId", template.defaultCategoryId, {
        shouldDirty: true,
      });
    }
    if (template.defaultSubCategoryId) {
      form.setValue("subCategoryId", template.defaultSubCategoryId, {
        shouldDirty: true,
      });
    } else {
      form.setValue("subCategoryId", "", { shouldDirty: true });
    }
    form.setValue(
      "stockTrackingEnabled",
      template.defaultStockTracking ?? false,
      { shouldDirty: true }
    );
      form.setValue("batchTrackingEnabled", template.defaultBatchTracking ?? false, {
        shouldDirty: true,
      });
    if (template.defaultExternalStepType) {
      form.setValue("externalStepType", template.defaultExternalStepType, {
        shouldDirty: true,
      });
    }
  }, [template, form, requireTemplate]);

  React.useEffect(() => {
    const isService = String(typeValue || "").toUpperCase() === "SERVICE";
    if (!isService) {
      form.setValue("externalStepType", null, { shouldDirty: true });
      return;
    }
    const meta = categoryMetaById?.[String(categoryId)];
    const implied = deriveExternalStepTypeFromCategoryCode(meta?.code);
    console.log("[product form] external step derive", {
      typeValue,
      categoryId,
      meta,
      implied,
      current: form.getValues("externalStepType"),
    });
    const current = form.getValues("externalStepType");
    if (implied && current !== implied) {
      form.setValue("externalStepType", implied, { shouldDirty: true });
    } else if (!implied && current) {
      form.setValue("externalStepType", null, { shouldDirty: true });
    }
  }, [typeValue, categoryId, categoryMetaById, form]);

  const ctx = React.useMemo(
    () => ({
      hasCostTiers,
      openCostTiersModal: () => setTiersOpen(true),
      product: product || {},
      customer: product?.customer || {},
      options: globalOptions
        ? { ...globalOptions, categoryOptions: filteredCategoryOptions }
        : optionsCtx
        ? { ...optionsCtx, categoryOptions: filteredCategoryOptions }
        : undefined,
      fieldOptions: {
        category: filteredCategoryOptions,
        subcategory:
          subcategoryOptions ||
          optionsCtx?.subcategoryOptions ||
          getGlobalOptions()?.subcategoryOptions ||
          [],
        productTemplate:
          templateOptions ||
          getGlobalOptions()?.productTemplateOptions?.map((t) => ({
            value: t.value,
            label: t.label,
          })) ||
          [],
      },
      // Provide dynamic ranges caches for computeDefault and previews
      salePriceGroupRangesById,
      costGroupRangesById,
      // Live pricing prefs from widget
      pricingQty: pricingPrefs.qty,
      priceMultiplier: pricingPrefs.priceMultiplier,
      pricingPreview: pricingPrefs.preview,
      pricingCustomerId: pricingPrefs.customerId,
      pricingMarginDefaults: pricingPrefs.margins,
      costPriceLocked,
    }),
    [
      hasCostTiers,
      product,
      categoryOptions,
      subcategoryOptions,
      salePriceGroupRangesById,
      costGroupRangesById,
      pricingPrefs.qty,
      pricingPrefs.priceMultiplier,
      pricingPrefs.preview,
      pricingPrefs.customerId,
      pricingPrefs.margins,
      costPriceLocked,
      templateOptions,
    ]
  );

  return (
    <Grid>
      <input
        type="hidden"
        name="externalStepType"
        value={externalStepValue ?? ""}
        data-debug="externalStepType-hidden"
      />
      <Grid.Col span={{ base: 12, md: 12 }}>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Card withBorder padding="md">
            <RenderGroup
              form={form as any}
              fields={
                hideTemplateField
                  ? (productIdentityFields.filter(
                      (f) => f.name !== "templateId"
                    ) as any)
                  : (productIdentityFields as any)
              }
              mode={mode as any}
              ctx={ctx as any}
            />
          </Card>
          <Card withBorder padding="md">
            {needsTemplate ? (
              <Center mih={120}>Please select a template to continue.</Center>
            ) : (
              <RenderGroup
                form={form as any}
                fields={productAssocFields as any}
                mode={mode as any}
                ctx={ctx as any}
              />
            )}
          </Card>
          <Card withBorder padding="md">
            {needsTemplate ? null : (
              <RenderGroup
                form={form as any}
                fields={productPricingFields as any}
                mode={mode as any}
                ctx={ctx as any}
              />
            )}
            {product?.id ? (
              <Card.Section bg="dark.6" py={5} mt="xs">
                <Center>
                  <PricingPreviewWidget
                    productId={product.id}
                    vendorId={product?.supplierId ?? null}
                  />
                </Center>
              </Card.Section>
            ) : null}
          </Card>
        </SimpleGrid>
      </Grid.Col>
      <ProductCostTiersModal
        productId={product?.id}
        opened={tiersOpen}
        onClose={() => setTiersOpen(false)}
      />
    </Grid>
  );
}
