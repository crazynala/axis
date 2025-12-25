import React from "react";
import { Card, Grid, SimpleGrid, Stack } from "@mantine/core";
import { RenderField } from "~/base/forms/fieldConfigShared";
import * as jobDetailCfg from "./jobDetail";
// options are injected via OptionsProvider and consumed in RenderField
import type { UseFormReturn } from "react-hook-form";

export type JobDetailFormProps = {
  mode: "edit" | "find";
  form: UseFormReturn<any>;
  job: any;
  openCustomerModal?: () => void;
  fieldCtx?: Record<string, any>;
};

export function JobDetailForm({
  mode,
  form,
  job,
  openCustomerModal,
  fieldCtx,
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
  const rightColumns =
    (jobDetailCfg as any).jobEditGroups?.rightColumns as
      | Array<{ fields?: any[]; visibleWhen?: any }>
      | undefined;
  const rightGroups = (jobDetailCfg as any).jobEditGroups?.right || [];

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 5 }}>
        <Card withBorder padding="md">
          <Stack gap={8}>
            {((jobDetailCfg as any).jobEditGroups?.left || []).map((group: any) =>
              group?.visibleWhen &&
              !group.visibleWhen({ form, mode, ctx: fieldCtx })
                ? null
                : group?.fields?.map((cfg: any) => (
                    <RenderField
                      key={cfg.name}
                      form={form as any}
                      field={cfg}
                      mode={mode as any}
                      ctx={{ openCustomerModal, customerOptions, ...(fieldCtx || {}) }}
                    />
                  ))
            )}
          </Stack>
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 7 }}>
        <Card withBorder padding="md">
          <SimpleGrid cols={2} spacing="md">
            <Stack gap={8}>
              {rightColumns
                ? rightColumns[0]?.visibleWhen &&
                  !rightColumns[0].visibleWhen({
                    form,
                    mode,
                    ctx: fieldCtx,
                  })
                  ? null
                  : rightColumns[0]?.fields?.map((cfg: any) => (
                      <RenderField
                        key={cfg.name}
                        form={form as any}
                        field={cfg}
                        mode={mode as any}
                        ctx={fieldCtx}
                      />
                    ))
                : rightGroups
                    .filter((g: any) => g?.key === "dates-left")
                    .map((group: any) =>
                      group?.visibleWhen &&
                      !group.visibleWhen({ form, mode, ctx: fieldCtx })
                        ? null
                        : group?.fields?.map((cfg: any) => (
                            <RenderField
                              key={cfg.name}
                              form={form as any}
                              field={cfg}
                              mode={mode as any}
                              ctx={fieldCtx}
                            />
                          ))
                    )}
            </Stack>
            <Stack gap={8}>
              {rightColumns
                ? rightColumns[1]?.visibleWhen &&
                  !rightColumns[1].visibleWhen({
                    form,
                    mode,
                    ctx: fieldCtx,
                  })
                  ? null
                  : rightColumns[1]?.fields?.map((cfg: any) => (
                      <RenderField
                        key={cfg.name}
                        form={form as any}
                        field={cfg}
                        mode={mode as any}
                        ctx={fieldCtx}
                      />
                    ))
                : rightGroups
                    .filter((g: any) => g?.key === "dates-right")
                    .map((group: any) =>
                      group?.visibleWhen &&
                      !group.visibleWhen({ form, mode, ctx: fieldCtx })
                        ? null
                        : group?.fields?.map((cfg: any) => (
                            <RenderField
                              key={cfg.name}
                              form={form as any}
                              field={cfg}
                              mode={mode as any}
                              ctx={fieldCtx}
                            />
                          ))
                    )}
            </Stack>
          </SimpleGrid>
        </Card>
      </Grid.Col>
      {mode === "find" && (
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder padding="md">
            <Stack gap={8}>
              {(jobDetailCfg as any).assemblyFields?.map((cfg: any) => (
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
    </Grid>
  );
}
