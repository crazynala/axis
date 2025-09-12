import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Button,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { BreadcrumbSet } from "@aa/timber";
import { useRecordContext } from "../record/RecordContext";
import { useEffect } from "react";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.activity ? `Activity #${data.activity.id}` : "Activity" },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const activity = await prisma.assemblyActivity.findUnique({
    where: { id },
    include: { assembly: true, job: true },
  });
  if (!activity) throw new Response("Not Found", { status: 404 });
  const assemblies = await prisma.assembly.findMany({
    select: { id: true, name: true },
  });
  const jobs = await prisma.job.findMany({ select: { id: true, name: true } });
  return json({ activity, assemblies, jobs });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "update") {
    const data = {
      name: (form.get("name") as string) || null,
      description: (form.get("description") as string) || null,
      assemblyId: form.get("assemblyId")
        ? Number(form.get("assemblyId"))
        : null,
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
    await prisma.assemblyActivity.update({ where: { id }, data });
    return redirect(`/assembly-activities/${id}`);
  }

  if (intent === "delete") {
    await prisma.assemblyActivity.delete({ where: { id } });
    return redirect("/assembly-activities");
  }

  return redirect(`/assembly-activities/${id}`);
}

export default function AssemblyActivityDetailRoute() {
  const { activity, assemblies, jobs } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const { setCurrentId } = useRecordContext();
  useEffect(() => {
    setCurrentId(activity.id);
  }, [activity.id, setCurrentId]);
  // Prev/Next hotkeys handled globally in RecordProvider

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{activity.name || `Activity #${activity.id}`}</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Assembly Activities", href: "/assembly-activities" },
            {
              label: String(activity.id),
              href: `/assembly-activities/${activity.id}`,
            },
          ]}
        />
      </Group>
      <Group gap="xs"></Group>

      <Form method="post">
        <input type="hidden" name="_intent" value="update" />
        <Group align="flex-end" wrap="wrap">
          <TextInput
            name="name"
            label="Name"
            w={200}
            defaultValue={activity.name || ""}
          />
          <Textarea
            name="description"
            label="Description"
            w={260}
            defaultValue={activity.description || ""}
          />
          <Select
            name="assemblyId"
            label="Assembly"
            w={180}
            data={assemblies.map((a: any) => ({
              value: String(a.id),
              label: a.name || `Assembly #${a.id}`,
            }))}
            defaultValue={
              activity.assemblyId != null ? String(activity.assemblyId) : null
            }
            clearable
          />
          <Select
            name="jobId"
            label="Job"
            w={180}
            data={jobs.map((j: any) => ({
              value: String(j.id),
              label: j.name || `Job #${j.id}`,
            }))}
            defaultValue={
              activity.jobId != null ? String(activity.jobId) : null
            }
            clearable
          />
          <TextInput
            name="startTime"
            label="Start Time"
            type="datetime-local"
            w={200}
            defaultValue={
              (activity as any).startTime
                ? new Date((activity as any).startTime)
                    .toISOString()
                    .slice(0, 16)
                : ""
            }
          />
          <TextInput
            name="endTime"
            label="End Time"
            type="datetime-local"
            w={200}
            defaultValue={
              (activity as any).endTime
                ? new Date((activity as any).endTime).toISOString().slice(0, 16)
                : ""
            }
          />
          <TextInput
            name="status"
            label="Status"
            w={140}
            defaultValue={(activity as any).status || ""}
          />
          <Textarea
            name="notes"
            label="Notes"
            w={240}
            defaultValue={activity.notes || ""}
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </Group>
      </Form>

      <Form method="post">
        <input type="hidden" name="_intent" value="delete" />
        <Button type="submit" color="red" variant="light" disabled={busy}>
          {busy ? "Deleting..." : "Delete"}
        </Button>
      </Form>

      <Text c="dimmed" size="sm">
        ID: {activity.id}
      </Text>
    </Stack>
  );
}
