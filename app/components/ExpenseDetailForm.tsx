import React from "react";
import { Card, Divider, Stack, Title, Group, Badge } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { renderField } from "../formConfigs/fieldConfigShared";
import { expenseMainFields } from "../formConfigs/expenseDetail";

export interface ExpenseDetailFormProps {
  mode: "edit" | "find";
  form: UseFormReturn<any>;
  expense?: any;
}

export function ExpenseDetailForm({ mode, form, expense }: ExpenseDetailFormProps) {
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
        {expenseMainFields.map((f) => (
          <React.Fragment key={f.name}>{renderField(form as any, f, mode as any, merged)}</React.Fragment>
        ))}
      </Stack>
    </Card>
  );
}
