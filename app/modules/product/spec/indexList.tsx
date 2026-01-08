import { useEffect, useState } from "react";
import { Link } from "@remix-run/react";
import { Group, Indicator } from "@mantine/core";
import { IconBaselineDensityMedium } from "@tabler/icons-react";
import { getDefaultColumnKeys, type ColumnDef } from "~/base/index/columns";
import { WarningsCell } from "~/components/WarningsCell";
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
    pricingModel: row?.pricingModel ?? null,
    baselinePriceAtMoq:
      row?.baselinePriceAtMoq != null ? Number(row.baselinePriceAtMoq) : null,
    transferPercent:
      row?.transferPercent != null ? Number(row.transferPercent) : null,
    pricingSpecRanges: (row?.pricingSpec?.ranges || []).map((range: any) => ({
      rangeFrom: range.rangeFrom ?? null,
      rangeTo: range.rangeTo ?? null,
      multiplier: Number(range.multiplier),
    })),
  });
  return <>{formatUSD(out.unitSellPrice)}</>;
}

function StockCell({ row }: { row: any }) {
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

const labelFromValueList = (value: any) =>
  value?.label || value?.code || value?.value || "";

export const canonicalProductsColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    layout: { width: 70 },
    hideable: false,
    render: (r: any) => <Link to={`/products/${r.id}`}>{r.id}</Link>,
  },
  {
    key: "sku",
    title: "SKU",
    accessor: "sku",
    sortable: true,
    layout: { width: "30%" },
  },
  {
    key: "name",
    title: "Name",
    accessor: "name",
    sortable: true,
    layout: { width: "70%" },
  },
  {
    key: "type",
    title: "Type",
    accessor: "type",
    sortable: true,
    layout: { width: 90 },
  },
  {
    key: "category",
    title: "Category",
    accessor: "categoryId",
    sortable: true,
    defaultVisible: false,
    render: (r: any) => labelFromValueList(r?.category),
  },
  {
    key: "subCategory",
    title: "Subcategory",
    accessor: "subCategoryId",
    sortable: true,
    defaultVisible: false,
    render: (r: any) => labelFromValueList(r?.subCategory),
  },
  {
    key: "customer",
    title: "Customer",
    accessor: "customerId",
    sortable: true,
    defaultVisible: false,
    render: (r: any) => r?.customer?.name || "",
  },
  {
    key: "purchaseTax",
    title: "Purchase Tax",
    accessor: "purchaseTaxId",
    sortable: true,
    defaultVisible: false,
    render: (r: any) => labelFromValueList(r?.purchaseTax),
  },
  {
    key: "costPrice",
    title: "Cost",
    accessor: "costPrice",
    sortable: true,
    layout: { width: 100 },
    render: (r: any) => formatUSD(r.costPrice),
  },
  {
    key: "sellPrice",
    title: "Sell",
    accessor: "sellPrice",
    layout: { width: 110 },
    render: () => null,
  },
  {
    key: "stockQty",
    title: "Stock",
    accessor: "stockQty",
    layout: { width: 80, align: "center" },
    render: () => null,
  },
  {
    key: "warnings",
    title: "Warnings",
    accessor: "warnings",
    // layout: { minWidth: 160, maxWidth: 260 },
    layout: { width: 200 },
    render: (row: any) => <WarningsCell warnings={row?.warnings} />,
  },
];

export const getProductIndexDefaultColumns = () =>
  getDefaultColumnKeys(canonicalProductsColumns);

export const buildProductIndexColumns = (
  pricing: ProductPricingPrefs
): ColumnDef[] =>
  canonicalProductsColumns.map((col) => {
    if (col.key === "sellPrice") {
      return {
        ...col,
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
      };
    }
    if (col.key === "stockQty") {
      return {
        ...col,
        render: (r: any) => <StockCell row={r} />,
      };
    }
    return col;
  });

export const productIndexList = {
  columns: canonicalProductsColumns,
  buildColumns: buildProductIndexColumns,
  defaultColumns: getProductIndexDefaultColumns,
  defaults: {
    perPage: 20,
    sort: null,
    dir: null,
  },
  presentationKeys: ["sort", "dir", "perPage", "page", "columns"],
};
