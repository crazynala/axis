import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Table, Select, Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { debugProductByLocation } from "~/utils/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const pid = Number(url.searchParams.get("productId"));
  if (!Number.isFinite(pid)) return json({ error: "Pass ?productId=ID" }, { status: 400 });
  const data = await debugProductByLocation(pid);
  return json(data);
}

export default function Page() {
  const data = useLoaderData<typeof loader>() as any;
  if (data?.error) return <pre>{data.error}</pre>;
  const [location, setLocation] = useState<string>("all");
  // Extract location choices from contrib rows (by lid). Label using pmOnly/current when available
  const contribRows = Array.isArray(data?.contrib) ? data.contrib : [];
  const nameMap = new Map<number, string>();
  (Array.isArray(data?.pmOnly) ? data.pmOnly : []).forEach((r: any) => {
    if (r.lid != null) nameMap.set(r.lid, r.name || `#${r.lid}`);
  });
  (Array.isArray(data?.current) ? data.current : []).forEach((r: any) => {
    const id = r.location_id;
    const nm = r.location_name;
    if (id != null && !nameMap.has(id)) nameMap.set(id, nm || `#${id}`);
  });
  const lids = Array.from(new Set(contribRows.map((r: any) => r.lid ?? null))) as Array<number | null>;
  const locationOptions = lids.map((lid) => ({
    value: lid == null ? "null" : String(lid),
    label: lid == null ? "(none)" : nameMap.get(lid) || `#${lid}`,
  }));
  const selectedLid: number | null = location === "all" ? null : location === "null" ? null : Number(location);
  const filteredContrib = location === "all" ? contribRows : contribRows.filter((r: any) => (r.lid ?? null) === selectedLid);

  return (
    <div style={{ padding: 16 }}>
      <h3>By-Location Debug</h3>
      <Stack gap={24}>
        <Group>
          <Text fw={600}>Current summary</Text>
        </Group>
        <Table striped withTableBorder highlightOnHover>
          <Table.Thead>
            <Table.Tr>{data.current && Object.keys(data.current[0] || {}).map((k) => <Table.Th key={k}>{k}</Table.Th>)}</Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.current &&
              data.current.map((row: any, i: number) => (
                <Table.Tr key={i}>
                  {Object.values(row).map((v, j) => (
                    <Table.Td key={j}>{String(v)}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
          </Table.Tbody>
        </Table>

        <Group>
          <Text fw={600}>Compare (simple CTE)</Text>
        </Group>
        <Table striped withTableBorder highlightOnHover>
          <Table.Thead>
            <Table.Tr>{data.compare && Object.keys(data.compare[0] || {}).map((k) => <Table.Th key={k}>{k}</Table.Th>)}</Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.compare &&
              data.compare.map((row: any, i: number) => (
                <Table.Tr key={i}>
                  {Object.values(row).map((v, j) => (
                    <Table.Td key={j}>{String(v)}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
          </Table.Tbody>
        </Table>

        <Group justify="space-between" align="center">
          <Text fw={600}>Contributions (rows)</Text>
          <Select label="Location filter" data={[{ value: "all", label: "All" }, ...locationOptions]} value={location} onChange={(v) => setLocation(v ?? "all")} w={220} />
        </Group>
        <Table striped withTableBorder highlightOnHover>
          <Table.Thead>
            <Table.Tr>{contribRows[0] && Object.keys(contribRows[0]).map((k) => <Table.Th key={k}>{k}</Table.Th>)}</Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredContrib.map((row: any, i: number) => (
              <Table.Tr key={i}>
                {Object.values(row).map((v, j) => (
                  <Table.Td key={j}>{String(v)}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </div>
  );
}
