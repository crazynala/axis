import React from "react";
import {
  Card,
  Divider,
  Grid,
  SimpleGrid,
  Stack,
  Title,
  Group,
  Badge,
} from "@mantine/core";
import { RenderField } from "../formConfigs/fieldConfigShared";
import * as jobDetailCfg from "~/formConfigs/jobDetail";
// options are injected via OptionsProvider and consumed in RenderField
import type { UseFormReturn } from "react-hook-form";

export type JobDetailFormProps = {
  mode: "edit" | "find";
  form: UseFormReturn<any>;
  job: any;
  openCustomerModal?: () => void;
};

export function JobDetailForm({
  mode,
  form,
  job,
  openCustomerModal,
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
  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 5 }}>
        <Card withBorder padding="md">
          <Stack gap={8}>
            {(jobDetailCfg as any).jobOverviewFields?.map((cfg: any) => (
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
      <Grid.Col span={{ base: 12, md: 7 }}>
        <Card withBorder padding="md">
          <SimpleGrid cols={2} spacing="md">
            <Stack gap={8}>
              {(jobDetailCfg as any).jobDateStatusLeft?.map((cfg: any) => (
                <RenderField
                  key={cfg.name}
                  form={form as any}
                  field={cfg}
                  mode={mode as any}
                  // record={{ ...job, ...form.getValues() }}
                />
              ))}
            </Stack>
            <Stack gap={8}>
              {(jobDetailCfg as any).jobDateStatusRight?.map((cfg: any) => (
                <RenderField
                  key={cfg.name}
                  form={form as any}
                  field={cfg}
                  mode={mode as any}
                  // record={{ ...job, ...form.getValues() }}
                />
              ))}
            </Stack>
          </SimpleGrid>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
