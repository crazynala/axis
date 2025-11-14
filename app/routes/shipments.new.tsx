import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { Form, useNavigation, useSubmit } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group, Stack, Title } from "@mantine/core";
import { useForm } from "react-hook-form";
import { action as shipmentsAction } from "./shipments.$id";
import { ShipmentDetailForm } from "../modules/shipment/forms/ShipmentDetailForm";

export const meta: MetaFunction = () => [{ title: "New Shipment" }];

export async function action(args: ActionFunctionArgs) {
  // Delegate to shared $id action
  return shipmentsAction({ ...(args as any), params: { id: "new" } } as any);
}

export default function NewShipmentRoute() {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      date: "",
      dateReceived: "",
      status: "",
      type: "Out",
      shipmentType: "",
      trackingNo: "",
      packingSlipCode: "",
      companyIdReceiver: null,
      contactIdReceiver: null,
    },
  });
  const onSubmit = (values: any) => {
    const fd = new FormData();
    if (values.date) fd.set("date", values.date);
    if (values.dateReceived) fd.set("dateReceived", values.dateReceived);
    if (values.status) fd.set("status", values.status);
    if (values.type) fd.set("type", values.type);
    if (values.shipmentType) fd.set("shipmentType", values.shipmentType);
    if (values.trackingNo) fd.set("trackingNo", values.trackingNo);
    if (values.packingSlipCode)
      fd.set("packingSlipCode", values.packingSlipCode);
    if (values.companyIdReceiver != null)
      fd.set("companyIdReceiver", String(values.companyIdReceiver));
    if (values.contactIdReceiver != null)
      fd.set("contactIdReceiver", String(values.contactIdReceiver));
    submit(fd, { method: "post" });
  };
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>New Shipment</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Shipments", href: "/shipments" },
            { label: "New", href: "#" },
          ]}
        />
      </Group>
      <Form method="post" onSubmit={form.handleSubmit(onSubmit)}>
        <ShipmentDetailForm mode="edit" form={form as any} />
        <Group justify="end" mt="md">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Create Shipment"}
          </Button>
        </Group>
      </Form>
    </Stack>
  );
}
