import { json, redirect } from "@remix-run/node";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Button,
  Group,
  Select,
  Stack,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { BreadcrumbSet } from "@aa/timber";
import { prisma } from "../../../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "New Activity" }];

export async function loader(_args: LoaderFunctionArgs) {
  const [assemblies, jobs] = await Promise.all([
    prisma.assembly.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
    prisma.job.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return json({ assemblies, jobs });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const data = {
    name: (form.get("name") as string) || null,
    description: (form.get("description") as string) || null,
    assemblyId: form.get("assemblyId") ? Number(form.get("assemblyId")) : null,
    jobId: form.get("jobId") ? Number(form.get("jobId")) : null,
    startTime: form.get("startTime")
      ? new Date(form.get("startTime") as string)
      : null,
    endTime: form.get("endTime")
      ? new Date(form.get("endTime") as string)
      : null,
    status: (form.get("status") as string) || null,
    notes: (form.get("notes") as string) || null,
  } as any;
  await prisma.assemblyActivity.create({ data });
  return redirect("/assembly-activities");
}

export default function NewActivityRoute() {
  const { assemblies, jobs } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      name: "",
      description: "",
      assemblyId: null as number | null,
      jobId: null as number | null,
      startTime: "",
      endTime: "",
      status: "",
      notes: "",
    },
  });
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>New Activity</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Assembly Activities", href: "/assembly-activities" },
            { label: "New", href: "#" },
          ]}
        />
      </Group>
      <form
        onSubmit={form.handleSubmit((values) => {
          const fd = new FormData();
          Object.entries(values).forEach(([k, v]) => {
            if (v != null && v !== "") fd.set(k, String(v));
          });
          submit(fd, { method: "post" });
        })}
      >
        <Group gap="md" align="flex-end">
          <TextInput label="Name" w={180} {...form.register("name")} />
          <Textarea
            label="Description"
            w={220}
            {...form.register("description")}
          />
          <Controller
            name="assemblyId"
            control={form.control}
            render={({ field }) => (
              <Select
                label="Assembly"
                w={160}
                value={field.value ? String(field.value) : null}
                onChange={(v) => field.onChange(v ? Number(v) : null)}
                data={assemblies.map((a: any) => ({
                  value: String(a.id),
                  label: a.name || `Assembly #${a.id}`,
                }))}
                clearable
              />
            )}
          />
          <Controller
            name="jobId"
            control={form.control}
            render={({ field }) => (
              <Select
                label="Job"
                w={160}
                value={field.value ? String(field.value) : null}
                onChange={(v) => field.onChange(v ? Number(v) : null)}
                data={jobs.map((j: any) => ({
                  value: String(j.id),
                  label: j.name || `Job #${j.id}`,
                }))}
                clearable
              />
            )}
          />
          <TextInput
            label="Start Time"
            type="datetime-local"
            w={180}
            {...form.register("startTime")}
          />
          <TextInput
            label="End Time"
            type="datetime-local"
            w={180}
            {...form.register("endTime")}
          />
          <TextInput label="Status" w={120} {...form.register("status")} />
          <Textarea label="Notes" w={180} {...form.register("notes")} />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </Group>
      </form>
    </Stack>
  );
}
