import React from "react";
import { Card, Grid, SimpleGrid, Center } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { RenderGroup } from "../../../base/forms/fieldConfigShared";
import {
  getGlobalOptions,
  type OptionsData,
} from "../../../base/options/OptionsClient";
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
  taxCodeOptions?: { value: string; label: string }[];
};

export function ProductDetailForm({
  mode,
  form,
  product,
}: ProductDetailFormProps) {
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

  const ctx = React.useMemo(
    () => ({
      hasCostTiers,
      openCostTiersModal: () => setTiersOpen(true),
      product: product || {},
      customer: product?.customer || {},
      options: getGlobalOptions() || undefined,
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
      salePriceGroupRangesById,
      costGroupRangesById,
      pricingPrefs.qty,
      pricingPrefs.priceMultiplier,
      pricingPrefs.preview,
      pricingPrefs.customerId,
      pricingPrefs.margins,
      costPriceLocked,
    ]
  );

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 12 }}>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Card withBorder padding="md">
            <RenderGroup
              form={form as any}
              fields={productIdentityFields as any}
              mode={mode as any}
              ctx={ctx as any}
            />
          </Card>
          <Card withBorder padding="md">
            <RenderGroup
              form={form as any}
              fields={productAssocFields as any}
              mode={mode as any}
              ctx={ctx as any}
            />
          </Card>
          <Card withBorder padding="md">
            <RenderGroup
              form={form as any}
              fields={productPricingFields as any}
              mode={mode as any}
              ctx={ctx as any}
            />
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
