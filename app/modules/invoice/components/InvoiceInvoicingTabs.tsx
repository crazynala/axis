import React, { useMemo, useRef, useState } from "react";
import { Form, useSubmit } from "@remix-run/react";
import {
  Badge,
  Button,
  Group,
  NumberInput,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import type {
  PendingCostingItem,
  PendingShipmentItem,
  PendingPOLineItem,
  PendingExpenseItem,
} from "../services/types";

type Selection = {
  checked: boolean;
  quantity?: string;
  unitPrice?: string;
  manualTotal?: string;
};

type Props = {
  costings: PendingCostingItem[];
  shipments: PendingShipmentItem[];
  poLines: PendingPOLineItem[];
  expenses: PendingExpenseItem[];
};

export function InvoiceInvoicingTabs({
  costings,
  shipments,
  poLines,
  expenses,
}: Props) {
  const submit = useSubmit();
  const [activeTab, setActiveTab] = useState<string>("production");
  const [selection, setSelection] = useState<Record<string, Selection>>({});
  const itemsInputRef = useRef<HTMLInputElement | null>(null);

  const shippingEntries = useMemo(() => {
    const rows: Array<{
      key: string;
      sourceType: "shippingFreight" | "shippingDuty";
      shipmentId: number;
      trackingNo: string | null;
      label: string;
      pending: string;
    }> = [];
    shipments.forEach((s) => {
      if (Number(s.freightPendingUSD) > 0) {
        rows.push({
          key: `shippingFreight-${s.shipmentId}`,
          sourceType: "shippingFreight",
          shipmentId: s.shipmentId,
          trackingNo: s.trackingNo,
          label: "Freight",
          pending: s.freightPendingUSD,
        });
      }
      if (Number(s.dutyPendingUSD) > 0) {
        rows.push({
          key: `shippingDuty-${s.shipmentId}`,
          sourceType: "shippingDuty",
          shipmentId: s.shipmentId,
          trackingNo: s.trackingNo,
          label: "Duty",
          pending: s.dutyPendingUSD,
        });
      }
    });
    return rows;
  }, [shipments]);

  const updateSelection = (key: string, updates: Partial<Selection>) => {
    setSelection((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { checked: false }), ...updates },
    }));
  };

  const buildPayload = (scope: "production" | "shipping" | "materials" | "expenses") => {
    const items: any[] = [];
    if (scope === "production") {
      costings.forEach((c) => {
        const key = `costing-${c.costingId}`;
        const sel = selection[key];
        if (!sel?.checked) return;
        items.push({
          sourceType: "costing",
          sourceId: c.costingId,
          quantity: sel.quantity ?? c.defaultQuantity,
          unitPrice: sel.unitPrice ?? c.defaultUnitPrice ?? "0",
          category: "Production",
        });
      });
    }
    if (scope === "shipping") {
      shippingEntries.forEach((row) => {
        const sel = selection[row.key];
        if (!sel?.checked) return;
        items.push({
          sourceType: row.sourceType,
          sourceId: row.shipmentId,
          manualTotal: sel.manualTotal ?? row.pending,
          category: row.sourceType === "shippingDuty" ? "Duty" : "Shipping",
        });
      });
    }
    if (scope === "materials") {
      poLines.forEach((po) => {
        const key = `po-${po.purchaseOrderLineId}`;
        const sel = selection[key];
        if (!sel?.checked) return;
        items.push({
          sourceType: "po",
          sourceId: po.purchaseOrderLineId,
          unitPrice: sel.unitPrice ?? po.unitPrice,
          manualTotal: sel.manualTotal ?? po.amountPendingUSD,
          category: "Materials",
        });
      });
    }
    if (scope === "expenses") {
      expenses.forEach((e) => {
        const key = `expense-${e.expenseId}`;
        const sel = selection[key];
        if (!sel?.checked) return;
        items.push({
          sourceType: "expense",
          sourceId: e.expenseId,
          manualTotal: sel.manualTotal ?? e.amountPendingUSD,
          category: "Expense",
        });
      });
    }
    return items;
  };

  const submitScope = (scope: "production" | "shipping" | "materials" | "expenses") => {
    const items = buildPayload(scope);
    if (!items.length) return;
    if (itemsInputRef.current) {
      itemsInputRef.current.value = JSON.stringify(items);
    }
    const fd = new FormData();
    fd.set("_intent", "invoice.addLines");
    fd.set("items", JSON.stringify(items));
    submit(fd, { method: "post" });
  };

  const renderCostings = () => (
    <Stack>
      <Table withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Add</Table.Th>
            <Table.Th>Description</Table.Th>
            <Table.Th>Job</Table.Th>
            <Table.Th>Assembly</Table.Th>
            <Table.Th>Pending Units</Table.Th>
            <Table.Th>Price</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {costings.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed">No costings pending invoicing.</Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            costings.map((c) => {
              const key = `costing-${c.costingId}`;
              const sel = selection[key] || { checked: false };
              return (
                <Table.Tr key={key}>
                  <Table.Td>
                    <input
                      type="checkbox"
                      checked={sel.checked}
                      onChange={(e) =>
                        updateSelection(key, { checked: e.currentTarget.checked })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text fw={500}>{c.description}</Text>
                      <Text size="xs" c="dimmed">
                        Already invoiced: {c.alreadyInvoicedQty}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    {c.jobProjectCode || "—"}
                  </Table.Td>
                  <Table.Td>{c.assemblyId}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      min={0}
                      size="xs"
                      defaultValue={Number(c.defaultQuantity)}
                      onChange={(v) =>
                        updateSelection(key, { quantity: v?.toString() || "0" })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      min={0}
                      size="xs"
                      defaultValue={
                        c.defaultUnitPrice != null
                          ? Number(c.defaultUnitPrice)
                          : undefined
                      }
                      onChange={(v) =>
                        updateSelection(key, { unitPrice: v?.toString() || "0" })
                      }
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
      <Group justify="flex-end">
        <Button onClick={() => submitScope("production")} disabled={!costings.length}>
          Add selected
        </Button>
      </Group>
    </Stack>
  );

  const renderShipping = () => (
    <Stack>
      <Table withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Add</Table.Th>
            <Table.Th>Shipment</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Pending USD</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shippingEntries.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed">No shipping pending invoicing.</Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            shippingEntries.map((row) => {
              const sel = selection[row.key] || { checked: false };
              return (
                <Table.Tr key={row.key}>
                  <Table.Td>
                    <input
                      type="checkbox"
                      checked={sel.checked}
                      onChange={(e) =>
                        updateSelection(row.key, {
                          checked: e.currentTarget.checked,
                        })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text fw={500}>
                        Shipment {row.shipmentId}{" "}
                        {row.trackingNo ? `(${row.trackingNo})` : ""}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Badge>
                      {row.label}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      min={0}
                      size="xs"
                      defaultValue={Number(row.pending)}
                      onChange={(v) =>
                        updateSelection(row.key, {
                          manualTotal: v?.toString() || "0",
                        })
                      }
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
      <Group justify="flex-end">
        <Button onClick={() => submitScope("shipping")} disabled={!shippingEntries.length}>
          Add selected
        </Button>
      </Group>
    </Stack>
  );

  const renderPO = () => (
    <Stack>
      <Table withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Add</Table.Th>
            <Table.Th>PO Line</Table.Th>
            <Table.Th>Pending USD</Table.Th>
            <Table.Th>Unit Price</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {poLines.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed">No PO lines pending invoicing.</Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            poLines.map((po) => {
              const key = `po-${po.purchaseOrderLineId}`;
              const sel = selection[key] || { checked: false };
              return (
                <Table.Tr key={key}>
                  <Table.Td>
                    <input
                      type="checkbox"
                      checked={sel.checked}
                      onChange={(e) =>
                        updateSelection(key, { checked: e.currentTarget.checked })
                      }
                    />
                  </Table.Td>
                  <Table.Td>Line {po.purchaseOrderLineId}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      min={0}
                      size="xs"
                      defaultValue={Number(po.amountPendingUSD)}
                      onChange={(v) =>
                        updateSelection(key, {
                          manualTotal: v?.toString() || "0",
                        })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      min={0}
                      size="xs"
                      defaultValue={Number(po.unitPrice)}
                      onChange={(v) =>
                        updateSelection(key, {
                          unitPrice: v?.toString() || "0",
                        })
                      }
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
      <Group justify="flex-end">
        <Button onClick={() => submitScope("materials")} disabled={!poLines.length}>
          Add selected
        </Button>
      </Group>
    </Stack>
  );

  const renderExpenses = () => (
    <Stack>
      <Table withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Add</Table.Th>
            <Table.Th>Expense</Table.Th>
            <Table.Th>Job</Table.Th>
            <Table.Th>Pending USD</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {expenses.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed">No expenses pending invoicing.</Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            expenses.map((e) => {
              const key = `expense-${e.expenseId}`;
              const sel = selection[key] || { checked: false };
              return (
                <Table.Tr key={key}>
                  <Table.Td>
                    <input
                      type="checkbox"
                      checked={sel.checked}
                      onChange={(evt) =>
                        updateSelection(key, { checked: evt.currentTarget.checked })
                      }
                    />
                  </Table.Td>
                  <Table.Td>Expense {e.expenseId}</Table.Td>
                  <Table.Td>{e.jobProjectCode || "—"}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      min={0}
                      size="xs"
                      defaultValue={Number(e.amountPendingUSD)}
                      onChange={(v) =>
                        updateSelection(key, {
                          manualTotal: v?.toString() || "0",
                        })
                      }
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
      <Group justify="flex-end">
        <Button onClick={() => submitScope("expenses")} disabled={!expenses.length}>
          Add selected
        </Button>
      </Group>
    </Stack>
  );

  return (
    <Form method="post">
      <input type="hidden" name="_intent" value="invoice.addLines" />
      <input ref={itemsInputRef} type="hidden" name="items" />
      <Tabs value={activeTab} onChange={(v) => setActiveTab(v || "production")}>
        <Tabs.List>
          <Tabs.Tab value="production">Production</Tabs.Tab>
          <Tabs.Tab value="shipping">Shipping</Tabs.Tab>
          <Tabs.Tab value="materials">Materials</Tabs.Tab>
          <Tabs.Tab value="expenses">Expenses</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="production" pt="md">
          {renderCostings()}
        </Tabs.Panel>
        <Tabs.Panel value="shipping" pt="md">
          {renderShipping()}
        </Tabs.Panel>
        <Tabs.Panel value="materials" pt="md">
          {renderPO()}
        </Tabs.Panel>
        <Tabs.Panel value="expenses" pt="md">
          {renderExpenses()}
        </Tabs.Panel>
      </Tabs>
    </Form>
  );
}
