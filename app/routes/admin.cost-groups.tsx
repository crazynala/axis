import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
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

export async function loader(_args: LoaderFunctionArgs) {
  const groups = await prisma.productCostGroup.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { costRanges: true } } } as any,
  } as any);
  return json({ groups });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent === "create") {
    const name = String(form.get("name") || "").trim();
    const supplierId = form.get("supplierId")
      ? Number(form.get("supplierId"))
      : null;
    const currency = String(form.get("currency") || "").trim() || null;
    const costPrice = form.get("costPrice")
      ? Number(form.get("costPrice"))
      : null;
    const sellPriceManual = form.get("sellPriceManual")
      ? Number(form.get("sellPriceManual"))
      : null;
    await prisma.productCostGroup.create({
      data: {
        name,
        supplierId: supplierId as any,
        currency,
        costPrice,
        sellPriceManual,
      },
    });
    return redirect("/admin/cost-groups");
  }
  if (intent === "delete") {
    const id = Number(form.get("id"));
    await prisma.productCostGroup.delete({ where: { id } });
    return redirect("/admin/cost-groups");
  }
  if (intent === "update") {
    const id = Number(form.get("id"));
    const name = String(form.get("name") || "").trim();
    const supplierId = form.get("supplierId")
      ? Number(form.get("supplierId"))
      : null;
    const currency = String(form.get("currency") || "").trim() || null;
    const costPrice = form.get("costPrice")
      ? Number(form.get("costPrice"))
      : null;
    const sellPriceManual = form.get("sellPriceManual")
      ? Number(form.get("sellPrice"))
      : null;
    await prisma.productCostGroup.update({
      where: { id },
      data: {
        name,
        supplierId: supplierId as any,
        currency,
        costPrice,
        sellPriceManual,
      },
    });
    return redirect("/admin/cost-groups");
  }
  return json({ ok: false }, { status: 400 });
}

export default function AdminCostGroupsPage() {
  const { groups } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>Product Cost Groups</Title>
        <Group>
          <Button component={Link} to="/admin/cost-ranges" variant="default">
            Manage Ranges
          </Button>
          <Button component={Link} to="/admin">
            Back
          </Button>
        </Group>
      </Group>
      <Card withBorder>
        <Form method="post">
          <input type="hidden" name="_intent" value="create" />
          <Group gap="sm" align="flex-end">
            <TextInput
              name="name"
              label="Name"
              placeholder="Group name"
              required
            />
            <TextInput
              name="supplierId"
              label="Supplier ID"
              placeholder="123"
            />
            <TextInput name="currency" label="Currency" placeholder="USD" />
            <TextInput name="costPrice" label="Cost" placeholder="0.00" />
            <TextInput
              name="sellPriceManual"
              label="Manual Sell"
              placeholder="0.00"
            />
            <Button type="submit" loading={busy}>
              Create
            </Button>
          </Group>
        </Form>
      </Card>
      <Table stickyHeader withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th>Supplier</Table.Th>
            <Table.Th>Currency</Table.Th>
            <Table.Th>Cost</Table.Th>
            <Table.Th>Manual Sell</Table.Th>
            <Table.Th>Ranges</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {groups.map((g: any) => (
            <Table.Tr key={g.id}>
              <Table.Td>{g.id}</Table.Td>
              <Table.Td>
                <Form method="post">
                  <input type="hidden" name="_intent" value="update" />
                  <input type="hidden" name="id" value={g.id} />
                  <Group gap="xs">
                    <TextInput name="name" defaultValue={g.name || ""} />
                    <TextInput
                      name="supplierId"
                      defaultValue={g.supplierId || ""}
                    />
                    <TextInput
                      name="currency"
                      defaultValue={g.currency || ""}
                    />
                    <TextInput
                      name="costPrice"
                      defaultValue={g.costPrice ?? ""}
                    />
                    <TextInput
                      name="sellPriceManual"
                      defaultValue={g.sellPriceManual ?? ""}
                    />
                    <Button type="submit" size="xs">
                      Save
                    </Button>
                  </Group>
                </Form>
              </Table.Td>
              <Table.Td>{g.supplierId ?? ""}</Table.Td>
              <Table.Td>{g.currency ?? ""}</Table.Td>
              <Table.Td>{g.costPrice ?? ""}</Table.Td>
              <Table.Td>{g.sellPriceManual ?? ""}</Table.Td>
              <Table.Td>{(g as any)._count?.costRanges ?? 0}</Table.Td>
              <Table.Td>
                <Form method="post">
                  <input type="hidden" name="_intent" value="delete" />
                  <input type="hidden" name="id" value={g.id} />
                  <Button color="red" variant="light" type="submit" size="xs">
                    Delete
                  </Button>
                </Form>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {!groups.length && <Text c="dimmed">No cost groups yet.</Text>}
    </Stack>
  );
}
