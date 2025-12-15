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
  Modal,
  Code,
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

function groupCostings(costings: PendingCostingItem[]) {
  const groups = new Map<
    number,
    {
      jobId: number;
      jobLabel: string;
      assemblies: Map<
        number,
        { assemblyId: number; assemblyLabel: string; costings: PendingCostingItem[] }
      >;
    }
  >();

  const sorted = [...costings].sort((a, b) => {
    const jobA = a.jobProjectCode || "";
    const jobB = b.jobProjectCode || "";
    if (jobA !== jobB) return jobA.localeCompare(jobB);
    if (a.jobId !== b.jobId) return (a.jobId || 0) - (b.jobId || 0);
    if (a.assemblyId !== b.assemblyId)
      return (a.assemblyId || 0) - (b.assemblyId || 0);
    return (a.costingName || "").localeCompare(b.costingName || "");
  });

  sorted.forEach((c) => {
    const jobId = c.jobId || -1;
    const jobLabel = c.jobProjectCode || `Job ${jobId}`;
    if (!groups.has(jobId)) {
      groups.set(jobId, { jobId, jobLabel, assemblies: new Map() });
    }
    const jobGroup = groups.get(jobId)!;
    const asmId = c.assemblyId || -1;
    const asmLabel = c.assemblyName || (asmId > 0 ? `Assembly ${asmId}` : "Assembly");
    if (!jobGroup.assemblies.has(asmId)) {
      jobGroup.assemblies.set(asmId, {
        assemblyId: asmId,
        assemblyLabel: asmLabel,
        costings: [],
      });
    }
    jobGroup.assemblies.get(asmId)!.costings.push(c);
  });

  return Array.from(groups.values()).map((g) => ({
    jobId: g.jobId,
    jobLabel: g.jobLabel,
    assemblies: Array.from(g.assemblies.values()),
  }));
}

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
  const [diag, setDiag] = useState<PendingCostingItem | null>(null);
  const [poDiag, setPoDiag] = useState<PendingPOLineItem | null>(null);

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
            groupCostings(costings).map((jobGroup) => (
              <React.Fragment key={`job-${jobGroup.jobId}`}>
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text fw={700}>Job: {jobGroup.jobLabel}</Text>
                  </Table.Td>
                </Table.Tr>
                {jobGroup.assemblies.map((asm) => (
                  <React.Fragment key={`asm-${asm.assemblyId}`}>
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text fw={600} c="dimmed">
                          Assembly: {asm.assemblyLabel}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                    {asm.costings.map((c) => {
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
                              <Text fw={500}>{c.costingName || c.description}</Text>
                              <Text size="xs" c="dimmed">
                                Already invoiced: {c.alreadyInvoicedQty}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>{jobGroup.jobLabel}</Table.Td>
                          <Table.Td>{asm.assemblyLabel}</Table.Td>
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
                          <Table.Td>
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => setDiag(c)}
                            >
                              Calc details
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))
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
            <Table.Th>PO</Table.Th>
            <Table.Th>Product</Table.Th>
            <Table.Th>Ordered</Table.Th>
            <Table.Th>Received</Table.Th>
            <Table.Th>Pending USD</Table.Th>
            <Table.Th>Unit Price</Table.Th>
            <Table.Th>Details</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {poLines.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={8}>
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
                  <Table.Td>PO {po.purchaseOrderId ?? "—"}</Table.Td>
                  <Table.Td>{po.productName || "—"}</Table.Td>
                  <Table.Td>{po.quantityOrdered}</Table.Td>
                  <Table.Td>{po.quantityReceived}</Table.Td>
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
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => setPoDiag(po)}
                    >
                      Calc details
                    </Button>
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
      <Modal
        opened={!!diag}
        onClose={() => setDiag(null)}
        title="Invoiceable units breakdown"
        size="lg"
      >
        {!diag?.invoiceCalcDebug ? (
          <Text c="dimmed">No diagnostic data.</Text>
        ) : (
          <Stack gap="xs">
            <Text fw={600}>
              {diag.costingName || diag.description} (Assembly{" "}
              {diag.assemblyId}) — Job {diag.jobProjectCode || diag.jobId}
            </Text>
            <Table withColumnBorders>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>Bill Upon</Table.Td>
                  <Table.Td>{diag.invoiceCalcDebug.billUpon}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Qty Ordered</Table.Td>
                  <Table.Td>{diag.invoiceCalcDebug.qtyOrdered}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Qty Cut</Table.Td>
                  <Table.Td>{diag.invoiceCalcDebug.qtyCut}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Qty Finish</Table.Td>
                  <Table.Td>{diag.invoiceCalcDebug.qtyFinish}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Qty Pack</Table.Td>
                  <Table.Td>{diag.invoiceCalcDebug.qtyPack}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Percent on Cut</Table.Td>
                  <Table.Td>{diag.invoiceCalcDebug.pctCut}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Percent on Order</Table.Td>
                  <Table.Td>{diag.invoiceCalcDebug.pctOrder}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Base Qty</Table.Td>
                  <Table.Td>{diag.invoiceCalcDebug.baseQty}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Add from Cut</Table.Td>
                  <Table.Td>{diag.invoiceCalcDebug.addFromCut}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Min from Order</Table.Td>
                  <Table.Td>{diag.invoiceCalcDebug.minFromOrder}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Invoiceable Units</Table.Td>
                  <Table.Td>{diag.invoiceCalcDebug.invoiceable}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Already Invoiced</Table.Td>
                  <Table.Td>{diag.alreadyInvoicedQty}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Pending (shown)</Table.Td>
                  <Table.Td>{diag.maxQuantity}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
            <Code block c="dimmed">
              {JSON.stringify(diag.invoiceCalcDebug, null, 2)}
            </Code>
          </Stack>
        )}
      </Modal>
      <Modal
        opened={!!poDiag}
        onClose={() => setPoDiag(null)}
        title="PO invoiceability breakdown"
        size="lg"
      >
        {!poDiag?.calcDebug ? (
          <Text c="dimmed">No diagnostic data.</Text>
        ) : (
          <Stack gap="xs">
            <Text fw={600}>
              PO {poDiag.purchaseOrderId ?? "—"} — Line {poDiag.purchaseOrderLineId}
            </Text>
            <Table withColumnBorders>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>Product</Table.Td>
                  <Table.Td>{poDiag.productName || "—"}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Qty Ordered</Table.Td>
                  <Table.Td>{poDiag.quantityOrdered}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Qty Received</Table.Td>
                  <Table.Td>{poDiag.quantityReceived}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Ordered Qty</Table.Td>
                  <Table.Td>{poDiag.calcDebug.orderedQuantity}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Received Qty</Table.Td>
                  <Table.Td>{poDiag.calcDebug.receivedQuantity}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Target Qty</Table.Td>
                  <Table.Td>{poDiag.calcDebug.targetQuantity}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Already Invoiced Qty</Table.Td>
                  <Table.Td>{poDiag.calcDebug.invoicedQuantity}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Pending Qty</Table.Td>
                  <Table.Td>{poDiag.calcDebug.pendingQuantity}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Unit Price</Table.Td>
                  <Table.Td>{poDiag.calcDebug.unitPrice}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Pending Amount</Table.Td>
                  <Table.Td>{poDiag.calcDebug.pendingAmount}</Table.Td>
                </Table.Tr>
                {poDiag.calcDebug.invoiceLines?.map((l, idx) => (
                  <React.Fragment key={l.id ?? `inv-${idx}`}>
                    <Table.Tr>
                      <Table.Td colSpan={2}>
                        <Text fw={600}>Invoice line {l.id ?? "—"}</Text>
                      </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Qty</Table.Td>
                      <Table.Td>{l.quantity}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Price Sell</Table.Td>
                      <Table.Td>{l.priceSell}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Invoiced Price</Table.Td>
                      <Table.Td>{l.invoicedPrice ?? "—"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Manual Total</Table.Td>
                      <Table.Td>{l.invoicedTotalManual ?? "—"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Category</Table.Td>
                      <Table.Td>{l.category || "—"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Subcategory</Table.Td>
                      <Table.Td>{l.subCategory || "—"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Computed Total</Table.Td>
                      <Table.Td>{l.computedTotal}</Table.Td>
                    </Table.Tr>
                  </React.Fragment>
                ))}
              </Table.Tbody>
            </Table>
            <Code block c="dimmed">
              {JSON.stringify(poDiag.calcDebug, null, 2)}
            </Code>
          </Stack>
        )}
      </Modal>
    </Form>
  );
}
