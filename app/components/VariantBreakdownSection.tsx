import React from "react";
import { Card, Stack, Table, Text } from "@mantine/core";
import type { VariantGroup } from "~/utils/variantBreakdown";

type Props<T> = {
  groups: VariantGroup<T>[];
  renderLineLabel: (item: T, index: number) => React.ReactNode;
  formatValue?: (value: number) => React.ReactNode;
  lineHeader?: React.ReactNode;
  emptyLabel?: React.ReactNode;
};

const defaultFormatter = (value: number) =>
  Number.isFinite(value) ? value : 0;

export function VariantBreakdownSection<T>({
  groups,
  renderLineLabel,
  formatValue = defaultFormatter,
  lineHeader = "Line",
  emptyLabel = (
    <Text size="sm" c="dimmed">
      No quantity breakdowns available.
    </Text>
  ),
}: Props<T>) {
  if (!groups.length) return <>{emptyLabel}</>;
  return (
    <Stack gap="md">
      {groups.map((group) => (
        <Card key={group.key} withBorder padding="sm" radius="md">
          <Stack gap="xs">
            <Text fw={600}>{group.title}</Text>
            <Table withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{lineHeader}</Table.Th>
                  {group.labels.map((label, idx) => (
                    <Table.Th key={idx}>{label}</Table.Th>
                  ))}
                  <Table.Th>Total</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {group.lines.map((line, idx) => (
                  <Table.Tr key={line.key || idx}>
                    <Table.Td>{renderLineLabel(line.item, idx)}</Table.Td>
                    {line.cells.map((value, cellIdx) => (
                      <Table.Td key={cellIdx}>{formatValue(value)}</Table.Td>
                    ))}
                    <Table.Td>{formatValue(line.total)}</Table.Td>
                  </Table.Tr>
                ))}
                <Table.Tr>
                  <Table.Td>
                    <strong>Total</strong>
                  </Table.Td>
                  {group.totals.map((value, idx) => (
                    <Table.Td key={idx}>
                      <strong>{formatValue(value)}</strong>
                    </Table.Td>
                  ))}
                  <Table.Td>
                    <strong>{formatValue(group.totalSum)}</strong>
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
