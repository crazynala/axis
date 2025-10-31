import React from "react";
import { Card, Divider, Stack, Title, Group, Badge } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { RenderGroup } from "~/base/forms/fieldConfigShared";
import { companyMainFields } from "../forms/companyDetail";
import { getGlobalOptions } from "~/base/options/OptionsClient";

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
  const ctx = React.useMemo(
    () => ({
      options: getGlobalOptions() || undefined,
    }),
    []
  );

  return (
    <Card withBorder padding="md">
      <Stack gap={6}>
        <RenderGroup
          form={form as any}
          fields={companyMainFields as any}
          mode={mode as any}
          ctx={ctx as any}
        />
      </Stack>
    </Card>
  );
}
