import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Button, Checkbox, Table, TextInput, Group, Stack, Title, Textarea } from "@mantine/core";
import { BreadcrumbSet } from "packages/timber";
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
    const codeRaw = ((form.get("code") as string) || "").trim();
    // Ensure projectCode uniqueness similar to importer
    const ensureUnique = async (desired: string | null) => {
      const base = (desired || "").trim();
      if (!base) return null;
      let cand = base;
      let n = 1;
      while (true) {
        const clash = await prisma.job.findFirst({
          where: { projectCode: cand },
        });
        if (!clash) return cand;
        n += 1;
        cand = n === 2 ? `${base}-dup` : `${base}-dup${n - 1}`;
      }
    };
    const data = {
      projectCode: await ensureUnique(codeRaw),
      name: (form.get("name") as string) || null,
      status: (form.get("status") as string) || null,
      isActive: form.get("is_active") === "on",
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
    const codeRaw = ((form.get("code") as string) || "").trim();
    const ensureUnique = async (desired: string | null) => {
      const base = (desired || "").trim();
      if (!base) return null;
      let cand = base;
      let n = 1;
      while (true) {
        const clash = await prisma.job.findFirst({
          where: { projectCode: cand },
        });
        if (!clash || clash.id === id) return cand;
        n += 1;
        cand = n === 2 ? `${base}-dup` : `${base}-dup${n - 1}`;
      }
    };
    const data = {
      projectCode: await ensureUnique(codeRaw),
      name: (form.get("name") as string) || null,
      status: (form.get("status") as string) || null,
      isActive: form.get("is_active") === "on",
      notes: (form.get("notes") as string) || null,
    } as const;
    await prisma.job.update({ where: { id }, data: data as any });
    return redirect("/jobs");
  }

  return redirect("/jobs");
}

export default function JobsIndexRoute() {
  const { jobs } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";

  const form = useForm<{
    code: string | null;
    name: string | null;
    status: string | null;
    is_active: boolean;
    notes: string | null;
  }>({
    defaultValues: {
      code: "",
      name: "",
      status: "",
      is_active: false,
      notes: "",
    },
  });

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Jobs</Title>
        <BreadcrumbSet breadcrumbs={[{ label: "Jobs", href: "/jobs" }]} />
      </Group>

      <Group>
        <Button component="a" href="/jobs/new" variant="filled" color="blue">
          New Job
        </Button>
      </Group>

      <section>
        <Title order={4} mb="sm">
          All Jobs
        </Title>
        <Table striped withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Project Code</Table.Th>
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
                <Table.Td>
                  <Link to={`/jobs/${j.id}`}>{j.name}</Link>
                </Table.Td>
                <Table.Td>{j.projectCode || ""}</Table.Td>
                <Table.Td>{j.status}</Table.Td>
                <Table.Td>{(j as any).isActive ? "Yes" : "No"}</Table.Td>
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
