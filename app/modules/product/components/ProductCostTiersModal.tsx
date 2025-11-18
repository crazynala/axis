import React from "react";
import { Table, Text, Group, Badge } from "@mantine/core";
import { HotkeyAwareModal as Modal } from "~/base/hotkeys/HotkeyAwareModal";
import { useFetcher } from "@remix-run/react";

type Tier = {
  minQty: number;
  unitPrice: number;
  source: string; // "product" | "group"
};

export function ProductCostTiersModal({
  productId,
  opened,
  onClose,
}: {
  productId: number;
  opened: boolean;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ tiers: Tier[] }>();
  React.useEffect(() => {
    if (opened && fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/products/${productId}/cost-tiers`);
    }
  }, [opened, productId, fetcher]);

  const tiers = fetcher.data?.tiers || [];

  return (
    <Modal opened={opened} onClose={onClose} title="Cost Tiers" size="lg">
      {fetcher.state !== "idle" && !fetcher.data ? (
        <Text size="sm">Loading tiers…</Text>
      ) : tiers.length === 0 ? (
        <Text size="sm">No cost tiers found.</Text>
      ) : (
        <Table striped highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Min Qty</Table.Th>
              <Table.Th>Unit Cost</Table.Th>
              <Table.Th>Source</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tiers.map((t, i) => (
              <Table.Tr key={i}>
                <Table.Td>{t.minQty}</Table.Td>
                <Table.Td>{t.unitPrice.toFixed(4)}</Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    <Badge size="xs" variant="light">
                      {t.source}
                    </Badge>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Modal>
  );
}
