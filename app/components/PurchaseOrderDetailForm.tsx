import React from "react";
import { Card, Divider, Stack, Title, Group, Badge } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { renderField } from "../formConfigs/fieldConfigShared";
import { purchaseOrderMainFields } from "../formConfigs/purchaseOrderDetail";

export interface PurchaseOrderDetailFormProps {
  mode: "edit" | "find";
  form: UseFormReturn<any>;
  purchaseOrder?: any;
  customerOptions?: { value: string; label: string }[];
}

export function PurchaseOrderDetailForm({ mode, form, purchaseOrder, customerOptions }: PurchaseOrderDetailFormProps) {
  const merged = { ...(purchaseOrder || {}), ...form.getValues() };
  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>Purchase Order</Title>
        </Group>
      </Card.Section>
      <Divider my="xs" />
      <Stack gap={6}>
        {purchaseOrderMainFields.map((f) => (
          <React.Fragment key={f.name}>
            {renderField(form as any, f, mode as any, merged, {
              customerOptions,
            })}
          </React.Fragment>
        ))}
      </Stack>
    </Card>
  );
}
