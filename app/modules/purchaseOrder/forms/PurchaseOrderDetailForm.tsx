import { Card, Divider, Stack, Title, Group } from "@mantine/core";
import type { UseFormReturn } from "react-hook-form";
import { RenderGroup, RenderField } from "~/base/forms/fieldConfigShared";
import { purchaseOrderMainFields } from "./purchaseOrderDetail";
import { StateChangeButton } from "~/base/state/StateChangeButton";
import { purchaseOrderStateConfig } from "~/base/state/configs";

export interface PurchaseOrderDetailFormProps {
  mode: "edit" | "find" | "create";
  form: UseFormReturn<any>;
  purchaseOrder?: any;
  customerOptions?: { value: string; label: string }[];
  onStateChange?: (next: string) => void;
}

export function PurchaseOrderDetailForm({
  mode,
  form,
  onStateChange,
}: PurchaseOrderDetailFormProps) {
  const statusValue = (form.getValues() as any)?.status || "DRAFT";
  return (
    <Card withBorder padding="md">
      <Card.Section inheritPadding py="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>Purchase Order</Title>
          {mode === "edit" && (
            <StateChangeButton
              value={statusValue}
              defaultValue={statusValue}
              onChange={(v) => {
                if (onStateChange) onStateChange(v);
                else form.setValue("status" as any, v, { shouldDirty: true });
              }}
              disabled={form.formState.isDirty}
              config={purchaseOrderStateConfig}
            />
          )}
        </Group>
      </Card.Section>
      <Divider my="xs" />
      <Stack gap={6}>
        <RenderGroup
          form={form as any}
          fields={purchaseOrderMainFields as any}
          mode={mode as any}
        />
      </Stack>
    </Card>
  );
}
