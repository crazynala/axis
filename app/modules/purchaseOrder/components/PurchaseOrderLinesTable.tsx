import { useEffect, useMemo } from "react";
import { Controller, useWatch } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { Group, Indicator, NumberInput, Table } from "@mantine/core";
import { calcPrice } from "~/modules/product/calc/calcPrice";
import { formatUSD } from "~/utils/format";

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
};

export function PurchaseOrderLinesTable({
  form,
  status,
  productMap,
  pricingPrefs,
}: Props) {
  const lines: any[] =
    useWatch({ control: form.control, name: "lines" }) ||
    (form.getValues("lines") as any[]) ||
    [];

  const isDraft = status === "DRAFT";
  const isComplete = status === "COMPLETE" || status === "CANCELED";

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

  return (
    <>
      {isDraft ? (
        <Table withColumnBorders>
          {/* Column widths: 7 fixed numeric columns at 9ch each; SKU/Name share remainder 33%/67% */}
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
            {/* Cost */}
            <col style={{ width: "9ch" }} />
            {/* Tax */}
            <col style={{ width: "9ch" }} />
            {/* Ext (Cost) */}
            <col style={{ width: "9ch" }} />
            {/* Sell */}
            <col style={{ width: "9ch" }} />
            {/* Ext (Sell) */}
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              <Table.Th maw={10}>ID</Table.Th>
              <Table.Th>SKU</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Order Qty</Table.Th>
              <Table.Th>Cost</Table.Th>
              <Table.Th>Tax</Table.Th>
              <Table.Th>Ext</Table.Th>
              <Table.Th>Sell</Table.Th>
              <Table.Th>Ext</Table.Th>
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
              <Table.Td>
                <strong>{formatUSD(draftTotals?.cost ?? 0)}</strong>
              </Table.Td>
              <Table.Td />
              <Table.Td>
                <strong>{formatUSD(draftTotals?.sell ?? 0)}</strong>
              </Table.Td>
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
            <col style={{ width: "9ch" }} />
            {/* Cost */}
            <col style={{ width: "9ch" }} />
            {/* Sell */}
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
              <Table.Th>Cost</Table.Th>
              <Table.Th>Sell</Table.Th>
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
              return (
                <Table.Tr key={r.id ?? idx}>
                  <Table.Td>{r.id}</Table.Td>
                  <Table.Td>{r.sku ?? r.product?.sku ?? ""}</Table.Td>
                  <Table.Td>{r.name ?? r.product?.name ?? ""}</Table.Td>
                  <Table.Td>{r.quantityOrdered ?? 0}</Table.Td>
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
