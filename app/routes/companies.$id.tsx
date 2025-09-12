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
import { useInitGlobalFormContext } from "@aa/timber";
import { useRecordContext } from "../record/RecordContext";
import { Button, Checkbox, Group, Stack, Text, Title } from "@mantine/core";
import { CompanyDetailForm } from "../components/CompanyDetailForm";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.company?.name ? `Company ${data.company.name}` : "Company" },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) throw new Response("Not Found", { status: 404 });
  return json({ company });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "update") {
    const data = {
      name: (form.get("name") as string) || null,
      isCarrier: form.get("isCarrier") === "on",
      isCustomer: form.get("isCustomer") === "on",
      isSupplier: form.get("isSupplier") === "on",
      isInactive: form.get("isInactive") === "on",
      isActive: form.get("isActive") === "on",
      notes: (form.get("notes") as string) || null,
    } as const;
    await prisma.company.update({ where: { id }, data: data as any });
    return redirect(`/companies/${id}`);
  }

  if (intent === "delete") {
    await prisma.company.delete({ where: { id } });
    return redirect("/companies");
  }

  return redirect(`/companies/${id}`);
}

export default function CompanyDetailRoute() {
  const { company } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const { setCurrentId, getPathForId } = useRecordContext();
  useEffect(() => {
    setCurrentId(company.id);
  }, [company.id, setCurrentId]);
  // Keyboard prev/next handled centrally in RecordProvider now; local buttons removed

  const form = useForm<{
    name: string;
    notes: string;
    isCarrier: boolean;
    isCustomer: boolean;
    isSupplier: boolean;
    isInactive: boolean;
    isActive: boolean;
  }>({
    defaultValues: {
      name: company.name || "",
      notes: company.notes || "",
      isCarrier: !!company.isCarrier,
      isCustomer: !!company.isCustomer,
      isSupplier: !!company.isSupplier,
      isInactive: !!company.isInactive,
      isActive: !!company.isActive,
    },
  });

  // Reset form when navigating to a different company via record browser
  useEffect(() => {
    form.reset({
      name: company.name || "",
      notes: company.notes || "",
      isCarrier: !!company.isCarrier,
      isCustomer: !!company.isCustomer,
      isSupplier: !!company.isSupplier,
      isInactive: !!company.isInactive,
      isActive: !!company.isActive,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

  // Wire this form into the global Save/Cancel header via GlobalFormProvider in root
  type FormValues = {
    name: string;
    notes: string;
    isCarrier: boolean;
    isCustomer: boolean;
    isSupplier: boolean;
    isInactive: boolean;
    isActive: boolean;
  };
  const save = (values: FormValues) => {
    const fd = new FormData();
    fd.set("_intent", "update");
    fd.set("name", values.name ?? "");
    if (values.notes) fd.set("notes", values.notes);
    if (values.isCarrier) fd.set("isCarrier", "on");
    if (values.isCustomer) fd.set("isCustomer", "on");
    if (values.isSupplier) fd.set("isSupplier", "on");
    if (values.isInactive) fd.set("isInactive", "on");
    if (values.isActive) fd.set("isActive", "on");
    submit(fd, { method: "post" });
  };

  useInitGlobalFormContext(form as any, save, () => form.reset());

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{company.name || `Company #${company.id}`}</Title>
        <Group></Group>
      </Group>

      <CompanyDetailForm mode="edit" form={form as any} company={company} />

      <form method="post">
        <input type="hidden" name="_intent" value="delete" />
        <Button type="submit" color="red" variant="light" disabled={busy}>
          {busy ? "Deleting..." : "Delete"}
        </Button>
      </form>

      <Text c="dimmed" size="sm">
        ID: {company.id}
      </Text>
    </Stack>
  );
}
