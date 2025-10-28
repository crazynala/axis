import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { useNavigation, useSubmit, Link } from "@remix-run/react";
import { Button, Checkbox, Group, Stack, TextInput, Title } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { GlobalFormProvider, SaveCancelHeader, BreadcrumbSet } from "@aa/timber";
import { prisma } from "../../../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "New Company" }];

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const data = {
    name: (form.get("name") as string) || null,
    isCarrier: form.get("isCarrier") === "on",
    isCustomer: form.get("isCustomer") === "on",
    isSupplier: form.get("isSupplier") === "on",
    isInactive: form.get("isInactive") === "on",
    notes: (form.get("notes") as string) || null,
  };
  await prisma.company.create({ data });
  return redirect("/companies");
}

export default function NewCompanyRoute() {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      name: "",
      isCarrier: false,
      isCustomer: false,
      isSupplier: false,
      isInactive: false,
      notes: "",
    },
  });

  const breadcrumbs = [
    { label: "Companies", href: "/companies" },
    { label: "New", href: "#" },
  ];

  return (
    <GlobalFormProvider>
      <Stack gap="lg">
        <BreadcrumbSet breadcrumbs={breadcrumbs} />
        <Title order={2}>New Company</Title>
        <SaveCancelHeader />
        <form
          onSubmit={form.handleSubmit((values) => {
            const fd = new FormData();
            fd.set("name", values.name);
            // Removed type and is_active, now using booleans below
            if (values.isCarrier) fd.set("isCarrier", "on");
            if (values.isCustomer) fd.set("isCustomer", "on");
            if (values.isSupplier) fd.set("isSupplier", "on");
            if (values.isInactive) fd.set("isInactive", "on");
            if (values.notes) fd.set("notes", values.notes);
            submit(fd, { method: "post" });
          })}
        >
          <Group align="flex-end" wrap="wrap">
            <TextInput label="Name" w={240} {...form.register("name")} />
            <Controller
              name="isCarrier"
              control={form.control}
              render={({ field }) => <Checkbox label="Carrier" checked={!!field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />}
            />
            <Controller
              name="isCustomer"
              control={form.control}
              render={({ field }) => <Checkbox label="Customer" checked={!!field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />}
            />
            <Controller
              name="isSupplier"
              control={form.control}
              render={({ field }) => <Checkbox label="Supplier" checked={!!field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />}
            />
            <Controller
              name="isInactive"
              control={form.control}
              render={({ field }) => <Checkbox label="Inactive" checked={!!field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />}
            />
            <TextInput label="Notes" w={240} {...form.register("notes")} />
          </Group>
          <Group mt="md">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
            <Button component={Link} to="/companies" variant="default">
              Cancel
            </Button>
          </Group>
        </form>
      </Stack>
    </GlobalFormProvider>
  );
}
