import { Tooltip } from "@mantine/core";
import { IconPin } from "@tabler/icons-react";

export function OverrideIndicator({
  isOverridden,
  tooltip,
}: {
  isOverridden: boolean;
  tooltip: string;
}) {
  if (!isOverridden) return null;
  return (
    <Tooltip label={tooltip} withArrow>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          marginLeft: 4,
          color: "var(--mantine-color-gray-6)",
        }}
        aria-label="Override"
      >
        <IconPin size={12} />
      </span>
    </Tooltip>
  );
}
