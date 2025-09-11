import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { Form, useNavigation, useSubmit } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group, Stack, Title } from "@mantine/core";
import { useForm } from "react-hook-form";
import { action as invoicesAction } from "./invoices.$id";
import { InvoiceDetailForm } from "../components/InvoiceDetailForm";

export const meta: MetaFunction = () => [{ title: "New Invoice" }];

export async function action(args: ActionFunctionArgs) {
  // Delegate to shared $id action
  return invoicesAction({ ...(args as any), params: { id: "new" } } as any);
}

export default function NewInvoiceRoute() {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      invoiceCode: "",
      status: "",
      date: "",
      notes: "",
      companyId: null as number | null,
    },
  });
  const onSubmit = (values: any) => {
    const fd = new FormData();
    if (values.invoiceCode) fd.set("invoiceCode", values.invoiceCode);
    if (values.status) fd.set("status", values.status);
    if (values.date) fd.set("date", values.date);
    if (values.companyId != null) fd.set("companyId", String(values.companyId));
    if (values.notes) fd.set("notes", values.notes);
    submit(fd, { method: "post" });
  };
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>New Invoice</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Invoices", href: "/invoices" },
            { label: "New", href: "#" },
          ]}
        />
      </Group>
      <Form method="post" onSubmit={form.handleSubmit(onSubmit)}>
        <InvoiceDetailForm mode="edit" form={form as any} />
        <Group justify="end" mt="md">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Create Invoice"}
          </Button>
        </Group>
      </Form>
    </Stack>
  );
}
