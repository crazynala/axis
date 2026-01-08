import { Group, Popover, Stack } from "@mantine/core";
import { AxisChip, type AxisChipTone } from "~/components/AxisChip";

export type WarningLike = {
  code: string;
  severity: "error" | "warn" | "info";
  label: string;
};

const warningTone = (warning: WarningLike): AxisChipTone => {
  if (warning.severity === "info") return "info";
  return "warning";
};

export function WarningsCell({ warnings }: { warnings?: WarningLike[] }) {
  const list = Array.isArray(warnings) ? warnings : [];
  if (!list.length) return null;
  const preview = list.slice(0, 2);
  const remaining = list.length - preview.length;
  const content = (
    <Group gap={4} wrap="nowrap">
      {preview.map((warning) => (
        <AxisChip
          key={`${warning.code}-${warning.label}`}
          tone={warningTone(warning)}
        >
          {warning.label}
        </AxisChip>
      ))}
      {remaining > 0 ? <AxisChip tone="neutral">+{remaining}</AxisChip> : null}
    </Group>
  );
  return (
    <Popover
      withinPortal
      position="bottom-start"
      shadow="md"
      trigger="hover"
      openDelay={150}
      closeDelay={200}
    >
      <Popover.Target>{content}</Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          {list.map((warning) => (
            <AxisChip
              key={`${warning.code}-${warning.label}-full`}
              tone={warningTone(warning)}
            >
              {warning.label}
            </AxisChip>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
