import React from "react";
import { Card, Divider, Stack, Title, Group, Badge } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { renderField } from "~/base/forms/fieldConfigShared";
import { companyMainFields } from "../forms/companyDetail";

export interface CompanyDetailFormProps {
  mode: "edit" | "find";
  form: UseFormReturn<any>;
  company?: any;
}

export function CompanyDetailForm({
  mode,
  form,
  company,
}: CompanyDetailFormProps) {
  const merged = { ...(company || {}), ...form.getValues() };
  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>Company</Title>
        </Group>
      </Card.Section>
      <Divider my="xs" />
      <Stack gap={6}>
        {companyMainFields.map((f) => (
          <React.Fragment key={f.name}>
            {renderField(form as any, f, mode as any)}
          </React.Fragment>
        ))}
      </Stack>
    </Card>
  );
}
