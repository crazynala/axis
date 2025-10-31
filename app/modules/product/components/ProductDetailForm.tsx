import React from "react";
import { Card, Grid, SimpleGrid } from "@mantine/core";
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
    }),
    [hasCostTiers, product, salePriceGroupRangesById, costGroupRangesById]
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
