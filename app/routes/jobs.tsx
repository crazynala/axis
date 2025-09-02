import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Button, Checkbox, Table, TextInput, Group, Stack, Title, Textarea } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "Jobs" }];

export async function loader(_args: LoaderFunctionArgs) {
  const jobs = await prisma.job.findMany({ orderBy: { id: "asc" } });
  return json({ jobs });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "create") {
    const data = {
      name: (form.get("name") as string) || null,
      status: (form.get("status") as string) || null,
      is_active: form.get("is_active") === "on",
      notes: (form.get("notes") as string) || null,
    } as const;
    await prisma.job.create({ data: data as any });
    return redirect("/jobs");
  }

  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.job.delete({ where: { id } });
    return redirect("/jobs");
  }

  if (intent === "update") {
    const id = Number(form.get("id"));
    if (!id) return redirect("/jobs");
    const data = {
      name: (form.get("name") as string) || null,
      status: (form.get("status") as string) || null,
      is_active: form.get("is_active") === "on",
      notes: (form.get("notes") as string) || null,
    } as const;
    await prisma.job.update({ where: { id }, data: data as any });
    return redirect("/jobs");
  }

  return redirect("/jobs");
}

export default function JobsRoute() {
  const { jobs } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";

  const form = useForm<{ name: string | null; status: string | null; is_active: boolean; notes: string | null }>({
    defaultValues: { name: "", status: "", is_active: false, notes: "" },
  });

  return (
    <Stack gap="lg">
      <Title order={2}>Jobs</Title>

      <section>
        <Title order={4} mb="sm">
          Add Job
        </Title>
        <form
          onSubmit={form.handleSubmit((values) => {
            const fd = new FormData();
            fd.set("_intent", "create");
            if (values.name) fd.set("name", values.name);
            if (values.status) fd.set("status", values.status);
            if (values.is_active) fd.set("is_active", "on");
            if (values.notes) fd.set("notes", values.notes);
            submit(fd, { method: "post" });
          })}
        >
          <Group align="flex-end" wrap="wrap">
            <TextInput label="Name" w={220} {...form.register("name")} />
            <TextInput label="Status" w={160} {...form.register("status")} />
            <Controller name="is_active" control={form.control} render={({ field }) => <Checkbox label="Active" checked={!!field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
            <Textarea label="Notes" autosize minRows={1} w={260} {...form.register("notes")} />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </Group>
        </form>
      </section>

      <section>
        <Title order={4} mb="sm">
          All Jobs
        </Title>
        <Table striped withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Active</Table.Th>
              <Table.Th>Notes</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {jobs.map((j: any) => (
              <Table.Tr key={j.id}>
                <Table.Td>{j.id}</Table.Td>
                <Table.Td>{j.name}</Table.Td>
                <Table.Td>{j.status}</Table.Td>
                <Table.Td>{j.is_active ? "Yes" : "No"}</Table.Td>
                <Table.Td>{j.notes}</Table.Td>
                <Table.Td>
                  <Button
                    variant="light"
                    color="red"
                    disabled={busy}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("_intent", "delete");
                      fd.set("id", String(j.id));
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
