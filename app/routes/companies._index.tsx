import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Button,
  Checkbox,
  Select,
  Table,
  TextInput,
  Group,
  Stack,
  Title,
} from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "Companies" }];

export async function loader(_args: LoaderFunctionArgs) {
  const companies = await prisma.company.findMany({ orderBy: { id: "asc" } });
  return json({ companies });
}

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
  const { companies } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();

  const form = useForm<{
    name: string | null;
    type: string | null;
    is_active: boolean;
    notes: string | null;
  }>({
    defaultValues: { name: "", type: null, is_active: false, notes: "" },
  });

  return (
    <Stack gap="lg">
      <Title order={2}>Companies</Title>
      <section>
        <Title order={4} mb="sm">
          Add Company
        </Title>
        <form
          onSubmit={form.handleSubmit((values) => {
            const fd = new FormData();
            fd.set("_intent", "create");
            if (values.name) fd.set("name", values.name);
            if (values.type) fd.set("type", values.type);
            if (values.is_active) fd.set("is_active", "on");
            if (values.notes) fd.set("notes", values.notes);
            submit(fd, { method: "post" });
          })}
        >
          <Group align="flex-end" wrap="wrap">
            <TextInput label="Name" w={240} {...form.register("name")} />
            <Controller
              name="type"
              control={form.control}
              render={({ field }) => (
                <Select
                  label="Type"
                  data={[
                    { value: "vendor", label: "Vendor" },
                    { value: "customer", label: "Customer" },
                    { value: "other", label: "Other" },
                  ]}
                  w={180}
                  clearable
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? null)}
                />
              )}
            />
            <Controller
              name="is_active"
              control={form.control}
              render={({ field }) => (
                <Checkbox
                  label="Active"
                  checked={!!field.value}
                  onChange={(e) => field.onChange(e.currentTarget.checked)}
                />
              )}
            />
            <TextInput label="Notes" w={240} {...form.register("notes")} />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </Group>
        </form>
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
              <Table.Th>Type</Table.Th>
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
                  <Link to={`/companies/${c.id}`}>
                    {c.name || `Company #${c.id}`}
                  </Link>
                </Table.Td>
                <Table.Td>{c.type}</Table.Td>
                <Table.Td>{c.is_active ? "Yes" : "No"}</Table.Td>
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
