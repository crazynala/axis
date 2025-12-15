import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { DatePickerInput } from "@mantine/dates";
import { Box, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { AreaChart, LineChart } from "@mantine/charts";
import { AssemblyStage } from "@prisma/client";
import { prisma } from "../utils/prisma.server";

type Range = { start: Date; end: Date };
type Bucket = "day" | "week" | "month" | "year";

type SeriesPoint = { x: string; y: number };
type Series = { name: string; data: SeriesPoint[] };

type AnalyticsData = {
  range: Range;
  bucket: Bucket;
  // Time-series (single series)
  itemsCut: SeriesPoint[];
  itemsFinished: SeriesPoint[];
  invoicedTotals: SeriesPoint[];
  // Inventory time series (stacked by location too)
  fabricInventoryTotal: SeriesPoint[];
  fabricInventoryByLocation: Series[];
};

function parseDateParam(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.valueOf()) ? d : null;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun
  const diff = (day + 6) % 7; // make Monday=0
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}

function chooseBucket(range: Range): Bucket {
  const ms = range.end.getTime() - range.start.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days <= 14) return "day";
  if (days <= 90) return "week";
  if (days <= 380) return "month";
  return "year";
}

function formatBucketLabel(d: Date, bucket: Bucket): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  switch (bucket) {
    case "day":
      return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    case "week": {
      // label as YYYY-Www (ISO week number approximation)
      const onejan = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
      return `${y}-W${String(week).padStart(2, "0")}`;
    }
    case "month":
      return `${y}-${String(m).padStart(2, "0")}`;
    case "year":
      return `${y}`;
  }
}

function* iterateBuckets(range: Range, bucket: Bucket): Generator<{ label: string; start: Date; end: Date }>{
  const cur = new Date(range.start);
  cur.setHours(0, 0, 0, 0);
  while (cur <= range.end) {
    let start = new Date(cur);
    let end = new Date(cur);
    if (bucket === "day") {
      end = endOfDay(start);
      cur.setDate(cur.getDate() + 1);
    } else if (bucket === "week") {
      start = startOfWeek(start);
      end = endOfDay(new Date(start));
      end.setDate(start.getDate() + 6);
      cur.setDate(start.getDate() + 7);
    } else if (bucket === "month") {
      start = startOfMonth(start);
      end = endOfDay(new Date(start.getFullYear(), start.getMonth() + 1, 0));
      cur.setMonth(start.getMonth() + 1, 1);
    } else {
      start = startOfYear(start);
      end = endOfDay(new Date(start.getFullYear(), 11, 31));
      cur.setFullYear(start.getFullYear() + 1, 0, 1);
    }
    if (end > range.end) end = endOfDay(range.end);
    yield { label: formatBucketLabel(start, bucket), start, end };
  }
}

async function getItemsCut(range: Range, bucket: Bucket): Promise<SeriesPoint[]> {
  const points: SeriesPoint[] = [];
  for (const b of iterateBuckets(range, bucket)) {
    const agg = await prisma.assemblyActivity.aggregate({
      where: {
        stage: AssemblyStage.cut,
        activityDate: { gte: b.start, lte: b.end },
      },
      _sum: { quantity: true },
    } as any);
    const total = Number(agg._sum?.quantity || 0);
    points.push({ x: b.label, y: Number.isFinite(total) ? total : 0 });
  }
  return points;
}

async function getItemsFinished(
  range: Range,
  bucket: Bucket
): Promise<SeriesPoint[]> {
  const points: SeriesPoint[] = [];
  for (const b of iterateBuckets(range, bucket)) {
    const agg = await prisma.assemblyActivity.aggregate({
      where: {
        stage: AssemblyStage.finish,
        activityDate: { gte: b.start, lte: b.end },
      },
      _sum: { quantity: true },
    } as any);
    const total = Number(agg._sum?.quantity || 0);
    points.push({ x: b.label, y: Number.isFinite(total) ? total : 0 });
  }
  return points;
}

