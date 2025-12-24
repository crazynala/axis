import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { Form, useActionData, useNavigation, useSubmit } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { useForm, useWatch } from "react-hook-form";
import { useEffect, useRef, useState } from "react";
import { formatAddressLines } from "~/utils/addressFormat";
import { action as shipmentsAction } from "./shipments.$id";
import { ShipmentDetailForm } from "../forms/ShipmentDetailForm";

export const meta: MetaFunction = () => [{ title: "New Shipment" }];

export async function action(args: ActionFunctionArgs) {
  // Delegate to shared $id action
  return shipmentsAction({ ...(args as any), params: { id: "new" } } as any);
}

export default function NewShipmentRoute() {
  const actionData = useActionData<typeof action>() as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      dateReceived: "",
      status: "DRAFT",
      type: "Out",
      shipmentType: "",
      trackingNo: "",
      packingSlipCode: "",
      companyIdReceiver: null,
      contactIdReceiver: null,
      packMode: "box",
    },
  });
  const [shipToOptions, setShipToOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const receiverCompanyId = useWatch({
    control: form.control,
    name: "companyIdReceiver",
  });
  const receiverContactId = useWatch({
    control: form.control,
    name: "contactIdReceiver",
  });
  const prevReceiverCompanyId = useRef<number | null | undefined>(
    receiverCompanyId
  );
  useEffect(() => {
    if (
      prevReceiverCompanyId.current !== undefined &&
      prevReceiverCompanyId.current !== receiverCompanyId
    ) {
      form.setValue("addressIdShip", null);
    }
    prevReceiverCompanyId.current = receiverCompanyId;
  }, [receiverCompanyId, form]);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const companyId =
        receiverCompanyId != null ? Number(receiverCompanyId) : null;
      const contactId =
        receiverContactId != null ? Number(receiverContactId) : null;
      if (!companyId && !contactId) {
        setShipToOptions([]);
        return;
      }
      const urls: string[] = [];
      if (companyId) urls.push(`/companies/${companyId}/addresses`);
      if (contactId) urls.push(`/contacts/${contactId}/addresses`);
      try {
        const responses = await Promise.all(
          urls.map((url) => fetch(url).then((r) => r.json()))
        );
        if (cancelled) return;
        const merged: Record<string, { value: string; label: string }> = {};
        let contactDefaultId: number | null = null;
        let companyDefaultId: number | null = null;
        for (const payload of responses) {
          const list = payload?.addresses || [];
          if (payload?.contactId && payload?.defaultAddressId != null) {
            contactDefaultId = Number(payload.defaultAddressId) || null;
          }
          if (payload?.companyId && payload?.defaultAddressId != null) {
            companyDefaultId = Number(payload.defaultAddressId) || null;
          }
          list.forEach((addr: any) => {
            const lines = formatAddressLines(addr);
            const base = lines[0] || `Address ${addr.id}`;
            const tail = lines.slice(1).join(", ");
            merged[String(addr.id)] = {
              value: String(addr.id),
              label: tail ? `${base} — ${tail}` : base,
            };
          });
        }
        setShipToOptions(Object.values(merged));
        const current = form.getValues("addressIdShip");
        const preferredDefault =
          contactDefaultId ?? companyDefaultId ?? null;
        if (
          current == null &&
          preferredDefault != null &&
          merged[String(preferredDefault)]
        ) {
          form.setValue("addressIdShip", preferredDefault);
        }
      } catch {
        if (!cancelled) setShipToOptions([]);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [receiverCompanyId, receiverContactId]);
  const onSubmit = (values: any) => {
    const fd = new FormData();
    if (values.date) fd.set("date", values.date);
    if (values.dateReceived) fd.set("dateReceived", values.dateReceived);
    fd.set("status", "DRAFT");
    if (values.type) fd.set("type", values.type);
    if (values.shipmentType) fd.set("shipmentType", values.shipmentType);
    if (values.trackingNo) fd.set("trackingNo", values.trackingNo);
    if (values.packingSlipCode)
      fd.set("packingSlipCode", values.packingSlipCode);
    if (values.packMode) fd.set("packMode", values.packMode);
    if (values.companyIdReceiver != null)
      fd.set("companyIdReceiver", String(values.companyIdReceiver));
    if (values.contactIdReceiver != null)
      fd.set("contactIdReceiver", String(values.contactIdReceiver));
    if (values.addressIdShip != null)
      fd.set("addressIdShip", String(values.addressIdShip));
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
        {actionData?.error ? <Text c="red">{actionData.error}</Text> : null}
        <ShipmentDetailForm
          mode="create"
          form={form as any}
          fieldCtx={{ fieldOptions: { address_shipto: shipToOptions } }}
        />
        <Group justify="end" mt="md">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Create Shipment"}
          </Button>
        </Group>
      </Form>
    </Stack>
  );
}
