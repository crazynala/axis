import React from "react";
import { Card, Divider, Stack, Title, Group, Badge } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { RenderGroup } from "../formConfigs/fieldConfigShared";
import { expenseMainFields } from "../formConfigs/expenseDetail";

export interface ExpenseDetailFormProps {
  mode: "edit" | "find";
  form: UseFormReturn<any>;
  expense?: any;
}

export function ExpenseDetailForm({
  mode,
  form,
  expense,
}: ExpenseDetailFormProps) {
  const merged = { ...(expense || {}), ...form.getValues() };
  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>Expense</Title>
        </Group>
      </Card.Section>
      <Divider my="xs" />
      <Stack gap={6}>
        <RenderGroup
          form={form as any}
          fields={expenseMainFields as any}
          mode={mode as any}
        />
      </Stack>
    </Card>
  );
}
