import React from "react";
import { Card, Divider, Stack, Title, Group, Badge } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { renderField } from "../formConfigs/fieldConfigShared";
import { invoiceMainFields } from "../formConfigs/invoiceDetail";

export interface InvoiceDetailFormProps {
  mode: "edit" | "find";
  form: UseFormReturn<any>;
  invoice?: any;
  customerOptions?: { value: string; label: string }[]; // for customer picker
}

export function InvoiceDetailForm({ mode, form, invoice, customerOptions }: InvoiceDetailFormProps) {
  const merged = { ...(invoice || {}), ...form.getValues() };
  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>Invoice</Title>
        </Group>
      </Card.Section>
      <Divider my="xs" />
      <Stack gap={6}>
        {invoiceMainFields.map((f) => (
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
