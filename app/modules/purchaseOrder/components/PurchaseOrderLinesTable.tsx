import { useCallback, useEffect, useMemo } from "react";
import { Controller, useWatch } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import {
  Group,
  Indicator,
  NumberInput,
  Table,
  ActionIcon,
  Menu,
  Button,
  Checkbox,
  Badge,
  Text,
  Tooltip,
  Stack,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconMenu2 } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { calcPrice } from "~/modules/product/calc/calcPrice";
import { formatUSD } from "~/utils/format";
import { resolveLeadTimeDays } from "~/utils/leadTime";

type Props = {
  form: UseFormReturn<any>;
  status: string;
  productMap: Record<number, any>;
  pricingPrefs?: {
    marginOverride?: number | null;
    vendorDefaultMargin?: number | null;
    globalDefaultMargin?: number | null;
    priceMultiplier?: number | null;
  } | null;
  purchaseDate?: string | Date | null;
  vendorLeadTimeDays?: number | null;
  onOpenReservations?: (line: any) => void;
};

export function PurchaseOrderLinesTable({
  form,
  status,
  productMap,
  pricingPrefs,
  purchaseDate,
  vendorLeadTimeDays,
  onOpenReservations,
}: Props) {
  const lines: any[] =
    useWatch({ control: form.control, name: "lines" }) ||
    (form.getValues("lines") as any[]) ||
    [];

  const purchaseDateValue = useMemo(() => {
    if (!purchaseDate) return null;
    const date = new Date(purchaseDate as any);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [purchaseDate]);
  const vendorDefaultLeadTimeDays =
    vendorLeadTimeDays != null && Number.isFinite(Number(vendorLeadTimeDays))
      ? Number(vendorLeadTimeDays)
      : null;

  const isDraft = status === "DRAFT";
  const isComplete = status === "COMPLETE" || status === "CANCELED";

  const getReservedQty = useCallback((line: any) => {
    if (!line) return 0;
    if (line.reservedQty != null) return Number(line.reservedQty) || 0;
    return (line.reservations || []).reduce(
      (sum: number, res: any) => sum + (Number(res.qtyReserved) || 0),
      0
    );
  }, []);
  const getRemainingQty = useCallback(
    (line: any) => {
      if (!line) return 0;
      if (line.availableQty != null) {
        return Math.max(Number(line.availableQty) || 0, 0);
      }
      const ordered = Number(line.quantityOrdered || 0) || 0;
      const received = Number(line.qtyReceived || 0) || 0;
      return Math.max(ordered - received - getReservedQty(line), 0);
    },
    [getReservedQty]
  );

  const formatQuantity = (value: number | null | undefined) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString();
  };

  const getLivePrices = (productId?: number, qtyOrdered?: number) => {
    const pid = Number(productId || 0);
    const prod = productMap[pid];
    const qty = Number(qtyOrdered || 0) || 0;
    if (!prod) return { cost: 0, sell: 0, taxRate: 0 } as any;
    const cost = Number(prod.costPrice || 0);
    // Detect manual sell price at product level (and via hydrated flag)
    const hasManualSell =
      prod.manualSalePrice != null || prod.c_isSellPriceManual === true;
    if (hasManualSell) {
      const out = calcPrice({
        baseCost: cost,
        tiers: [],
        taxRate: Number(prod.purchaseTax?.value || 0),
        qty: qty > 0 ? qty : 1,
        manualSalePrice: Number(prod.manualSalePrice || 0),
      });
      return {
        cost,
        sell: Number(out.unitSellPrice || prod.manualSalePrice || 0),
        extendedCost: cost * (qty || 0),
        extendedSell:
          Number(out.unitSellPrice || prod.manualSalePrice || 0) * (qty || 0),
        taxRate: Number(prod.purchaseTax?.value || 0),
        isManualSell: true,
      };
    }
    const tiers = (prod.costGroup?.costRanges || []).map((t: any) => ({
      minQty: Number(t.rangeFrom || 0),
      priceCost: Number(t.costPrice || 0),
    }));
    const taxRate = Number(prod.purchaseTax?.value || 0);
    // Resolve margin precedence (consignee/customer aware per pricingPrefs)
    const marginPct = (() => {
      const m1 = pricingPrefs?.marginOverride;
      const m2 = pricingPrefs?.vendorDefaultMargin;
      const m3 = pricingPrefs?.globalDefaultMargin;
      const pick =
        m1 != null
          ? Number(m1)
          : m2 != null
          ? Number(m2)
          : m3 != null
          ? Number(m3)
          : null;
      return pick != null ? Number(pick) : undefined;
    })();
    const priceMultiplier = pricingPrefs?.priceMultiplier ?? undefined;
    const out = calcPrice({
      baseCost: cost,
      tiers,
      taxRate,
      qty: qty > 0 ? qty : 1,
      marginPct,
      priceMultiplier,
    });
    // console.log("Live prices", productId, qtyOrdered, out);
    const unitCost = Number((out as any)?.breakdown?.baseUnit ?? cost ?? 0);
    const unitSell = Number(out.unitSellPrice || 0);
    return {
      cost: unitCost,
      sell: unitSell,
      extendedCost: unitCost * (qty || 0),
      extendedSell: unitSell * (qty || 0),
      taxRate,
      isManualSell: false,
    };
  };

  const qtySig = useMemo(
    () =>
      (lines || [])
        .map((l: any) => `${l.productId}:${l.quantityOrdered}`)
        .join("|"),
    [lines]
  );

  // Compute live prices in-render to avoid a one-keystroke lag
  const livePrices = useMemo(() => {
    return (lines || []).map((l: any) => {
      if (isDraft) {
        return getLivePrices(l.productId, l.quantityOrdered);
      } else {
        const taxRate = Number(
          l.purchaseTax?.value || l.product?.purchaseTax?.value || 0
        );
        return {
          cost: Number(l.priceCost || 0),
          sell: Number(l.priceSell || 0),
          taxRate,
        };
      }
    });
  }, [isDraft, lines, qtySig, productMap, pricingPrefs]);

  const draftTotals = useMemo(() => {
    if (!isDraft) return null;
    return (lines || []).reduce(
      (acc: any, r: any, idx: number) => {
        const q = Number(r.quantityOrdered || 0) || 0;
        const lp = livePrices[idx] || {
          cost: 0,
          sell: 0,
          taxRate: 0,
        };
        acc.qtyOrdered += q;
        acc.cost += Number(lp.cost || 0) * q;
        acc.sell += Number(lp.sell || 0) * q;
        return acc;
      },
      { qtyOrdered: 0, cost: 0, sell: 0 }
    );
  }, [isDraft, lines, qtySig]);

  const finalTotals = useMemo(() => {
    if (isDraft) return null;
    return (lines || []).reduce(
      (acc: any, r: any, idx: number) => {
        const qOrd = Number(r.quantityOrdered || 0) || 0;
        const qAct = Number(r.quantity || 0) || 0;
        const lp = livePrices[idx] || {
          cost: 0,
          sell: 0,
          taxRate: 0,
        };
        acc.qtyOrdered += qOrd;
        acc.qty += qAct;
        acc.cost += Number(lp.cost || 0) * qAct;
        acc.sell += Number(lp.sell || 0) * qAct;
        return acc;
      },
      { qtyOrdered: 0, qty: 0, cost: 0, sell: 0 }
    );
  }, [isDraft, lines]);

  const toDate = (value: any): Date | null => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatEta = (value: any) => {
    const date = toDate(value);
    if (!date) return "—";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  const getStatusInfo = (line: any, eta: Date | null) => {
    const qtyOrdered = Number(line?.quantityOrdered ?? 0);
    const qtyReceived = Number(line?.qtyReceived ?? 0);
    if (qtyOrdered > 0 && qtyReceived >= qtyOrdered) {
      return { label: "Received", color: "green" as const };
    }
    if (!eta) return null;
    const diffDays = Math.floor(
      (eta.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays < 0) return { label: "Late", color: "red" as const };
    if (diffDays <= 7) return { label: "Due soon", color: "yellow" as const };
    return null;
  };

  const getLeadTimeDaysForLine = useCallback(
    (line: any): number | null => {
      const product =
        productMap[Number(line?.productId || 0)] || line?.product || null;
      const productContext = product
        ? { leadTimeDays: product.leadTimeDays }
        : undefined;
      const companyContext =
        vendorDefaultLeadTimeDays != null
          ? { defaultLeadTimeDays: vendorDefaultLeadTimeDays }
          : undefined;
      return resolveLeadTimeDays({
        product: productContext,
        company: companyContext,
      });
    },
    [productMap, vendorDefaultLeadTimeDays]
  );

  const handleFillEta = useCallback(
    (idx: number) => {
      const line = lines[idx];
      if (!line) return;
      const leadTimeDays = getLeadTimeDaysForLine(line);
      if (!leadTimeDays) {
        notifications.show({
          title: "Missing lead time",
          message: "Set a product or vendor lead time to auto-fill ETA.",
          color: "yellow",
        });
        return;
      }
      const baseDate = purchaseDateValue ?? new Date();
      const eta = new Date(baseDate);
      eta.setHours(0, 0, 0, 0);
      eta.setDate(eta.getDate() + leadTimeDays);
      form.setValue(`lines.${idx}.etaDate` as any, eta.toISOString(), {
        shouldDirty: true,
      });
    },
    [form, getLeadTimeDaysForLine, lines, purchaseDateValue]
  );

  return (
    <>
      {isDraft ? (
        <Table withColumnBorders>
          <colgroup>
            <col style={{ width: "8ch" }} />
            <col style={{ width: "calc((100% - 104ch) * 0.28)" }} />
            <col style={{ width: "calc((100% - 104ch) * 0.72)" }} />
            <col style={{ width: "11ch" }} />
            <col style={{ width: "18ch" }} />
            <col style={{ width: "12ch" }} />
            <col style={{ width: "11ch" }} />
            <col style={{ width: "9ch" }} />
            <col style={{ width: "11ch" }} />
            <col style={{ width: "9ch" }} />
            <col style={{ width: "11ch" }} />
            <col style={{ width: "6ch" }} />
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              <Table.Th maw={10}>ID</Table.Th>
              <Table.Th>SKU</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Order Qty</Table.Th>
              <Table.Th>ETA</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Cost</Table.Th>
              <Table.Th>Tax</Table.Th>
              <Table.Th>Ext</Table.Th>
              <Table.Th>Sell</Table.Th>
              <Table.Th>Ext</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((r: any, idx: number) => {
              const lp = (livePrices[idx] as any) || {
                cost: 0,
                sell: 0,
                taxRate: 0,
              };
              const q = Number(r.quantityOrdered || 0) || 0;
              const pm = productMap[Number(r.productId || 0)];
              const manualFlag =
                (lp as any).isManualSell ||
                pm?.manualSalePrice != null ||
                pm?.c_isSellPriceManual === true;
              const etaDateValue = toDate(r.etaDate);
              const statusInfo = getStatusInfo(r, etaDateValue);
              const canAutofill = getLeadTimeDaysForLine(r) != null;
              return (
                <Table.Tr key={r.id ?? idx}>
                  <Table.Td>{r.id}</Table.Td>
                  <Table.Td>{r.sku ?? r.product?.sku ?? ""}</Table.Td>
                  <Table.Td>{r.name ?? r.product?.name ?? ""}</Table.Td>
                  <Table.Td>
                    <Controller
                      name={`lines.${idx}.quantityOrdered`}
                      control={form.control}
                      defaultValue={r.quantityOrdered ?? 0}
                      render={({ field }) => (
                        <NumberInput {...field} hideControls min={0} w="100%" />
                      )}
                    />
                    <Text size="xs" c="dimmed">
                      Reserved {formatQuantity(getReservedQty(r))} · Remaining{" "}
                      {formatQuantity(getRemainingQty(r))}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      <Controller
                        name={`lines.${idx}.etaDate`}
                        control={form.control}
                        defaultValue={r.etaDate ?? null}
                        render={({ field }) => (
                          <DateInput
                            value={
                              field.value ? new Date(field.value as any) : null
                            }
                            onChange={(value) =>
                              field.onChange(
                                value
                                  ? new Date(value as any).toISOString()
                                  : null
                              )
                            }
                            valueFormat="MMM DD, YYYY"
                            clearable
                            popoverProps={{ withinPortal: true }}
                            disabled={!isDraft}
                          />
                        )}
                      />
                      <Group gap={6} wrap="wrap">
                        <Controller
                          name={`lines.${idx}.etaDateConfirmed`}
                          control={form.control}
                          defaultValue={!!r.etaDateConfirmed}
                          render={({ field }) => (
                            <Checkbox
                              label="Confirmed"
                              checked={!!field.value}
                              onChange={(e) =>
                                field.onChange(e.currentTarget.checked)
                              }
                              disabled={!isDraft}
                            />
                          )}
                        />
                        <Tooltip
                          label="Set a product or vendor lead time"
                          disabled={canAutofill}
                          withinPortal
                        >
                          <Button
                            size="compact-xs"
                            variant="default"
                            onClick={() => handleFillEta(idx)}
                            disabled={!isDraft || !canAutofill}
                          >
                            Fill from lead time
                          </Button>
                        </Tooltip>
                      </Group>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    {statusInfo ? (
                      <Badge color={statusInfo.color} variant="light">
                        {statusInfo.label}
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{formatUSD(lp.cost)}</Table.Td>
                  <Table.Td>
                    {r.product?.purchaseTax?.code ||
                      productMap[Number(r.productId || 0)]?.purchaseTax?.code ||
                      ""}
                  </Table.Td>
                  <Table.Td>{formatUSD(lp.extendedCost)}</Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap" align="center">
                      {manualFlag ? (
                        <Indicator
                          color="red"
                          position="middle-start"
                          offset={-5}
                          size="4"
                          processing
                        >
                          <span>{formatUSD(lp.sell)}</span>
                        </Indicator>
                      ) : (
                        <span>{formatUSD(lp.sell)}</span>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{formatUSD(lp.extendedSell)}</Table.Td>
                  <Table.Td>
                    <Menu withinPortal position="bottom-end" shadow="md">
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          aria-label="Row actions"
                        >
                          <IconMenu2 size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {onOpenReservations ? (
                          <Menu.Item onClick={() => onOpenReservations(r)}>
                            Manage reservations
                          </Menu.Item>
                        ) : null}
                        <Menu.Item
                          color="red"
                          disabled={isComplete}
                          onClick={() => {
                            // Remove line from form state (draft only)
                            const curr = [...lines];
                            curr.splice(idx, 1);
                            form.setValue("lines", curr, { shouldDirty: true });
                          }}
                        >
                          Delete Line
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            <Table.Tr>
              <Table.Td colSpan={3}>
                <strong>Totals</strong>
              </Table.Td>
              <Table.Td>
                <strong>{draftTotals?.qtyOrdered ?? 0}</strong>
              </Table.Td>
              <Table.Td />
              <Table.Td />
              <Table.Td />
              <Table.Td />
              <Table.Td />
              <Table.Td>
                <strong>{formatUSD(draftTotals?.cost ?? 0)}</strong>
              </Table.Td>
              <Table.Td />
              <Table.Td>
                <strong>{formatUSD(draftTotals?.sell ?? 0)}</strong>
              </Table.Td>
              <Table.Td />
            </Table.Tr>
          </Table.Tbody>
        </Table>
      ) : (
        <Table withTableBorder withColumnBorders>
          {/* Final mode: keep numeric columns at 9ch; SKU/Name share remainder */}
          <colgroup>
            <col style={{ width: "9ch" }} />
            {/* ID */}
            <col style={{ width: "calc((100% - 63ch) * 0.33)" }} />
            {/* SKU */}
            <col style={{ width: "calc((100% - 63ch) * 0.67)" }} />
            {/* Name */}
            <col style={{ width: "9ch" }} />
            {/* Order Qty */}
            <col style={{ width: "9ch" }} />
            {/* Actual Qty */}
            <col style={{ width: "9ch" }} />
            {/* Shipped */}
            <col style={{ width: "9ch" }} />
            {/* Received */}
            <col style={{ width: "14ch" }} />
            {/* ETA */}
            <col style={{ width: "9ch" }} />
            {/* Status */}
            <col style={{ width: "9ch" }} />
            {/* Cost */}
            <col style={{ width: "9ch" }} />
            {/* Sell */}
            <col style={{ width: "6ch" }} />
            {/* Actions */}
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>SKU</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Order Qty</Table.Th>
              <Table.Th>Actual Qty</Table.Th>
              <Table.Th>Shipped</Table.Th>
              <Table.Th>Received</Table.Th>
              <Table.Th>ETA</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Cost</Table.Th>
              <Table.Th>Sell</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(lines || []).map((r: any, idx: number) => {
              const lp = (livePrices[idx] as any) || {
                cost: 0,
                sell: 0,
                taxRate: 0,
              };
              const pm = productMap[Number(r.productId || 0)];
              const manualFlag =
                (lp as any).isManualSell ||
                pm?.manualSalePrice != null ||
                pm?.c_isSellPriceManual === true;
              const etaDateValue = toDate(r.etaDate);
              const statusInfo = getStatusInfo(r, etaDateValue);
              return (
                <Table.Tr key={r.id ?? idx}>
                  <Table.Td>{r.id}</Table.Td>
                  <Table.Td>{r.sku ?? r.product?.sku ?? ""}</Table.Td>
                  <Table.Td>{r.name ?? r.product?.name ?? ""}</Table.Td>
                  <Table.Td>
                    {r.quantityOrdered ?? 0}
                    <Text size="xs" c="dimmed">
                      Reserved {formatQuantity(getReservedQty(r))} · Remaining{" "}
                      {formatQuantity(getRemainingQty(r))}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Controller
                      name={`lines.${idx}.quantity`}
                      control={form.control}
                      defaultValue={r.quantity ?? 0}
                      render={({ field }) => (
                        <NumberInput
                          {...field}
                          hideControls
                          min={Number(r.qtyReceived || 0)}
                          w={80}
                          disabled={isComplete}
                        />
                      )}
                    />
                  </Table.Td>
                  <Table.Td>{r.qtyShipped ?? 0}</Table.Td>
                  <Table.Td>{r.qtyReceived ?? 0}</Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      <Text size="sm">{formatEta(r.etaDate)}</Text>
                      {r.etaDateConfirmed && (
                        <Badge color="blue" variant="light" size="sm">
                          Confirmed
                        </Badge>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    {statusInfo ? (
                      <Badge color={statusInfo.color} variant="light">
                        {statusInfo.label}
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{formatUSD(lp.cost)}</Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap" align="center">
                      {manualFlag ? (
                        <Indicator inline color="red" size={8} processing>
                          <span>{formatUSD(lp.sell)}</span>
                        </Indicator>
                      ) : (
                        <span>{formatUSD(lp.sell)}</span>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Menu withinPortal position="bottom-end" shadow="md">
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          aria-label="Row actions"
                        >
                          <IconMenu2 size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {onOpenReservations ? (
                          <Menu.Item onClick={() => onOpenReservations(r)}>
                            Manage reservations
                          </Menu.Item>
                        ) : null}
                        <Menu.Item
                          color="red"
                          disabled={isComplete || !isDraft}
                          onClick={() => {
                            if (!isDraft) return; // Only allow delete in draft
                            const curr = [...lines];
                            curr.splice(idx, 1);
                            form.setValue("lines", curr, { shouldDirty: true });
                          }}
                        >
                          Delete Line
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            <Table.Tr>
              <Table.Td colSpan={3}>
                <strong>Totals</strong>
              </Table.Td>
              <Table.Td>
                <strong>{finalTotals?.qtyOrdered ?? 0}</strong>
              </Table.Td>
              <Table.Td>
                <strong>{finalTotals?.qty ?? 0}</strong>
              </Table.Td>
              <Table.Td></Table.Td>
              <Table.Td></Table.Td>
              <Table.Td>
                <strong>{formatUSD(finalTotals?.cost ?? 0)}</strong>
              </Table.Td>
              <Table.Td>
                <strong>{formatUSD(finalTotals?.sell ?? 0)}</strong>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
