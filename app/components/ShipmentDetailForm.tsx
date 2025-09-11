import React from "react";
import { Card, Divider, Stack, Title, Group, Badge } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { renderField } from "../formConfigs/fieldConfigShared";
import { shipmentMainFields } from "../formConfigs/shipmentDetail";

export interface ShipmentDetailFormProps {
  mode: "edit" | "find";
  form: UseFormReturn<any>;
  shipment?: any;
}

export function ShipmentDetailForm({ mode, form, shipment }: ShipmentDetailFormProps) {
  const merged = { ...(shipment || {}), ...form.getValues() };
  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>Shipment</Title>
        </Group>
      </Card.Section>
      <Divider my="xs" />
      <Stack gap={6}>
        {shipmentMainFields.map((f) => (
          <React.Fragment key={f.name}>{renderField(form as any, f, mode as any, merged)}</React.Fragment>
        ))}
      </Stack>
    </Card>
  );
}
