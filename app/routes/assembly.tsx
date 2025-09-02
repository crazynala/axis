import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Button, Checkbox, Table, TextInput, Group, Stack, Title } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "Assembly" }];

export async function loader(_args: LoaderFunctionArgs) {
  const assemblies = await prisma.assembly.findMany({ orderBy: { id: "asc" } });
  return json({ assemblies });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "create") {
    const data = {
      name: (form.get("name") as string) || null,
    } as const;
    await prisma.assembly.create({ data: data as any });
    return redirect("/assembly");
  }

  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.assembly.delete({ where: { id } });
    return redirect("/assembly");
  }

  return redirect("/assembly");
}

export default function AssemblyRoute() {
  const { assemblies } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";

  const form = useForm<{ name: string | null }>({ defaultValues: { name: "" } });

  return (
    <Stack gap="lg">
      <Title order={2}>Assembly</Title>

      <section>
        <Title order={4} mb="sm">
          Add Assembly
        </Title>
        <form
          onSubmit={form.handleSubmit((values) => {
            const fd = new FormData();
            fd.set("_intent", "create");
            if (values.name) fd.set("name", values.name);
            submit(fd, { method: "post" });
          })}
        >
          <Group align="flex-end" wrap="wrap">
            <TextInput label="Name" w={260} {...form.register("name")} />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </Group>
        </form>
      </section>

      <section>
        <Title order={4} mb="sm">
          All Assemblies
        </Title>
        <Table striped withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {assemblies.map((a: any) => (
              <Table.Tr key={a.id}>
                <Table.Td>{a.id}</Table.Td>
                <Table.Td>{a.name}</Table.Td>
                <Table.Td>
                  <Button
                    variant="light"
                    color="red"
                    disabled={busy}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("_intent", "delete");
                      fd.set("id", String(a.id));
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
