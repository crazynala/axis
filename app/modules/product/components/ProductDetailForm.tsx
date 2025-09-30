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
  const hasCostTiers = React.useMemo(() => {
    const ranges = (product?.costGroup?.costRanges || []) as any[];
    return Array.isArray(ranges) && ranges.length > 1;
  }, [product]);
  const ctx = React.useMemo(
    () => ({
      hasCostTiers,
      openCostTiersModal: () => setTiersOpen(true),
    }),
    [hasCostTiers]
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
