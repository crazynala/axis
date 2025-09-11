import React from "react";
import { Card, Divider, Grid, SimpleGrid, Stack, Title, Group, Badge } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { renderField } from "../formConfigs/fieldConfigShared";
import { productIdentityFields, productAssocFields, productPricingFields } from "../formConfigs/productDetail";

export type ProductDetailFormProps = {
  mode: "edit" | "find";
  form: UseFormReturn<any>;
  product?: any; // initial product record when editing
  categoryOptions?: { value: string; label: string }[];
  taxCodeOptions?: { value: string; label: string }[];
};

export function ProductDetailForm({ mode, form, product, categoryOptions, taxCodeOptions }: ProductDetailFormProps) {
  const mergedVals = { ...(product || {}), ...form.getValues() };
  const renderGroup = (fields: any[]) => (
    <Stack gap={6}>
      {fields.map((f) => (
        <React.Fragment key={f.name}>
          {renderField(form as any, f, mode as any, mergedVals, {
            categoryOptions,
            taxCodeOptions,
          })}
        </React.Fragment>
      ))}
    </Stack>
  );

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 12 }}>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center">
                <Title order={4}>Identity</Title>
              </Group>
            </Card.Section>
            <Divider my="xs" />
            {renderGroup(productIdentityFields)}
          </Card>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Title order={4}>Associations</Title>
            </Card.Section>
            <Divider my="xs" />
            {renderGroup(productAssocFields)}
          </Card>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Title order={4}>Pricing</Title>
            </Card.Section>
            <Divider my="xs" />
            {renderGroup(productPricingFields)}
          </Card>
        </SimpleGrid>
      </Grid.Col>
    </Grid>
  );
}
