import React from "react";
import { Card, Divider, Stack, Title, Group, SimpleGrid } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import {
  RenderGroup,
  type RenderContext,
} from "../../../base/forms/fieldConfigShared";
import {
  shipmentInfoFields,
  shipmentDetailFields,
  shipmentAddressFields,
} from "../forms/shipmentDetail";

export interface ShipmentDetailFormProps {
  mode: "edit" | "find" | "create";
  form: UseFormReturn<any>;
  shipment?: any;
  fieldCtx?: RenderContext;
}

export function ShipmentDetailForm({
  mode,
  form,
  fieldCtx,
}: ShipmentDetailFormProps) {
  return (
    <SimpleGrid cols={3}>
      <Card withBorder padding="md">
        <RenderGroup
          form={form as any}
          fields={shipmentInfoFields as any}
          mode={mode as any}
          ctx={fieldCtx}
        />
      </Card>
      <Card withBorder padding="md">
        <RenderGroup
          form={form as any}
          fields={shipmentAddressFields as any}
          mode={mode as any}
          ctx={fieldCtx}
        />
      </Card>
      <Card withBorder padding="md">
        <RenderGroup
          form={form as any}
          fields={shipmentDetailFields as any}
          mode={mode as any}
          ctx={fieldCtx}
        />
      </Card>
    </SimpleGrid>
  );
}
