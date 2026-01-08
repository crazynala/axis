import type { PageNode } from "~/base/forms/layoutTypes";
import type { FieldConfig } from "~/base/forms/fieldConfigShared";
import { Group, Stack, Table, Text } from "@mantine/core";
import { L } from "~/base/forms/layoutDsl";
import { purchaseOrderMainFields } from "~/modules/purchaseOrder/forms/purchaseOrderDetail";
import { formatUSD } from "~/utils/format";

const isDraft = ({ ctx }: { ctx?: any }) => Boolean(ctx?.isLoudMode);
const surfaceUiMode = ({ ctx }: { ctx?: any }) =>
  ctx?.isLoudMode ? "normal" : "quiet";
const surfaceAllowEdit = ({ ctx }: { ctx?: any }) => Boolean(ctx?.isLoudMode);

const accountingSummaryField: FieldConfig = {
  name: "accountingSummary",
  label: "",
  widget: "computed",
  compute: ({ ctx }) => {
    const summary = ctx?.accountingSummary || {};
    const deltaValue = Number(summary.deltaInc ?? 0) || 0;
    const showDelta = Math.abs(deltaValue) >= 0.01;
    const rows = [
      {
        label: "Ordered",
        cost: summary.extCost,
        sell: summary.extSell,
      },
      {
        label: "Received",
        cost: summary.realCost,
        sell: summary.realSell,
        highlight: true,
      },
      {
        label: "Invoiced",
        cost: summary.invoicedInc,
        sell: null,
      },
    ];
    return (
      <Stack gap={10}>
        <Table withColumnBorders={false} withRowBorders={false} w="100%">
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th>
                <Text size="sm" c="dimmed" ta="right">
                  Cost
                </Text>
              </Table.Th>
              <Table.Th>
                <Text size="sm" c="dimmed" ta="right">
                  Sell
                </Text>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.label}>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {row.label}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text
                    size={row.highlight ? "lg" : "md"}
                    fw={row.highlight ? 600 : 400}
                    ta="right"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {row.cost != null ? formatUSD(row.cost) : "—"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text
                    size={row.highlight ? "lg" : "md"}
                    fw={row.highlight ? 600 : 400}
                    ta="right"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {row.sell != null ? formatUSD(row.sell) : ""}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {showDelta ? (
          <Group justify="flex-end">
            <Text
              size="xs"
              c="red"
              ta="right"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatUSD(deltaValue)}
            </Text>
          </Group>
        ) : null}
      </Stack>
    );
  },
};

export const purchaseOrderDetailPage: PageNode = L.page(
  { gutter: "md" },
  L.col(
    { span: { base: 12, md: 8 } },
    L.card(
      {
        key: "overview",
        title: "Purchase Order",
        drawerTitle: "Edit purchase order",
        drawerItems: purchaseOrderMainFields,
        editableInlineWhen: isDraft,
        surfaceUiMode,
        surfaceAllowEdit,
        drawerUiMode: "normal",
        drawerAllowEdit: true,
      },
      ...purchaseOrderMainFields
    )
  ),
  L.col(
    { span: { base: 12, md: 4 } },
    L.card(
      {
        key: "accountingSummary",
        cardProps: { bg: "transparent" },
        editableInlineWhen: () => true,
        surfaceAllowEdit: false,
        drawerAllowEdit: false,
      },
      accountingSummaryField
    )
  )
);
