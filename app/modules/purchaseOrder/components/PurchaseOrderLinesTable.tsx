import { useEffect, useMemo, useRef } from "react";
import { Controller, useWatch } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { NumberInput, Table } from "@mantine/core";
import { calcPrice } from "~/modules/product/calc/calcPrice";
import { formatUSD } from "~/utils/format";

type Props = {
  form: UseFormReturn<any>;
  status: string;
  productMap: Record<number, any>;
};

export function PurchaseOrderLinesTable({ form, status, productMap }: Props) {
  const lines: any[] =
    useWatch({ control: form.control, name: "lines" }) ||
    (form.getValues("lines") as any[]) ||
    [];

  const isDraft = status === "DRAFT";

  const getLivePrices = (productId?: number, qtyOrdered?: number) => {
    const pid = Number(productId || 0);
    const prod = productMap[pid];
    const qty = Number(qtyOrdered || 0) || 0;
    if (!prod) return { cost: 0, sell: 0, taxRate: 0 };
    const cost = Number(prod.costPrice || 0);
    if (prod.manualSalePrice != null) {
      return {
        cost,
        sell: Number(prod.manualSalePrice || 0),
        taxRate: Number(prod.purchaseTax?.value || 0),
      };
    }
    const tiers = (prod.costGroup?.costRanges || []).map((t: any) => ({
      minQty: Number(t.rangeFrom || 0),
      priceCost: Number(t.costPrice || 0),
    }));
    const taxRate = Number(prod.purchaseTax?.value || 0);
    const out = calcPrice({
      baseCost: cost,
      tiers,
      taxRate,
      qty: qty > 0 ? qty : 1,
    });
    console.log("Live prices", productId, qtyOrdered, out);
    return {
      cost: out.breakdown.baseUnit,
      sell: out.unitSellPrice,
      extendedCost: out.extendedCost,
      extendedSell: out.extendedSell,
      taxRate,
    };
  };

  const qtySig = useMemo(
    () =>
      (lines || [])
        .map((l: any) => `${l.productId}:${l.quantityOrdered}`)
        .join("|"),
    [lines]
  );

  // Keep computed per-line prices in a ref aligned by row index
  const livePricesRef = useRef<
    Array<{ cost: number; sell: number; taxRate: number }>
  >([]);

  useEffect(() => {
    const arr = (lines || []).map((l: any) => {
      if (isDraft) {
        const live = getLivePrices(l.productId, l.quantityOrdered);
        return live;
      } else {
        // For finalized, show persisted values
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
    livePricesRef.current = arr;
  }, [isDraft, lines, qtySig, productMap]);

  const draftTotals = useMemo(() => {
    if (!isDraft) return null;
    return (lines || []).reduce(
      (acc: any, r: any, idx: number) => {
        const q = Number(r.quantityOrdered || 0) || 0;
        const lp = livePricesRef.current[idx] || {
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
        const lp = livePricesRef.current[idx] || {
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
        <Table withTableBorder withColumnBorders>
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
              const lp = livePricesRef.current[idx] || {
                cost: 0,
                sell: 0,
                taxRate: 0,
              };
              const q = Number(r.quantityOrdered || 0) || 0;
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
                        <NumberInput {...field} hideControls min={0} w={80} />
                      )}
                    />
                  </Table.Td>
                  <Table.Td>{formatUSD(lp.cost)}</Table.Td>
                  <Table.Td>{r.product.purchaseTax.code}</Table.Td>
                  <Table.Td>{formatUSD(lp.extendedCost)}</Table.Td>
                  <Table.Td>{formatUSD(lp.sell)}</Table.Td>
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
              const lp = livePricesRef.current[idx] || {
                cost: 0,
                sell: 0,
                taxRate: 0,
              };
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
                        <NumberInput {...field} hideControls min={0} w={80} />
                      )}
                    />
                  </Table.Td>
                  <Table.Td>{r.qtyShipped ?? 0}</Table.Td>
                  <Table.Td>{r.qtyReceived ?? 0}</Table.Td>
                  <Table.Td>{formatUSD(lp.cost)}</Table.Td>
                  <Table.Td>{formatUSD(lp.sell)}</Table.Td>
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
