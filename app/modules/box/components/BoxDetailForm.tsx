import { Card, Stack, Title } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import {
  RenderGroup,
  type RenderContext,
} from "~/base/forms/fieldConfigShared";
import {
  boxContextFields,
  boxIdentityFields,
  boxLineCriteriaFields,
  boxTimelineFields,
} from "../forms/boxDetail";

export type BoxDetailFormProps = {
  mode: "edit" | "find" | "create";
  form: UseFormReturn<any>;
  title?: string;
  ctx?: RenderContext;
};

export function BoxDetailForm({ mode, form, title, ctx }: BoxDetailFormProps) {
  return (
    <Stack gap="md">
      {title ? <Title order={3}>{title}</Title> : null}
      <Card withBorder padding="md" radius="md">
        <RenderGroup
          form={form}
          fields={boxIdentityFields}
          mode={mode}
          ctx={ctx}
        />
      </Card>
      <Card withBorder padding="md" radius="md">
        <RenderGroup
          form={form}
          fields={boxContextFields}
          mode={mode}
          ctx={ctx}
        />
      </Card>
      {mode !== "find" && (
        <Card withBorder padding="md" radius="md">
          <RenderGroup
            form={form}
            fields={boxTimelineFields}
            mode={mode}
            ctx={ctx}
          />
        </Card>
      )}
      {mode === "find" && (
        <Card withBorder padding="md" radius="md">
          <RenderGroup
            form={form}
            fields={boxLineCriteriaFields}
            mode={mode}
            ctx={ctx}
          />
        </Card>
      )}
    </Stack>
  );
}
