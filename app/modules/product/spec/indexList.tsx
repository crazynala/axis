import { useEffect, useState } from "react";
import { Link } from "@remix-run/react";
import { getDefaultColumnKeys, type ColumnDef } from "~/base/index/columns";
import { WarningsCell } from "~/components/WarningsCell";
import { formatUSD } from "~/utils/format";
import { PricingValueWithMeta } from "~/components/PricingValueWithMeta";
import { getProductDisplayPrice } from "../pricing/getProductDisplayPrice";
import { debugEnabled } from "~/utils/debugFlags";
import { makePricedValue } from "~/utils/pricingValueMeta";

export type ProductPricingPrefs = {
  customerId: string | null;
  qty: number;
  priceMultiplier: number;
  margins?: {
    marginOverride?: number | null;
    vendorDefaultMargin?: number | null;
    globalDefaultMargin?: number | null;
  } | null;
};


function PriceCell({
  row,
  prefs,
}: {
  row: any;
  prefs: {
    qty: number;
    priceMultiplier: number;
    margins?: {
      marginOverride?: number | null;
      vendorDefaultMargin?: number | null;
      globalDefaultMargin?: number | null;
    } | null;
  };
}) {
  const qty = Number(prefs.qty || 60) || 60;
  const priceMultiplier = Number(prefs.priceMultiplier || 1) || 1;
  const manual = row?.manualSalePrice;
  const manualMargin = row?.manualMargin;
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
  const saleGroup = Array.isArray(row?.salePriceGroup?.saleRanges)
    ? row.salePriceGroup.saleRanges
        .filter((r: any) => r && r.rangeFrom != null && r.price != null)
        .map((r: any) => ({
          minQty: Number(r.rangeFrom) || 0,
          unitPrice: Number(r.price) || 0,
        }))
        .sort((a: any, b: any) => a.minQty - b.minQty)
    : [];
  const saleProduct = Array.isArray(row?.salePriceRanges)
    ? row.salePriceRanges
        .filter((r: any) => r && r.rangeFrom != null && r.price != null)
        .map((r: any) => ({
          minQty: Number(r.rangeFrom) || 0,
          unitPrice: Number(r.price) || 0,
        }))
        .sort((a: any, b: any) => a.minQty - b.minQty)
    : [];
  const saleTiers = saleGroup.length ? saleGroup : saleProduct;
  const out = getProductDisplayPrice({
    qty,
    priceMultiplier,
    marginDefaults: prefs.margins,
    baseCost,
    manualSalePrice:
      manual != null && manual !== "" ? Number(manual) : undefined,
    manualMargin:
      manualMargin != null && manualMargin !== "" ? Number(manualMargin) : null,
    taxRate,
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
    costTiers: costRanges,
    saleTiers,
    debug: debugEnabled("pricing"),
    debugLabel: row?.id ? `product:${row.id}:index` : "product:index",
  });
  const manualOverride = manual != null && manual !== "";
  const priced = makePricedValue(Number(out.unitSellPrice || 0), {
    isOverridden: manualOverride,
  });
  return <PricingValueWithMeta priced={priced} formatValue={formatUSD} />;
}

function CostCell({
  row,
  prefs,
}: {
  row: any;
  prefs: {
    qty: number;
    priceMultiplier: number;
    margins?: {
      marginOverride?: number | null;
      vendorDefaultMargin?: number | null;
      globalDefaultMargin?: number | null;
    } | null;
  };
}) {
  const pricingModel = String(row?.pricingModel || "").toUpperCase();
  const isCurve = pricingModel === "CURVE_SELL_AT_MOQ";
  const isTiered =
    pricingModel === "TIERED_COST_PLUS_MARGIN" ||
    pricingModel === "TIERED_COST_PLUS_FIXED_SELL";
  if (!isCurve && !isTiered) {
    const priced = makePricedValue(Number(row?.costPrice ?? 0) || 0);
    return <PricingValueWithMeta priced={priced} formatValue={formatUSD} />;
  }
  const qty = Number(prefs.qty || 60) || 60;
  const priceMultiplier = Number(prefs.priceMultiplier || 1) || 1;
  const taxRate = Number(row?.purchaseTax?.value ?? 0) || 0;
  const out = getProductDisplayPrice({
    qty,
    priceMultiplier,
    taxRate,
    baseCost: Number(row?.costPrice ?? 0) || 0,
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
    marginDefaults: prefs.margins ?? null,
    costTiers: (row?.costGroup?.costRanges || [])
      .filter((r: any) => r && r.rangeFrom != null && r.costPrice != null)
      .map((r: any) => ({
        minQty: Number(r.rangeFrom) || 0,
        priceCost: Number(r.costPrice) || 0,
      }))
      .sort((a: any, b: any) => a.minQty - b.minQty),
  });
  let derived = Number(row?.costPrice ?? 0) || 0;
  if (isCurve) {
    const tp = Number(row?.transferPercent ?? 0);
    const withTax = Number((out as any)?.breakdown?.withTax ?? 0) || 0;
    derived =
      Number.isFinite(tp) && tp > 0 && Number.isFinite(withTax)
        ? withTax * tp
        : Number(row?.costPrice ?? 0) || 0;
  } else if (isTiered) {
    const baseUnit = Number((out as any)?.breakdown?.baseUnit ?? 0);
    if (Number.isFinite(baseUnit) && baseUnit > 0) {
      derived = baseUnit;
    }
  }
  const priced = makePricedValue(Number(derived || 0));
  return <PricingValueWithMeta priced={priced} formatValue={formatUSD} />;
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
          <PriceCell
            row={r}
            prefs={{
              qty: pricing.qty,
              priceMultiplier: pricing.priceMultiplier,
              margins: pricing.margins ?? null,
            }}
          />
        ),
      };
    }
    if (col.key === "costPrice") {
      return {
        ...col,
        render: (r: any) => (
          <CostCell
            row={r}
            prefs={{
              qty: pricing.qty,
              priceMultiplier: pricing.priceMultiplier,
              margins: pricing.margins ?? null,
            }}
          />
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
