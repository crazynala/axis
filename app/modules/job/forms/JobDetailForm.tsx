import React from "react";
import { Card, Grid, Stack } from "@mantine/core";
import { RenderField } from "~/base/forms/fieldConfigShared";
import { LayoutFormRenderer } from "~/base/forms/LayoutFormRenderer";
import { jobDetailPage, jobFields } from "./jobDetail";
// options are injected via OptionsProvider and consumed in RenderField
import type { UseFormReturn } from "react-hook-form";

export type JobDetailFormProps = {
  mode: "edit" | "find";
  form: UseFormReturn<any>;
  job: any;
  openCustomerModal?: () => void;
  fieldCtx?: Record<string, any>;
  onSave?: (values: any) => void;
};

export function JobDetailForm({
  mode,
  form,
  job,
  openCustomerModal,
  fieldCtx,
  onSave,
}: JobDetailFormProps) {
  // derive customer options from job.company if present (single) - could be injected by parent
  const customerOptions = job?.company
    ? [
        {
          value: String(job.company.id),
          label: job.company.name || String(job.company.id),
        },
      ]
    : [];
  const surfaceCtx = {
    openCustomerModal,
    customerOptions,
    ...(fieldCtx || {}),
  };

  return (
    <LayoutFormRenderer
      page={jobDetailPage}
      form={form}
      mode={mode}
      ctx={surfaceCtx}
      onSave={onSave}
    >
      {mode === "find" && (
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder padding="md">
            <Stack gap={8}>
              {jobFields.assembly?.map((cfg: any) => (
                <RenderField
                  key={cfg.name}
                  form={form as any}
                  field={cfg}
                  mode={mode as any}
                  // record={{ ...job, ...form.getValues() }}
                  ctx={{ openCustomerModal }}
                />
              ))}
            </Stack>
          </Card>
        </Grid.Col>
      )}
    </LayoutFormRenderer>
  );
}
