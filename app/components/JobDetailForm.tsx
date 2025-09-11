import React from "react";
import { Card, Divider, Grid, SimpleGrid, Stack, Title, Group, Badge } from "@mantine/core";
import { renderField } from "../formConfigs/fieldConfigShared";
import * as jobDetailCfg from "../formConfigs/jobDetail";
import type { UseFormReturn } from "react-hook-form";

export type JobDetailFormProps = {
  mode: "edit" | "find";
  form: UseFormReturn<any>;
  job: any;
  openCustomerModal?: () => void;
};

export function JobDetailForm({ mode, form, job, openCustomerModal }: JobDetailFormProps) {
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
          <Card.Section inheritPadding py="xs">
            <Group justify="space-between" align="center">
              <Title order={4}>Overview</Title>
            </Group>
          </Card.Section>
          <Divider my="xs" />
          <Stack gap={8}>
            {(jobDetailCfg as any).jobOverviewFields?.map((cfg: any) => (
              <React.Fragment key={cfg.name}>
                {renderField(
                  form as any,
                  cfg,
                  mode as any,
                  { ...job, ...form.getValues() },
                  {
                    openCustomerModal,
                    customerOptions,
                  }
                )}
              </React.Fragment>
            ))}
          </Stack>
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 7 }}>
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Title order={4}>Dates & Status</Title>
          </Card.Section>
          <Divider my="xs" />
          <SimpleGrid cols={2} spacing="md">
            <Stack gap={8}>
              {(jobDetailCfg as any).jobDateStatusLeft?.map((cfg: any) => (
                <React.Fragment key={cfg.name}>
                  {renderField(form as any, cfg, mode as any, {
                    ...job,
                    ...form.getValues(),
                  })}
                </React.Fragment>
              ))}
            </Stack>
            <Stack gap={8}>
              {(jobDetailCfg as any).jobDateStatusRight?.map((cfg: any) => (
                <React.Fragment key={cfg.name}>
                  {renderField(form as any, cfg, mode as any, {
                    ...job,
                    ...form.getValues(),
                  })}
                </React.Fragment>
              ))}
            </Stack>
          </SimpleGrid>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
