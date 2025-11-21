import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { useNavigation, Form } from "@remix-run/react";
import {
  Button,
  Group,
  Stack,
  TextInput,
  Title,
  Card,
  Divider,
  SimpleGrid,
  Select,
} from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { BreadcrumbSet } from "@aa/timber";
import { prisma } from "../../../utils/prisma.server";
import { DatePickerInput } from "@mantine/dates";
import { useMemo } from "react";
import { useOptions } from "~/base/options/OptionsContext";
import { normalizeJobState } from "~/modules/job/stateUtils";

export const meta: MetaFunction = () => [{ title: "New Job" }];

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const payload: any = {
    projectCode: ((form.get("projectCode") as string) || "").trim() || null,
    name: (form.get("name") as string) || null,
    status: (form.get("status") as string) || null,
    jobType: (form.get("jobType") as string) || null,
    endCustomerName: (form.get("endCustomerName") as string) || null,
    companyId: (() => {
      const raw = (form.get("companyId") as string) || "";
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    })(),
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
  payload.status = normalizeJobState(payload.status) ?? "DRAFT";
  const created = await prisma.job.create({ data: payload });
  console.log("[jobs.new] created job", { id: created.id });
  return redirect(`/jobs/${created.id}`);
}

export default function NewJobRoute() {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const options = useOptions();
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
      companyId: "",
    },
  });
  const customerOptions = useMemo(
    () => options?.customerOptions ?? [],
    [options?.customerOptions]
  );
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
      <Form method="post" onSubmit={form.handleSubmit(() => {})}>
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
              <Controller
                control={form.control}
                name="companyId"
                render={({ field }) => (
                  <Select
                    label="Customer"
                    data={customerOptions}
                    searchable
                    clearable
                    nothingFoundMessage="No matches"
                    value={field.value || null}
                    onChange={(value) => field.onChange(value ?? "")}
                  />
                )}
              />
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
                  value={form.watch("customerOrderDate") as Date | null}
                  onChange={(v) =>
                    form.setValue(
                      "customerOrderDate",
                      v ? (v as unknown as Date) : null
                    )
                  }
                  valueFormat="YYYY-MM-DD"
                  clearable
                />
                <DatePickerInput
                  label="Target Date"
                  value={form.watch("targetDate")}
                  onChange={(v) =>
                    form.setValue(
                      "targetDate",
                      v ? (v as unknown as Date) : null
                    )
                  }
                  valueFormat="YYYY-MM-DD"
                  clearable
                />
                <DatePickerInput
                  label="Drop Dead"
                  value={form.watch("dropDeadDate")}
                  onChange={(v) =>
                    form.setValue(
                      "dropDeadDate",
                      v ? (v as unknown as Date) : null
                    )
                  }
                  valueFormat="YYYY-MM-DD"
                  clearable
                />
                <DatePickerInput
                  label="Submitted"
                  value={form.watch("cutSubmissionDate")}
                  onChange={(v) =>
                    form.setValue(
                      "cutSubmissionDate",
                      v ? (v as unknown as Date) : null
                    )
                  }
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
      </Form>
    </Stack>
  );
}
