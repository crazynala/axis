import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { useNavigation, useSubmit } from "@remix-run/react";
import {
  Button,
  Group,
  Stack,
  TextInput,
  Title,
  Card,
  Divider,
  SimpleGrid,
} from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { BreadcrumbSet } from "@aa/timber";
import { prisma } from "../utils/prisma.server";
import { DatePickerInput } from "@mantine/dates";

export const meta: MetaFunction = () => [{ title: "New Job" }];

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const payload: any = {
    projectCode: ((form.get("projectCode") as string) || "").trim() || null,
    name: (form.get("name") as string) || null,
    status: (form.get("status") as string) || null,
    jobType: (form.get("jobType") as string) || null,
    endCustomerName: (form.get("endCustomerName") as string) || null,
  };
  const dateFields = [
    "customerOrderDate",
    "targetDate",
    "dropDeadDate",
    "cutSubmissionDate",
  ];
  for (const df of dateFields) {
    if (form.has(df)) {
      const v = form.get(df) as string;
      payload[df] = v ? new Date(v) : null;
    }
  }
  console.log("[jobs.new] action: creating job", {
    projectCode: payload.projectCode,
    name: payload.name,
    status: payload.status,
    jobType: payload.jobType,
    hasDates: dateFields.reduce(
      (acc, k) => ({ ...acc, [k]: !!payload[k] }),
      {}
    ),
  });
  const created = await prisma.job.create({ data: payload });
  console.log("[jobs.new] created job", { id: created.id });
  return redirect(`/jobs/${created.id}`);
}

export default function NewJobRoute() {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      projectCode: "",
      name: "",
      status: "",
      jobType: "",
      endCustomerName: "",
      customerOrderDate: null as Date | null,
      targetDate: null as Date | null,
      dropDeadDate: null as Date | null,
      cutSubmissionDate: null as Date | null,
    },
  });
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>New Job</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Jobs", href: "/jobs" },
            { label: "New", href: "#" },
          ]}
        />
      </Group>
      <form
        onSubmit={form.handleSubmit((values) => {
          const fd = new FormData();
          if (values.projectCode) fd.set("projectCode", values.projectCode);
          if (values.name) fd.set("name", values.name);
          if (values.status) fd.set("status", values.status);
          if (values.jobType) fd.set("jobType", values.jobType);
          if (values.endCustomerName)
            fd.set("endCustomerName", values.endCustomerName);
          if (values.customerOrderDate)
            fd.set(
              "customerOrderDate",
              new Date(values.customerOrderDate).toISOString().slice(0, 10)
            );
          if (values.targetDate)
            fd.set(
              "targetDate",
              new Date(values.targetDate).toISOString().slice(0, 10)
            );
          if (values.dropDeadDate)
            fd.set(
              "dropDeadDate",
              new Date(values.dropDeadDate).toISOString().slice(0, 10)
            );
          if (values.cutSubmissionDate)
            fd.set(
              "cutSubmissionDate",
              new Date(values.cutSubmissionDate).toISOString().slice(0, 10)
            );
          submit(fd, { method: "post" });
        })}
      >
        <SimpleGrid cols={2} spacing="md">
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Title order={4}>Overview</Title>
            </Card.Section>
            <Divider my="xs" />
            <Stack gap={8}>
              <TextInput
                label="Project Code"
                {...form.register("projectCode")}
              />
              <TextInput label="Name" {...form.register("name")} />
            </Stack>
          </Card>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Title order={4}>Dates & Status</Title>
            </Card.Section>
            <Divider my="xs" />
            <SimpleGrid cols={2} spacing="md">
              <Stack gap={8}>
                <DatePickerInput
                  label="Order Date"
                  value={form.watch("customerOrderDate")}
                  onChange={(v) => form.setValue("customerOrderDate", v)}
                  valueFormat="YYYY-MM-DD"
                  clearable
                />
                <DatePickerInput
                  label="Target Date"
                  value={form.watch("targetDate")}
                  onChange={(v) => form.setValue("targetDate", v)}
                  valueFormat="YYYY-MM-DD"
                  clearable
                />
                <DatePickerInput
                  label="Drop Dead"
                  value={form.watch("dropDeadDate")}
                  onChange={(v) => form.setValue("dropDeadDate", v)}
                  valueFormat="YYYY-MM-DD"
                  clearable
                />
                <DatePickerInput
                  label="Submitted"
                  value={form.watch("cutSubmissionDate")}
                  onChange={(v) => form.setValue("cutSubmissionDate", v)}
                  valueFormat="YYYY-MM-DD"
                  clearable
                />
              </Stack>
              <Stack gap={8}>
                <TextInput label="Status" {...form.register("status")} />
                <TextInput label="Type" {...form.register("jobType")} />
                <TextInput
                  label="End Customer"
                  {...form.register("endCustomerName")}
                />
              </Stack>
            </SimpleGrid>
          </Card>
        </SimpleGrid>
        <Group justify="end" mt="md">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Create Job"}
          </Button>
        </Group>
      </form>
    </Stack>
  );
}
