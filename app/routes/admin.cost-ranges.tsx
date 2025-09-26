import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import {
  Button,
  Card,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";

type LoaderData = {
  ranges: Array<{
    id: number;
    productId: number | null;
    costGroupId: number | null;
    rangeFrom: number | null;
    rangeTo: number | null;
    costPrice: number | null;
    sellPriceManual: number | null;
    product?: { id: number; sku: string | null; name: string | null } | null;
    costGroup?: {
      id: number;
      name: string | null;
      supplierId: number | null;
    } | null;
  }>;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const costGroupId = url.searchParams.get("costGroupId");
  const where: any = {};
  if (productId) where.productId = Number(productId);
  if (costGroupId) where.costGroupId = Number(costGroupId);
  const ranges = await prisma.productCostRange.findMany({
    where,
    orderBy: [
      { productId: "asc" },
      { costGroupId: "asc" },
      { rangeFrom: "asc" },
    ],
    include: {
      product: { select: { id: true, sku: true, name: true } },
      costGroup: { select: { id: true, name: true, supplierId: true } },
    },
  });
  return json({ ranges } satisfies LoaderData);
}

function parseIntOrNull(v: FormDataEntryValue | null) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function parseFloatOrNull(v: FormDataEntryValue | null) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function assertNoOverlap(args: {
  productId: number | null;
  costGroupId: number | null;
  rangeFrom: number;
  rangeTo: number;
  excludeId?: number;
}) {
  const { productId, costGroupId, rangeFrom, rangeTo, excludeId } = args;
  const linkage: any = productId ? { productId } : { costGroupId };
  const overlap = await prisma.productCostRange.findFirst({
    where: {
      ...linkage,
      id: excludeId ? { not: excludeId } : undefined,
      rangeFrom: { lte: rangeTo },
      rangeTo: { gte: rangeFrom },
    },
    select: { id: true },
  });
  if (overlap) {
    throw new Error("Range overlaps with an existing tier for this linkage");
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  try {
    if (intent === "delete") {
      const id = Number(form.get("id"));
      if (!Number.isFinite(id)) throw new Error("Missing id");
      await prisma.productCostRange.delete({ where: { id } });
      return redirect("/admin/cost-ranges");
    }
    if (intent === "create" || intent === "update") {
      const id = parseIntOrNull(form.get("id"));
      const productId = parseIntOrNull(form.get("productId"));
      const costGroupId = parseIntOrNull(form.get("costGroupId"));
      const rangeFrom = parseIntOrNull(form.get("rangeFrom"));
      const rangeTo = parseIntOrNull(form.get("rangeTo"));
      const costPrice = parseFloatOrNull(form.get("costPrice"));
      const sellPriceManual = parseFloatOrNull(form.get("sellPriceManual"));

      if (!!productId === !!costGroupId) {
        throw new Error("Set exactly one of productId or costGroupId");
      }
      if (rangeFrom == null || rangeTo == null) {
        throw new Error("rangeFrom and rangeTo are required integers");
      }
      if (rangeFrom > rangeTo) {
        throw new Error("rangeFrom must be <= rangeTo");
      }

      await assertNoOverlap({
        productId: productId ?? null,
        costGroupId: costGroupId ?? null,
        rangeFrom,
        rangeTo,
        excludeId: intent === "update" ? id ?? undefined : undefined,
      });

      const data: any = {
        productId: productId ?? null,
        costGroupId: costGroupId ?? null,
        rangeFrom,
        rangeTo,
        costPrice: costPrice ?? null,
        sellPriceManual: sellPriceManual ?? null,
      };
      if (intent === "create") {
        await prisma.productCostRange.create({ data });
      } else if (intent === "update") {
        if (!id) throw new Error("Missing id");
        await prisma.productCostRange.update({ where: { id }, data });
      }
      return redirect("/admin/cost-ranges");
    }
    return json({ ok: false, error: "Unknown intent" }, { status: 400 });
  } catch (e: any) {
    return json(
      { ok: false, error: e?.message || "Action failed" },
      { status: 400 }
    );
  }
}

export default function AdminCostRangesPage() {
  const { ranges } = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<{ ok: boolean; error?: string }>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>Product Cost Ranges</Title>
        <Group>
          <Button component={Link} to="/admin/cost-groups" variant="default">
            Cost Groups
          </Button>
          <Button component={Link} to="/admin">
            Back
          </Button>
        </Group>
      </Group>
      {actionData?.error && (
        <Card withBorder c="red">
          <Text c="red">{actionData.error}</Text>
        </Card>
      )}
      <Card withBorder>
        <Form method="post">
          <input type="hidden" name="_intent" value="create" />
          <Group gap="sm" align="flex-end">
            <TextInput
              name="productId"
              label="Product ID"
              placeholder="(one of)"
            />
            <TextInput
              name="costGroupId"
              label="Group ID"
              placeholder="(one of)"
            />
            <TextInput
              name="rangeFrom"
              label="From Qty"
              placeholder="1"
              required
            />
            <TextInput
              name="rangeTo"
              label="To Qty"
              placeholder="60"
              required
            />
            <TextInput name="costPrice" label="Cost" placeholder="0.00" />
            <TextInput
              name="sellPriceManual"
              label="Manual Sell"
              placeholder="0.00"
            />
            <Button type="submit" loading={busy}>
              Add Range
            </Button>
          </Group>
        </Form>
      </Card>
      <Table stickyHeader withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Product</Table.Th>
            <Table.Th>Group</Table.Th>
            <Table.Th>From</Table.Th>
            <Table.Th>To</Table.Th>
            <Table.Th>Cost</Table.Th>
            <Table.Th>Manual Sell</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {ranges.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>{r.id}</Table.Td>
              <Table.Td>
                <Form method="post">
                  <input type="hidden" name="_intent" value="update" />
                  <input type="hidden" name="id" value={r.id} />
                  <Group gap="xs">
                    <TextInput
                      name="productId"
                      defaultValue={r.productId ?? ""}
                      placeholder="Product ID"
                    />
                    <TextInput
                      name="costGroupId"
                      defaultValue={r.costGroupId ?? ""}
                      placeholder="Group ID"
                    />
                    <TextInput
                      name="rangeFrom"
                      defaultValue={r.rangeFrom ?? ""}
                      style={{ width: 90 }}
                    />
                    <TextInput
                      name="rangeTo"
                      defaultValue={r.rangeTo ?? ""}
                      style={{ width: 90 }}
                    />
                    <TextInput
                      name="costPrice"
                      defaultValue={r.costPrice ?? ""}
                      style={{ width: 120 }}
                    />
                    <TextInput
                      name="sellPriceManual"
                      defaultValue={r.sellPriceManual ?? ""}
                      style={{ width: 120 }}
                    />
                    <Button type="submit" size="xs">
                      Save
                    </Button>
                  </Group>
                </Form>
              </Table.Td>
              <Table.Td>
                {r.costGroup ? (
                  <Text size="sm">
                    #{r.costGroup.id} {r.costGroup.name ?? ""} (supplier{" "}
                    {r.costGroup.supplierId ?? "-"})
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                )}
              </Table.Td>
              <Table.Td>{r.rangeFrom}</Table.Td>
              <Table.Td>{r.rangeTo}</Table.Td>
              <Table.Td>{r.costPrice ?? ""}</Table.Td>
              <Table.Td>{r.sellPriceManual ?? ""}</Table.Td>
              <Table.Td>
                <Form method="post">
                  <input type="hidden" name="_intent" value="delete" />
                  <input type="hidden" name="id" value={r.id} />
                  <Button color="red" variant="light" type="submit" size="xs">
                    Delete
                  </Button>
                </Form>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {!ranges.length && <Text c="dimmed">No cost ranges yet.</Text>}
    </Stack>
  );
}
