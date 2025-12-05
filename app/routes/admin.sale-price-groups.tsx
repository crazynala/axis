import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { prisma } from "~/utils/prisma.server";
import { Button, Group, Stack, Table, TextInput, Title } from "@mantine/core";
import { requireAdminUser } from "~/utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  const groups = await prisma.salePriceGroup.findMany({
    include: { saleRanges: true },
    orderBy: { id: "asc" },
  });
  return json({ groups });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdminUser(request);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") || "");
  if (intent === "group.create") {
    const name = String(fd.get("name") || "");
    await prisma.salePriceGroup.create({ data: { name } });
    return redirect("/admin/sale-price-groups");
  }
  if (intent === "range.add") {
    const groupId = Number(fd.get("groupId"));
    const rangeFrom = Number(fd.get("rangeFrom"));
    const price = Number(fd.get("price"));
    await prisma.salePriceRange.create({
      data: { saleGroupId: groupId, rangeFrom, price },
    });
    return redirect("/admin/sale-price-groups");
  }
  if (intent === "range.delete") {
    const id = Number(fd.get("id"));
    await prisma.salePriceRange.delete({ where: { id } });
    return redirect("/admin/sale-price-groups");
  }
  return redirect("/admin/sale-price-groups");
}

export default function SalePriceGroupsAdmin() {
  const { groups } = useLoaderData<typeof loader>();
  return (
    <Stack>
      <Title order={2}>Sale Price Groups</Title>
      <Form method="post">
        <input type="hidden" name="_intent" value="group.create" />
        <Group w={520}>
          <TextInput
            name="name"
            label="New Group Name"
            placeholder="e.g. Retail"
            required
          />
          <Button type="submit">Create</Button>
        </Group>
      </Form>
      {groups.map((g: any) => (
        <Stack key={g.id}>
          <Title order={4}>{g.name || `Group #${g.id}`}</Title>
          <Form method="post">
            <input type="hidden" name="_intent" value="range.add" />
            <input type="hidden" name="groupId" value={g.id} />
            <Group w={520}>
              <TextInput
                name="rangeFrom"
                label="Min Qty"
                type="number"
                min={1}
                defaultValue={1}
              />
              <TextInput
                name="price"
                label="Unit Price"
                type="number"
                step="0.01"
                min={0}
              />
              <Button type="submit" variant="light">
                Add Tier
              </Button>
            </Group>
          </Form>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Min Qty</Table.Th>
                <Table.Th>Unit Price</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(g.saleRanges || []).map((r: any) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{r.rangeFrom}</Table.Td>
                  <Table.Td>{r.price}</Table.Td>
                  <Table.Td>
                    <Form method="post">
                      <input
                        type="hidden"
                        name="_intent"
                        value="range.delete"
                      />
                      <input type="hidden" name="id" value={r.id} />
                      <Button
                        type="submit"
                        color="red"
                        variant="subtle"
                        size="xs"
                      >
                        Delete
                      </Button>
                    </Form>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ))}
    </Stack>
  );
}
