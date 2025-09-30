import React from "react";
import { Card, Divider, Stack, Title, Group, Badge } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { RenderGroup } from "~/base/forms/fieldConfigShared";
import { invoiceMainFields } from "./invoiceDetail";

export interface InvoiceDetailFormProps {
  mode: "edit" | "find" | "create";
  form: UseFormReturn<any>;
  invoice?: any;
  customerOptions?: { value: string; label: string }[]; // for customer picker
}

export function InvoiceDetailForm({ mode, form }: InvoiceDetailFormProps) {
  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>Invoice</Title>
        </Group>
      </Card.Section>
      <Divider my="xs" />
      <Stack gap={6}>
        <RenderGroup
          form={form as any}
          fields={invoiceMainFields as any}
          mode={mode as any}
        />
      </Stack>
    </Card>
  );
}