async function getInvoicedTotals(range: Range, bucket: Bucket): Promise<SeriesPoint[]> {
  const points: SeriesPoint[] = [];
  for (const b of iterateBuckets(range, bucket)) {
    const rows = await prisma.invoice.findMany({
      where: { date: { gte: b.start, lte: b.end } },
      select: { id: true, date: true, lines: { select: { quantity: true, priceSell: true, invoicedTotalManual: true } } },
    });
    let total = 0;
    for (const inv of rows) {
      for (const line of inv.lines as any[]) {
        const lineTotal =
          typeof line.invoicedTotalManual === "number"
            ? line.invoicedTotalManual
            : (Number(line.quantity || 0) * Number(line.priceSell || 0));
        total += Number.isFinite(lineTotal) ? lineTotal : 0;
      }
    }
    points.push({ x: b.label, y: Math.round((total || 0) * 100) / 100 });
  }
  return points;
}

async function getFabricInventory(range: Range, bucket: Bucket): Promise<{ total: SeriesPoint[]; byLocation: Series[] }> {
  // Compute cumulative inventory level at the end of each bucket, for Fabric products.
  const total: SeriesPoint[] = [];
  const byLocationMap = new Map<string, SeriesPoint[]>();

  // Fetch Fabric product ids
  const fabric = await prisma.product.findMany({ where: { type: "Fabric" }, select: { id: true } });
  const fabricIds = fabric.map((p) => p.id).filter((n) => Number.isFinite(n));
  if (fabricIds.length === 0) {
    for (const b of iterateBuckets(range, bucket)) total.push({ x: b.label, y: 0 });
    return { total, byLocation: [] };
  }

  // Preload locations for stable naming
  const locations = await prisma.location.findMany({ select: { id: true, name: true } });
  const locName = (id: number | null | undefined) => locations.find((l) => l.id === id)?.name || `Loc ${id ?? "?"}`;

  for (const b of iterateBuckets(range, bucket)) {
    // Total cumulative up to bucket end
    const agg = await prisma.productMovement.aggregate({
      where: { date: { lte: b.end }, productId: { in: fabricIds } },
      _sum: { quantity: true },
    } as any);
    const level = Math.round(Number(agg._sum?.quantity || 0) * 100) / 100;
    total.push({ x: b.label, y: Number.isFinite(level) ? level : 0 });

    // By location cumulative
    const groups = await prisma.productMovement.groupBy({
      by: ["locationId"],
      where: { date: { lte: b.end }, productId: { in: fabricIds } },
      _sum: { quantity: true },
    } as any);
    for (const g of groups) {
      const id = g.locationId as number | null | undefined;
      const key = locName(id ?? undefined);
      const val = Math.round(Number(g._sum?.quantity || 0) * 100) / 100;
      if (!byLocationMap.has(key)) byLocationMap.set(key, []);
      byLocationMap.get(key)!.push({ x: b.label, y: Number.isFinite(val) ? val : 0 });
    }
    // pad missing locations
    for (const l of locations) {
      const key = l.name || `Loc ${l.id}`;
      const arr = byLocationMap.get(key) || [];
      if (arr.length < total.length) {
        arr.push({ x: b.label, y: 0 });
        byLocationMap.set(key, arr);
      }
    }
  }

  const byLocation: Series[] = Array.from(byLocationMap.entries()).map(([name, data]) => ({ name, data }));
  return { total, byLocation };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const start = parseDateParam(url.searchParams.get("start"));
  const end = parseDateParam(url.searchParams.get("end"));

  const now = new Date();
  const defaultStart = startOfMonth(now);
  const defaultEnd = endOfDay(new Date());
  const range: Range = { start: start ? startOfDay(start) : defaultStart, end: end ? endOfDay(end) : defaultEnd };
  const bucket = chooseBucket(range);

  const [itemsCut, itemsFinished, invoicedTotals, fabric] = await Promise.all([
    getItemsCut(range, bucket),
    getItemsFinished(range, bucket),
    getInvoicedTotals(range, bucket),
    getFabricInventory(range, bucket),
  ]);

  const data: AnalyticsData = {
    range,
    bucket,
    itemsCut,
    itemsFinished,
    invoicedTotals,
    fabricInventoryTotal: fabric.total,
    fabricInventoryByLocation: fabric.byLocation,
  };
  return json(data);
}

