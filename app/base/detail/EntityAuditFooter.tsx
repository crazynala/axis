import { Group, Text } from "@mantine/core";
import { formatShortDate } from "~/utils/format";

type EntityAuditFooterProps = {
  createdAt?: Date | string | null;
  createdBy?: string | null;
  updatedAt?: Date | string | null;
  updatedBy?: string | null;
};

export function EntityAuditFooter({
  createdAt,
  createdBy,
  updatedAt,
  updatedBy,
}: EntityAuditFooterProps) {
  const createdLabel = createdAt ? formatShortDate(createdAt) : "";
  const updatedLabel = updatedAt ? formatShortDate(updatedAt) : "";
  const createdByLabel = createdBy ? ` by ${createdBy}` : "";
  const updatedByLabel = updatedBy ? ` by ${updatedBy}` : "";

  return (
    <Group justify="space-between" align="center">
      <Text size="xs" c="dimmed">
        Created {createdLabel || "—"}
        {createdByLabel}
      </Text>
      <Text size="xs" c="dimmed">
        Updated {updatedLabel || "—"}
        {updatedByLabel}
      </Text>
    </Group>
  );
}
