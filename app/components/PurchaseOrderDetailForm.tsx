import React from "react";
import { Card, Divider, Stack, Title, Group, Badge } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { RenderGroup } from "../formConfigs/fieldConfigShared";
import { purchaseOrderMainFields } from "../formConfigs/purchaseOrderDetail";

export interface PurchaseOrderDetailFormProps {
  mode: "edit" | "find" | "create";
  form: UseFormReturn<any>;
  purchaseOrder?: any;
  customerOptions?: { value: string; label: string }[];
}

export function PurchaseOrderDetailForm({
  mode,
  form,
}: PurchaseOrderDetailFormProps) {
  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>Purchase Order</Title>
        </Group>
      </Card.Section>
      <Divider my="xs" />
      <Stack gap={6}>
        <RenderGroup
          form={form as any}
          fields={purchaseOrderMainFields as any}
          mode={mode as any}
        />
      </Stack>
    </Card>
  );
}
