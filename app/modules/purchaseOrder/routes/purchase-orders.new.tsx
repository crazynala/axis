import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { Form, useNavigation, useSubmit } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group, Stack, Title } from "@mantine/core";
import { useForm } from "react-hook-form";
import { action as poAction } from "./purchase-orders.$id";
import { PurchaseOrderDetailForm } from "~/modules/purchaseOrder/forms/PurchaseOrderDetailForm";

export const meta: MetaFunction = () => [{ title: "New Purchase Order" }];

export async function action(args: ActionFunctionArgs) {
  // Delegate to shared $id action
  return poAction({ ...(args as any), params: { id: "new" } } as any);
}

export default function NewPurchaseOrderRoute() {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      date: new Date(),
      status: "",
    },
  });
  const onSubmit = (values: any) => {
    // Require vendor and consignee
    const vendorId = values.companyId ?? null;
    const consigneeId = values.consigneeCompanyId ?? null;
    if (vendorId == null || consigneeId == null) {
      alert("Vendor and Consignee are required.");
      return;
    }
    const po = {
      date: values.date ?? new Date(),
      status: values.status ?? "DRAFT",
      companyId: vendorId,
      consigneeCompanyId: consigneeId,
      locationId: values.locationId ?? null,
      memo: values.memo ?? null,
    };
    const fd = new FormData();
    fd.set("_intent", "po.create");
    fd.set("purchaseOrder", JSON.stringify(po));
    submit(fd, { method: "post" });
  };
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>New Purchase Order</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Purchase Orders", href: "/purchase-orders" },
            { label: "New", href: "#" },
          ]}
        />
      </Group>
      <Form
        method="post"
        onSubmit={form.handleSubmit(onSubmit)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Prevent Enter from submitting to avoid conflicts with combobox selection UX
            e.preventDefault();
          }
        }}
      >
        <PurchaseOrderDetailForm mode="create" form={form as any} />
        <Group justify="end" mt="md">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Create PO"}
          </Button>
        </Group>
      </Form>
    </Stack>
  );
}
