import React from "react";
import { Card, SimpleGrid } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { RenderGroup } from "~/base/forms/fieldConfigShared";
import {
  companyPanelOneFields,
  companyPanelTwoFields,
} from "../forms/companyDetail";
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
    <SimpleGrid cols={2}>
      <Card withBorder padding="md">
        <RenderGroup
          form={form as any}
          fields={companyPanelOneFields as any}
          mode={mode as any}
          ctx={ctx as any}
        />
      </Card>
      <Card withBorder padding="md">
        <RenderGroup
          form={form as any}
          fields={companyPanelTwoFields as any}
          mode={mode as any}
          ctx={ctx as any}
        />
      </Card>
    </SimpleGrid>
  );
}
