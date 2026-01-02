import { useEffect, useState } from "react";
import { Link } from "@remix-run/react";
import { Group, Indicator } from "@mantine/core";
import { IconBaselineDensityMedium } from "@tabler/icons-react";
import { getDefaultColumnKeys, type ColumnDef } from "~/base/index/columns";
import { formatUSD } from "~/utils/format";
import { calcPrice } from "../calc/calcPrice";

export type ProductPricingPrefs = {
  customerId: string | null;
  qty: number;
  priceMultiplier: number;
};

function PriceCell({
  row,
  prefs,
}: {
  row: any;
  prefs: { qty: number; priceMultiplier: number };
}) {
  const qty = Number(prefs.qty || 60) || 60;
  const priceMultiplier = Number(prefs.priceMultiplier || 1) || 1;
  const manual = row?.manualSalePrice;
  const baseCost = Number(row?.costPrice ?? 0) || 0;
  const taxRate = Number(row?.purchaseTax?.value ?? 0) || 0;
  const costRanges = Array.isArray(row?.costGroup?.costRanges)
    ? row.costGroup.costRanges
        .filter((t: any) => t && t.rangeFrom != null)
        .map((t: any) => ({
          minQty: Number(t.rangeFrom) || 0,
          priceCost: Number(t.costPrice) || 0,
        }))
        .sort((a: any, b: any) => a.minQty - b.minQty)
    : [];
  const out = calcPrice({
    baseCost,
    tiers: costRanges,
    taxRate,
    priceMultiplier,
    qty,
    manualSalePrice:
      manual != null && manual !== "" ? Number(manual) : undefined,
  });
  return <>{formatUSD(out.unitSellPrice)}</>;
}

function StockCell({
  row,
  customerId,
}: {
  row: any;
  customerId: string | null;
}) {
  if (!row?.stockTrackingEnabled) return <></>;
  const [extra, setExtra] = useState<any | null>(null);
  useEffect(() => {
    if (!row?.stockTrackingEnabled) return;
    const hasData =
      (Array.isArray(row?.c_byLocation) && row.c_byLocation.length > 0) ||
      row?.c_stockQty != null;
    if (hasData) return;
    let abort = false;
    (async () => {
      try {
        const resp = await fetch(`/api.products.by-ids?ids=${row.id}`);
        if (!resp.ok) return;
        const data = await resp.json();
        const item = Array.isArray(data?.items) ? data.items[0] : null;
        if (!item || abort) return;
        setExtra(item);
      } catch {
        // ignore
      }
    })();
    return () => {
      abort = true;
    };
  }, [row]);
  const qty =
    row?.c_stockQty ??
    extra?.c_stockQty ??
    (Array.isArray(row?.c_byLocation)
      ? row.c_byLocation.reduce(
          (sum: number, item: any) => sum + (item.qty || 0),
          0
        )
      : 0);
  return <>{qty ?? ""}</>;
}

export const buildProductColumns = (
  pricing: ProductPricingPrefs
): ColumnDef[] => [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    width: 70,
    hideable: false,
    render: (r: any) => <Link to={`/products/${r.id}`}>{r.id}</Link>,
  },
  { key: "sku", title: "SKU", accessor: "sku", width: "30%", sortable: true },
  {
    key: "name",
    title: "Name",
    accessor: "name",
    width: "70%",
    sortable: true,
  },
  { key: "type", title: "Type", accessor: "type", width: 90, sortable: true },
  {
    key: "costPrice",
    title: "Cost",
    accessor: "costPrice",
    width: 100,
    sortable: true,
    render: (r: any) => formatUSD(r.costPrice),
  },
  {
    key: "sellPrice",
    title: "Sell",
    accessor: "sellPrice",
    width: 100,
    sortable: false,
    render: (r: any) => (
      <Group justify="space-between" w="70px">
        <Indicator
          color="red"
          position="middle-start"
          offset={-5}
          size="4"
          disabled={!(r.c_isSellPriceManual ?? !!r.manualSalePrice)}
        >
          <PriceCell
            row={r}
            prefs={{
              qty: pricing.qty,
              priceMultiplier: pricing.priceMultiplier,
            }}
          />
        </Indicator>
        {r.c_hasPriceTiers ? <IconBaselineDensityMedium size={8} /> : ""}
      </Group>
    ),
  },
  {
    key: "stockQty",
    title: "Stock",
    accessor: "stockQty",
    width: 80,
    align: "center",
    render: (r: any) => (
      <StockCell row={r} customerId={pricing.customerId} />
    ),
  },
];

export const getProductDefaultColumns = () =>
  getDefaultColumnKeys(
    buildProductColumns({ customerId: null, qty: 60, priceMultiplier: 1 })
  );
