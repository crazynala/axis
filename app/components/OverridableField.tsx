import { Button, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { OverrideIndicator } from "~/components/OverrideIndicator";

export function OverridableField({
  label,
  isOverridden,
  jobValue,
  onClear,
  children,
}: {
  label: string;
  isOverridden: boolean;
  jobValue?: string | null;
  onClear?: () => void;
  children?: ReactNode;
}) {
  const tooltip = jobValue ? `Job: ${jobValue}` : "Job value";
  return (
    <Stack gap={4}>
      <Group justify="space-between" align="center">
        <Group gap={6} align="center">
          <Text size="sm" fw={600}>
            {label}
          </Text>
          <OverrideIndicator isOverridden={isOverridden} tooltip={tooltip} />
        </Group>
        {isOverridden ? (
          <Button size="xs" variant="subtle" onClick={onClear}>
            Clear override
          </Button>
        ) : null}
      </Group>
      {children}
    </Stack>
  );
}