export default function AnalyticsRoute() {
  const data = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const currentRange: [Date | null, Date | null] = [
    data?.range?.start ? new Date(data.range.start) : null,
    data?.range?.end ? new Date(data.range.end) : null,
  ];

  const applyRange = (r: [Date | null, Date | null]) => {
    const [s, e] = r;
    const next = new URLSearchParams(params);
    if (s) next.set("start", s.toISOString()); else next.delete("start");
    if (e) next.set("end", e.toISOString()); else next.delete("end");
    navigate({ search: `?${next.toString()}` });
  };

  const now = new Date();
  const presets: Array<{ label: string; range: [Date, Date] }> = [
    // This Week (Mon-Sun)
    (() => {
      const start = startOfWeek(now);
      return { label: "This Week", range: [start, endOfDay(new Date())] };
    })(),
    // This Month
    (() => {
      const start = startOfMonth(now);
      return { label: "This Month", range: [start, endOfDay(new Date())] };
    })(),
    // This Year
    (() => {
      const start = startOfYear(now);
      return { label: "This Year", range: [start, endOfDay(new Date())] };
    })(),
    // Last Week
    (() => {
      const end = startOfWeek(now);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      const lastEnd = new Date(end);
      lastEnd.setMilliseconds(-1);
      return { label: "Last Week", range: [start, lastEnd] };
    })(),
    // Last Month
    (() => {
      const mStart = startOfMonth(now);
      const start = new Date(mStart);
      start.setMonth(start.getMonth() - 1);
      const end = new Date(mStart);
      end.setMilliseconds(-1);
      return { label: "Last Month", range: [start, end] };
    })(),
    // Last Year
    (() => {
      const yStart = startOfYear(now);
      const start = new Date(yStart);
      start.setFullYear(start.getFullYear() - 1);
      const end = new Date(yStart);
      end.setMilliseconds(-1);
      return { label: "Last Year", range: [start, end] };
    })(),
  ];

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Analytics</Title>
          <Text c="dimmed" size="sm">Time-series overview of production, invoices, and fabric inventory</Text>
        </div>
        <Group>
          {presets.map((p) => (
            <Button key={p.label} variant="light" onClick={() => applyRange(p.range)}>{p.label}</Button>
          ))}
        </Group>
      </Group>

      <Group align="flex-end">
        <DatePickerInput
          type="range"
          label="Time period"
          placeholder="Pick dates range"
          value={currentRange}
          onChange={(v) => applyRange(v as any)}
          allowSingleDateInRange
          clearable
        />
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Paper p="md" withBorder>
          <Title order={4}>Items cut</Title>
          <AreaChart
            h={220}
            data={data.itemsCut}
            dataKey="x"
            series={[{ name: "y", color: "blue.6" }]}
            curveType="linear"
            withDots={false}
            gridAxis="xy"
            yAxisProps={{ tickFormatter: (v) => String(v) }}
          />
        </Paper>
        <Paper p="md" withBorder>
          <Title order={4}>Items finished</Title>
          <AreaChart
            h={220}
            data={data.itemsFinished}
            dataKey="x"
            series={[{ name: "y", color: "teal.6" }]}
            curveType="linear"
            withDots={false}
            gridAxis="xy"
          />
        </Paper>
      </SimpleGrid>

      <Paper p="md" withBorder>
        <Title order={4}>Invoiced totals</Title>
        <LineChart
          h={260}
          data={data.invoicedTotals}
          dataKey="x"
          series={[{ name: "y", color: "grape.6" }]}
          curveType="linear"
          withDots={false}
          gridAxis="xy"
          yAxisProps={{ tickFormatter: (v) => `$${Number(v).toLocaleString()}` }}
        />
      </Paper>

      <Paper p="md" withBorder>
        <Title order={4}>Fabric inventory</Title>
        <AreaChart
          h={260}
          data={data.fabricInventoryTotal}
          dataKey="x"
          series={[{ name: "y", color: "indigo.6" }]}
          curveType="step"
          withDots={false}
          gridAxis="xy"
        />
      </Paper>

      <Paper p="md" withBorder>
        <Title order={4}>Fabric inventory by location</Title>
        <Box>
          <LineChart
            h={320}
            data={mergeSeries(data.fabricInventoryByLocation)}
            dataKey="x"
            series={data.fabricInventoryByLocation.map((s) => ({ name: s.name, color: undefined }))}
            withDots={false}
            gridAxis="xy"
          />
        </Box>
      </Paper>
    </Stack>
  );
}

function mergeSeries(series: Series[]): Array<Record<string, any>> {
  // Chart expects an array of { x, [name1]: y, [name2]: y, ... }
  const map = new Map<string, Record<string, any>>();
  for (const s of series) {
    for (const pt of s.data) {
      const row = map.get(pt.x) || { x: pt.x };
      row[s.name] = pt.y;
      map.set(pt.x, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => String(a.x).localeCompare(String(b.x)));
}
