import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { useNavigation, useSubmit } from "@remix-run/react";
import { Button, Checkbox, Group, Stack, TextInput, Title } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { BreadcrumbSet } from "packages/timber";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "New Job" }];

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const data = {
    projectCode: ((form.get("code") as string) || null)?.trim() || null,
    name: (form.get("name") as string) || null,
    status: (form.get("status") as string) || null,
    isActive: form.get("is_active") === "on",
    notes: (form.get("notes") as string) || null,
  } as const;
  await prisma.job.create({ data: data as any });
  return redirect("/jobs");
}

export default function NewJobRoute() {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const form = useForm({ defaultValues: { code: "", name: "", status: "", is_active: false, notes: "" } });
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
          if (values.code) fd.set("code", values.code);
          if (values.name) fd.set("name", values.name);
          if (values.status) fd.set("status", values.status);
          if (values.is_active) fd.set("is_active", "on");
          if (values.notes) fd.set("notes", values.notes);
          submit(fd, { method: "post" });
        })}
      >
        <Group align="flex-end" wrap="wrap">
          <TextInput label="Code" w={160} {...form.register("code")} />
          <TextInput label="Name" w={220} {...form.register("name")} />
          <TextInput label="Status" w={160} {...form.register("status")} />
          <Controller name="is_active" control={form.control} render={({ field }) => <Checkbox label="Active" checked={!!field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
          <TextInput label="Notes" w={260} {...form.register("notes")} />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </Group>
      </form>
    </Stack>
  );
}
