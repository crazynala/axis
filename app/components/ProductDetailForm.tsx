import React from "react";
import {
  Card,
  Divider,
  Grid,
  SimpleGrid,
  Stack,
  Title,
  Group,
  Badge,
} from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { RenderGroup } from "../formConfigs/fieldConfigShared";
import { getGlobalOptions, type OptionsData } from "../options/OptionsClient";
import {
  productIdentityFields,
  productAssocFields,
  productPricingFields,
} from "../formConfigs/productDetail";

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
  categoryOptions,
  taxCodeOptions,
}: ProductDetailFormProps) {
  console.log("!! form values:", form.getValues());
  const mergedVals = { ...(product || {}), ...form.getValues() };
  // pull global options if not provided
  const global: Partial<OptionsData> = getGlobalOptions() || {};

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 12 }}>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Card withBorder padding="md">
            <RenderGroup
              form={form as any}
              fields={productIdentityFields as any}
              mode={mode as any}
            />
          </Card>
          <Card withBorder padding="md">
            <RenderGroup
              form={form as any}
              fields={productAssocFields as any}
              mode={mode as any}
            />
          </Card>
          <Card withBorder padding="md">
            <RenderGroup
              form={form as any}
              fields={productPricingFields as any}
              mode={mode as any}
            />
          </Card>
        </SimpleGrid>
      </Grid.Col>
    </Grid>
  );
}
