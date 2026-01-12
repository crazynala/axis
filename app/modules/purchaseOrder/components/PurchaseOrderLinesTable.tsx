import { useCallback, useEffect, useMemo, useRef } from "react";
import { Controller, useWatch } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import {
  Group,
  NumberInput,
  Table,
  ActionIcon,
  Menu,
  Badge,
  Text,
  Tooltip,
  Stack,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconCheck, IconClock, IconMenu2 } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { computeLinePricing } from "~/modules/purchaseOrder/helpers/poPricing";
import { ProductStageIndicator } from "~/modules/product/components/ProductStageIndicator";
import { JumpLink } from "~/components/JumpLink";
import { PricingValueWithMeta } from "~/components/PricingValueWithMeta";
import { formatMoney, formatUSD } from "~/utils/format";
import { resolveLeadTimeDays } from "~/utils/leadTime";
import { makePricedValue } from "~/utils/pricingValueMeta";

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
  viewMode?: "status" | "extended";
};

export function PurchaseOrderLinesTable({
  form,
  status,
  productMap,
  pricingPrefs,
  purchaseDate,
  vendorLeadTimeDays,
  onOpenReservations,
  viewMode = "status",
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
  const shortDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        year: "2-digit",
        month: "numeric",
        day: "numeric",
      }),
    []
  );
  const shortDateFormatPattern = useMemo(() => {
    const parts = shortDateFormatter.formatToParts(new Date(2006, 0, 2));
    return parts
      .map((part) => {
        switch (part.type) {
          case "day":
            return "D";
          case "month":
            return "M";
          case "year":
            return "YY";
          default:
            return part.value;
        }
      })
      .join("");
  }, [shortDateFormatter]);
  const vendorDefaultLeadTimeDays =
    vendorLeadTimeDays != null && Number.isFinite(Number(vendorLeadTimeDays))
      ? Number(vendorLeadTimeDays)
      : null;

  const isDraft = status === "DRAFT";
  const isComplete = status === "COMPLETE" || status === "CANCELED";
  const showStatus = viewMode === "status";
  const showExtended = viewMode === "extended";

  const getReservedQty = useCallback((line: any) => {
    if (!line) return 0;
    if (line.reservedQty != null) return Number(line.reservedQty) || 0;
    return (line.reservations || []).reduce(
      (sum: number, res: any) =>
        res.settledAt ? sum : sum + (Number(res.qtyReserved) || 0),
      0
    );
  }, []);
  const resolveExpectedQty = useCallback((line: any) => {
    if (!line) return 0;
    const qty = Number(line.quantity ?? 0) || 0;
    const ordered = Number(line.quantityOrdered ?? 0) || 0;
    if (qty > 0) return qty;
    if (ordered > 0) return ordered;
    return qty || ordered || 0;
  }, []);
  const getRemainingQty = useCallback(
    (line: any) => {
      if (!line) return 0;
      if (line.availableQty != null) {
        return Math.max(Number(line.availableQty) || 0, 0);
      }
      const expected = resolveExpectedQty(line);
      const received = Number(line.qtyReceived || 0) || 0;
      return Math.max(expected - received - getReservedQty(line), 0);
    },
    [getReservedQty, resolveExpectedQty]
  );

  const formatQuantity = (value: number | null | undefined) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString();
  };
  const normalizeTaxRate = (value: number | null | undefined) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num) || num === 0) return 0;
    return num > 1 ? num / 100 : num;
  };
  const formatTaxRate = (value: number | null | undefined) => {
    const norm = normalizeTaxRate(value);
    if (!norm) return "—";
    const pct = norm * 100;
    const label = pct.toFixed(2).replace(/\.?0+$/, "");
    return `${label}%`;
  };
  const formatUnitCost = (value: number | null | undefined) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return "";
    if (num !== 0 && Math.abs(num) < 0.01) {
      return formatMoney(num, {
        currency: "USD",
        minimumFractionDigits: 4,
        maximumFractionDigits: 8,
      });
    }
    return formatUSD(num);
  };

  const getComputedPrices = (line: any) => {
    const pid = Number(line?.productId || line?.product?.id || 0);
    const prod = productMap[pid] || line?.product || null;
    return computeLinePricing({
      product: prod,
      qtyOrdered: line?.quantityOrdered,
      pricingPrefs,
    });
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
      const computed = getComputedPrices(l);
      const manualCost = l.manualCost != null ? Number(l.manualCost) : null;
      const manualSell = l.manualSell != null ? Number(l.manualSell) : null;
      const storedCost = l.priceCost != null ? Number(l.priceCost) : null;
      const storedSell = l.priceSell != null ? Number(l.priceSell) : null;
      const isLocked = !isDraft;
      const effectiveCost =
        manualCost != null
          ? manualCost
          : storedCost != null
          ? storedCost
          : computed.cost;
      const effectiveSell =
        manualSell != null
          ? manualSell
          : storedSell != null
          ? storedSell
          : computed.sell;
      const qty = Number(l.quantityOrdered || 0) || 0;
      const taxRate = normalizeTaxRate(
        l.taxRate ?? l.product?.purchaseTax?.value ?? computed.taxRate ?? 0
      );
      const effectiveCostWithTax = effectiveCost * (1 + taxRate);
      const pricedCost = makePricedValue(effectiveCost, {
        isLocked,
        isOverridden: manualCost != null,
        lockedValue: effectiveCost,
        currentValue: computed.cost,
      });
      const pricedSell = makePricedValue(effectiveSell, {
        isLocked,
        isOverridden: manualSell != null,
        lockedValue: effectiveSell,
        currentValue: computed.sell,
      });
      return {
        computedCost: computed.cost,
        computedSell: computed.sell,
        extendedCost: effectiveCost * qty,
        extendedSell: effectiveSell * qty,
        effectiveCostWithTax,
        extendedCostWithTax: effectiveCostWithTax * qty,
        taxRate,
        isManualSell: computed.isManualSell,
        effectiveCost,
        effectiveSell,
        storedCost,
        storedSell,
        pricedCost,
        pricedSell,
        pricedExtCost: { value: effectiveCost * qty, meta: pricedCost.meta },
        pricedExtSell: { value: effectiveSell * qty, meta: pricedSell.meta },
        priceSourceCost: manualCost != null ? "manual" : "computed",
        priceSourceSell: manualSell != null ? "manual" : "computed",
      };
    });
  }, [isDraft, lines, qtySig, productMap, pricingPrefs]);

  const toDate = (value: any): Date | null => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatEta = (value: any) => {
    const date = toDate(value);
    if (!date) return "—";
    return shortDateFormatter.format(date);
  };

  const isFullyReceived = (line: any) => {
    const expected = resolveExpectedQty(line);
    const received = Number(line?.qtyReceived ?? 0) || 0;
    return expected > 0 && received >= expected;
  };

  const renderEtaCell = (line: any, idx: number) => {
    const canEditEta = isDraft || (!isComplete && !isFullyReceived(line));
    const canAutofill = getLeadTimeDaysForLine(line) != null;
    const showConfirm = canEditEta || !!line?.etaDateConfirmed;
    const hasEta = Boolean(line?.etaDate);
    const confirmedBy =
      line?.etaConfirmedByUser?.name ||
      line?.etaConfirmedByUser?.email ||
      (line?.etaConfirmedByUserId ? `User ${line.etaConfirmedByUserId}` : null);
    const confirmedAt = line?.etaConfirmedAt
      ? new Date(line.etaConfirmedAt as any).toLocaleDateString()
      : null;
    const confirmTooltip = !hasEta
      ? "Set an ETA to confirm."
      : line?.etaDateConfirmed && (confirmedBy || confirmedAt)
      ? `Confirmed by ${confirmedBy ?? "user"}${
          confirmedAt ? ` on ${confirmedAt}` : ""
        }`
      : line?.etaDateConfirmed
      ? "Confirmed"
      : "Not confirmed";
    return (
      <Group gap={6} wrap="nowrap">
        {canEditEta ? (
          <Controller
            name={`lines.${idx}.etaDate`}
            control={form.control}
            defaultValue={line.etaDate ?? null}
            render={({ field }) => (
              <DateInput
                value={field.value ? new Date(field.value as any) : null}
                onChange={(value) => {
                  field.onChange(
                    value ? new Date(value as any).toISOString() : null
                  );
                  form.setValue(`lines.${idx}.etaDateConfirmed` as any, false, {
                    shouldDirty: true,
                  });
                  form.setValue(`lines.${idx}.etaConfirmedAt` as any, null, {
                    shouldDirty: true,
                  });
                  form.setValue(
                    `lines.${idx}.etaConfirmedByUserId` as any,
                    null,
                    { shouldDirty: true }
                  );
                }}
                valueFormat={shortDateFormatPattern}
                clearable
                popoverProps={{ withinPortal: true }}
                disabled={!canEditEta}
                w={130}
              />
            )}
          />
        ) : (
          <Text size="sm">{formatEta(line.etaDate)}</Text>
        )}
        {showConfirm ? (
          <Controller
            name={`lines.${idx}.etaDateConfirmed`}
            control={form.control}
            defaultValue={!!line.etaDateConfirmed}
            render={({ field }) => (
              <Tooltip label={confirmTooltip} withArrow>
                <span>
                  <ActionIcon
                    variant={field.value ? "light" : "subtle"}
                    color={field.value ? "green" : "gray"}
                    size="sm"
                    onClick={() => {
                      if (!hasEta) return;
                      const next = !field.value;
                      field.onChange(next);
                      if (!next) {
                        form.setValue(
                          `lines.${idx}.etaConfirmedAt` as any,
                          null,
                          { shouldDirty: true }
                        );
                        form.setValue(
                          `lines.${idx}.etaConfirmedByUserId` as any,
                          null,
                          { shouldDirty: true }
                        );
                      }
                    }}
                    disabled={!canEditEta || !hasEta}
                    aria-label="Confirm ETA"
                  >
                    <IconCheck size={14} />
                  </ActionIcon>
                </span>
              </Tooltip>
            )}
          />
        ) : null}
        {canEditEta && canAutofill ? (
          <Tooltip label="Use lead time" withArrow>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => handleFillEta(idx)}
              aria-label="Use lead time"
            >
              <IconClock size={14} />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </Group>
    );
  };

  const getStatusInfo = (line: any, eta: Date | null) => {
    const qtyExpected = resolveExpectedQty(line);
    const qtyReceived = Number(line?.qtyReceived ?? 0);
    if (qtyExpected > 0 && qtyReceived >= qtyExpected) {
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

  const autoEtaAppliedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!isDraft) return;
    (lines || []).forEach((line: any, idx: number) => {
      const lineId = Number(line?.id ?? idx);
      if (autoEtaAppliedRef.current.has(lineId)) return;
      if (line?.etaDate) return;
      const leadTimeDays = getLeadTimeDaysForLine(line);
      if (!leadTimeDays) return;
      const baseDate = purchaseDateValue ?? new Date();
      const eta = new Date(baseDate);
      eta.setHours(0, 0, 0, 0);
      eta.setDate(eta.getDate() + leadTimeDays);
      form.setValue(`lines.${idx}.etaDate` as any, eta.toISOString(), {
        shouldDirty: true,
      });
      autoEtaAppliedRef.current.add(lineId);
    });
  }, [form, getLeadTimeDaysForLine, isDraft, lines, purchaseDateValue]);

  return (
    <>
      {isDraft ? (
        <Table withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w="60">ID</Table.Th>
              <Table.Th miw="80">SKU</Table.Th>
              <Table.Th miw="120">Name</Table.Th>
              <Table.Th w="0">Order Qty</Table.Th>
              {showStatus ? <Table.Th>Rsrv</Table.Th> : null}
              {showStatus ? <Table.Th>ETA ✓</Table.Th> : null}
              {showStatus ? <Table.Th miw="80">Status</Table.Th> : null}
              {showStatus ? <Table.Th>Rcvd</Table.Th> : null}
              {showStatus ? <Table.Th>Open</Table.Th> : null}
              <Table.Th>Cost</Table.Th>
              <Table.Th>Tax</Table.Th>
              <Table.Th>C+Tax</Table.Th>
              {showExtended ? <Table.Th>Ext Cost</Table.Th> : null}
              <Table.Th>Sell</Table.Th>
              {showExtended ? <Table.Th>Ext Sell</Table.Th> : null}
              <Table.Th w="40"></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((r: any, idx: number) => {
              const lp = (livePrices[idx] as any) || {
                cost: 0,
                sell: 0,
                taxRate: 0,
              };
              const pm = productMap[Number(r.productId || 0)];
              const manualFlag = (lp as any).priceSourceSell === "manual";
              const etaDateValue = toDate(r.etaDate);
              const statusInfo = getStatusInfo(r, etaDateValue);
              const productId = Number(
                r.productId ?? r.product?.id ?? r.product?.productId ?? 0
              );
              const idLabel = r.id ?? "";
              return (
                <Table.Tr key={r.id ?? idx}>
                  <Table.Td>
                    {productId ? (
                      <JumpLink to={`/products/${productId}`} label={idLabel} />
                    ) : (
                      idLabel
                    )}
                  </Table.Td>
                  <Table.Td>{r.sku ?? r.product?.sku ?? ""}</Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text>{r.name ?? r.product?.name ?? ""}</Text>
                      <ProductStageIndicator
                        stage={pm?.productStage ?? r.product?.productStage}
                        variant="secondaryText"
                      />
                    </Group>
                  </Table.Td>
                  <Table.Td p={0}>
                    <Controller
                      name={`lines.${idx}.quantityOrdered`}
                      control={form.control}
                      defaultValue={r.quantityOrdered ?? 0}
                      render={({ field }) => (
                        <NumberInput {...field} hideControls min={0} maw="80" />
                      )}
                    />
                  </Table.Td>
                  {showStatus ? (
                    <Table.Td>
                      <Tooltip
                        label={`Reserved ${formatQuantity(
                          getReservedQty(r)
                        )} · Remaining ${formatQuantity(getRemainingQty(r))}`}
                        withArrow
                      >
                        <Text size="sm">
                          {formatQuantity(getReservedQty(r))}
                        </Text>
                      </Tooltip>
                    </Table.Td>
                  ) : null}
                  {showStatus ? (
                    <Table.Td p={0}>{renderEtaCell(r, idx)}</Table.Td>
                  ) : null}
                  {showStatus ? (
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
                  ) : null}
                  {showStatus ? (
                    <Table.Td>{formatQuantity(r.qtyReceived ?? 0)}</Table.Td>
                  ) : null}
                  {showStatus ? (
                    <Table.Td>{formatQuantity(getRemainingQty(r))}</Table.Td>
                  ) : null}
                  <Table.Td>
                    {lp.priceSourceCost === "manual" ? (
                      <PricingValueWithMeta
                        priced={lp.pricedCost}
                        formatValue={formatUnitCost}
                      />
                    ) : lp.computedCost > 0 && lp.storedCost == null ? (
                      <Tooltip
                        label={`Suggested from product: ${formatUnitCost(
                          lp.computedCost
                        )}`}
                        withArrow
                      >
                        <span>
                          <PricingValueWithMeta
                            priced={lp.pricedCost}
                            formatValue={formatUnitCost}
                          />
                        </span>
                      </Tooltip>
                    ) : (
                      <PricingValueWithMeta
                        priced={lp.pricedCost}
                        formatValue={formatUnitCost}
                      />
                    )}
                  </Table.Td>
                  <Table.Td>
                    {formatTaxRate(
                      Number(
                        r.taxRate ??
                          r.product?.purchaseTax?.value ??
                          productMap[Number(r.productId || 0)]?.purchaseTax
                            ?.value ??
                          0
                      )
                    )}
                  </Table.Td>
                  <Table.Td>{formatUSD(lp.effectiveCostWithTax)}</Table.Td>
                  {showExtended ? (
                    <Table.Td>
                      <PricingValueWithMeta
                        priced={lp.pricedExtCost}
                        formatValue={formatUSD}
                      />
                    </Table.Td>
                  ) : null}
                  <Table.Td>
                    {manualFlag ? (
                      <PricingValueWithMeta
                        priced={lp.pricedSell}
                        formatValue={formatUSD}
                      />
                    ) : lp.computedSell > 0 && lp.storedSell == null ? (
                      <Tooltip
                        label={`Suggested from product: ${formatUSD(
                          lp.computedSell
                        )}`}
                        withArrow
                      >
                        <span>
                          <PricingValueWithMeta
                            priced={lp.pricedSell}
                            formatValue={formatUSD}
                          />
                        </span>
                      </Tooltip>
                    ) : (
                      <PricingValueWithMeta
                        priced={lp.pricedSell}
                        formatValue={formatUSD}
                      />
                    )}
                  </Table.Td>
                  {showExtended ? (
                    <Table.Td>
                      <PricingValueWithMeta
                        priced={lp.pricedExtSell}
                        formatValue={formatUSD}
                      />
                    </Table.Td>
                  ) : null}
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
          </Table.Tbody>
        </Table>
      ) : (
        <Table withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w="60">ID</Table.Th>
              <Table.Th miw="80">SKU</Table.Th>
              <Table.Th miw="120">Name</Table.Th>
              <Table.Th w="0">Order Qty</Table.Th>
              {showStatus ? <Table.Th>Rsrv</Table.Th> : null}
              {showStatus ? <Table.Th>ETA ✓</Table.Th> : null}
              {showStatus ? <Table.Th miw="80">Status</Table.Th> : null}
              {showStatus ? <Table.Th>Received</Table.Th> : null}
              {showStatus ? <Table.Th>Remaining</Table.Th> : null}
              <Table.Th>Cost</Table.Th>
              <Table.Th>Tax</Table.Th>
              <Table.Th>C+Tax</Table.Th>
              {showExtended ? <Table.Th>Ext Cost</Table.Th> : null}
              <Table.Th>Sell</Table.Th>
              {showExtended ? <Table.Th>Ext Sell</Table.Th> : null}
              <Table.Th w="40"></Table.Th>
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
              const manualFlag = (lp as any).priceSourceSell === "manual";
              const etaDateValue = toDate(r.etaDate);
              const statusInfo = getStatusInfo(r, etaDateValue);
              const productId = Number(
                r.productId ?? r.product?.id ?? r.product?.productId ?? 0
              );
              const idLabel = r.id ?? "";
              return (
                <Table.Tr key={r.id ?? idx}>
                  <Table.Td>
                    {productId ? (
                      <JumpLink to={`/products/${productId}`} label={idLabel} />
                    ) : (
                      idLabel
                    )}
                  </Table.Td>
                  <Table.Td>{r.sku ?? r.product?.sku ?? ""}</Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text>{r.name ?? r.product?.name ?? ""}</Text>
                      <ProductStageIndicator
                        stage={pm?.productStage ?? r.product?.productStage}
                        variant="secondaryText"
                      />
                    </Group>
                  </Table.Td>
                  <Table.Td>{r.quantityOrdered ?? 0}</Table.Td>
                  {showStatus ? (
                    <Table.Td>
                      <Tooltip
                        label={`Reserved ${formatQuantity(
                          getReservedQty(r)
                        )} · Remaining ${formatQuantity(getRemainingQty(r))}`}
                        withArrow
                      >
                        <Text size="sm">
                          {formatQuantity(getReservedQty(r))}
                        </Text>
                      </Tooltip>
                    </Table.Td>
                  ) : null}
                  {showStatus ? (
                    <Table.Td>{renderEtaCell(r, idx)}</Table.Td>
                  ) : null}
                  {showStatus ? (
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
                  ) : null}
                  {showStatus ? (
                    <Table.Td>{formatQuantity(r.qtyReceived ?? 0)}</Table.Td>
                  ) : null}
                  {showStatus ? (
                    <Table.Td>{formatQuantity(getRemainingQty(r))}</Table.Td>
                  ) : null}
                  <Table.Td>
                    {lp.priceSourceCost === "manual" ? (
                      <PricingValueWithMeta
                        priced={lp.pricedCost}
                        formatValue={formatUnitCost}
                      />
                    ) : lp.computedCost > 0 && lp.storedCost == null ? (
                      <Tooltip
                        label={`Suggested from product: ${formatUnitCost(
                          lp.computedCost
                        )}`}
                        withArrow
                      >
                        <span>
                          <PricingValueWithMeta
                            priced={lp.pricedCost}
                            formatValue={formatUnitCost}
                          />
                        </span>
                      </Tooltip>
                    ) : (
                      <PricingValueWithMeta
                        priced={lp.pricedCost}
                        formatValue={formatUnitCost}
                      />
                    )}
                  </Table.Td>
                  <Table.Td>
                    {formatTaxRate(
                      Number(r.taxRate ?? r.product?.purchaseTax?.value ?? 0)
                    )}
                  </Table.Td>
                  <Table.Td>{formatUSD(lp.effectiveCostWithTax)}</Table.Td>
                  {showExtended ? (
                    <Table.Td>
                      <PricingValueWithMeta
                        priced={lp.pricedExtCost}
                        formatValue={formatUSD}
                      />
                    </Table.Td>
                  ) : null}
                  <Table.Td>
                    {manualFlag ? (
                      <PricingValueWithMeta
                        priced={lp.pricedSell}
                        formatValue={formatUSD}
                      />
                    ) : lp.computedSell > 0 && lp.storedSell == null ? (
                      <Tooltip
                        label={`Suggested from product: ${formatUSD(
                          lp.computedSell
                        )}`}
                        withArrow
                      >
                        <span>
                          <PricingValueWithMeta
                            priced={lp.pricedSell}
                            formatValue={formatUSD}
                          />
                        </span>
                      </Tooltip>
                    ) : (
                      <PricingValueWithMeta
                        priced={lp.pricedSell}
                        formatValue={formatUSD}
                      />
                    )}
                  </Table.Td>
                  {showExtended ? (
                    <Table.Td>
                      <PricingValueWithMeta
                        priced={lp.pricedExtSell}
                        formatValue={formatUSD}
                      />
                    </Table.Td>
                  ) : null}
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
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
