import type { MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Link, useRouteLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Button, Table, Group, Stack, Title } from "@mantine/core";
import { BreadcrumbSet } from "../../packages/timber";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "Companies" }];

// No loader here; we use parent route loader data from routes/companies

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "create") {
    const data = {
      name: (form.get("name") as string) || null,
      type: (form.get("type") as string) || null,
      is_active: form.get("is_active") === "on",
      notes: (form.get("notes") as string) || null,
    } as const;
    await prisma.company.create({ data: data as any });
    return redirect("/companies");
  }

  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.company.delete({ where: { id } });
    return redirect("/companies");
  }

  if (intent === "update") {
    const id = Number(form.get("id"));
    if (!id) return redirect("/companies");
    const data = {
      name: (form.get("name") as string) || null,
      type: (form.get("type") as string) || null,
      is_active: form.get("is_active") === "on",
      notes: (form.get("notes") as string) || null,
    } as const;
    await prisma.company.update({ where: { id }, data: data as any });
    return redirect("/companies");
  }

  return redirect("/companies");
}

export default function CompaniesIndexRoute() {
  const parent = useRouteLoaderData("routes/companies") as { companies: any[] } | undefined;
  const companies = parent?.companies ?? [];
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();

  // New is handled in /companies/new; delete handled via this route's action

  return (
    <Stack gap="lg">
      <BreadcrumbSet breadcrumbs={[{ label: "Companies", href: "/companies" }]} />
      <Title order={2}>Companies</Title>

      <section>
        <Button component="a" href="/companies/new" variant="filled" color="blue">
          New Company
        </Button>
      </section>

      <section>
        <Title order={4} mb="sm">
          All Companies
        </Title>
        <Table striped withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Carrier</Table.Th>
              <Table.Th>Customer</Table.Th>
              <Table.Th>Supplier</Table.Th>
              <Table.Th>Inactive</Table.Th>
              <Table.Th>Active</Table.Th>
              <Table.Th>Notes</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {companies.map((c: any) => (
              <Table.Tr key={c.id}>
                <Table.Td>{c.id}</Table.Td>
                <Table.Td>
                  <Link to={`/companies/${c.id}`}>{c.name || `Company #${c.id}`}</Link>
                </Table.Td>
                <Table.Td>{c.isCarrier ? "Yes" : ""}</Table.Td>
                <Table.Td>{c.isCustomer ? "Yes" : ""}</Table.Td>
                <Table.Td>{c.isSupplier ? "Yes" : ""}</Table.Td>
                <Table.Td>{c.isInactive ? "Yes" : ""}</Table.Td>
                <Table.Td>{c.isActive ? "Yes" : "No"}</Table.Td>
                <Table.Td>{c.notes}</Table.Td>
                <Table.Td>
                  <Button
                    variant="light"
                    color="red"
                    disabled={busy}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("_intent", "delete");
                      fd.set("id", String(c.id));
                      submit(fd, { method: "post" });
                    }}
                  >
                    Delete
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </section>
    </Stack>
  );
}
