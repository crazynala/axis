import { Group, Text, Tooltip } from "@mantine/core";

export type ProductStageIndicatorProps = {
  stage?: string | null;
  variant?: "inline" | "secondaryText";
  tooltip?: string;
};

export function ProductStageIndicator({
  stage,
  variant = "inline",
  tooltip = "This product is still in setup and should be reviewed.",
}: ProductStageIndicatorProps) {
  if (String(stage || "").toUpperCase() !== "SETUP") return null;
  const content =
    variant === "secondaryText" ? (
      <Text size="xs" c="dimmed">
        Setup
      </Text>
    ) : (
      <Group gap={6} wrap="nowrap">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "999px",
            background: "var(--mantine-color-gray-5)",
            display: "inline-block",
          }}
        />
        <Text size="xs" c="dimmed">
          Setup
        </Text>
      </Group>
    );
  return (
    <Tooltip label={tooltip} withArrow position="top-start">
      <span>{content}</span>
    </Tooltip>
  );
}
