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
import { useRecordContext } from "../../../base/record/RecordContext";
import {
  Button,
  Checkbox,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  NumberInput,
  Select,
} from "@mantine/core";
import { CompanyDetailForm } from "~/modules/company/forms/CompanyDetailForm";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";
import { prisma } from "../../../utils/prisma.server";
import { BreadcrumbSet } from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.company?.name ? `Company ${data.company.name}` : "Company" },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) throw new Response("Not Found", { status: 404 });
  // Load vendor/customer mappings if this company is a customer
  const mappings = await prisma.vendorCustomerPricing.findMany({
    where: { customerId: id },
    include: { vendor: { select: { id: true, name: true } } },
    orderBy: { vendorId: "asc" },
  });
  // Vendor choices for adding new mapping
  const vendors = await prisma.company.findMany({
    where: { isSupplier: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
  return json({ company, mappings, vendors });
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
      notes: (form.get("notes") as string) || null,
      defaultMarginOverride:
        form.get("defaultMarginOverride") != null &&
        String(form.get("defaultMarginOverride")).trim() !== ""
          ? Number(form.get("defaultMarginOverride"))
          : null,
      priceMultiplier:
        form.get("priceMultiplier") != null &&
        String(form.get("priceMultiplier")).trim() !== ""
          ? Number(form.get("priceMultiplier"))
          : null,
    } as any;
    // Stock location: empty string clears to null
    if (form.has("stockLocationId")) {
      const raw = String(form.get("stockLocationId") ?? "");
      if (raw === "") data.stockLocationId = null;
      else {
        const lid = Number(raw);
        data.stockLocationId = Number.isFinite(lid) ? lid : null;
      }
    }
    await prisma.company.update({ where: { id }, data: data as any });
    return redirect(`/companies/${id}`);
  }

  if (intent === "pricing.add" || intent === "pricing.update") {
    const vendorId = Number(form.get("vendorId"));
    if (!vendorId) return redirect(`/companies/${id}`);
    const margin = form.get("marginOverride");
    await prisma.vendorCustomerPricing.upsert({
      where: { vendorId_customerId: { vendorId, customerId: id } },
      create: {
        vendorId,
        customerId: id,
        marginOverride:
          margin != null && String(margin) !== "" ? Number(margin) : null,
      },
      update: {
        marginOverride:
          margin != null && String(margin) !== "" ? Number(margin) : null,
      },
    });
    return redirect(`/companies/${id}`);
  }

  if (intent === "pricing.delete") {
    const vendorId = Number(form.get("vendorId"));
    if (vendorId) {
      await prisma.vendorCustomerPricing.delete({
        where: { vendorId_customerId: { vendorId, customerId: id } },
      });
    }
    return redirect(`/companies/${id}`);
  }

  if (intent === "delete") {
    await prisma.company.delete({ where: { id } });
    return redirect("/companies");
  }

  return redirect(`/companies/${id}`);
}

export default function CompanyDetailRoute() {
  const { company, mappings, vendors } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const { setCurrentId, getPathForId } = useRecordContext();
  useEffect(() => {
    setCurrentId(company.id);
  }, [company.id, setCurrentId]);
  // Keyboard prev/next handled centrally in RecordProvider now; local buttons removed

  const form = useForm<{
    id: number;
    name: string;
    notes: string;
    isCarrier: boolean;
    isCustomer: boolean;
    isSupplier: boolean;
    isInactive: boolean;
    defaultMarginOverride?: string | number | null;
    priceMultiplier?: string | number;
    stockLocationId?: number | null;
  }>({
    defaultValues: {
      id: company.id,
      name: company.name || "",
      notes: company.notes || "",
      isCarrier: !!company.isCarrier,
      isCustomer: !!company.isCustomer,
      isSupplier: !!company.isSupplier,
      isInactive: !!company.isInactive,
      defaultMarginOverride:
        company.defaultMarginOverride != null
          ? Number(company.defaultMarginOverride)
          : null,
      priceMultiplier:
        company.priceMultiplier != null
          ? Number(company.priceMultiplier)
          : undefined,
      stockLocationId: (company as any).stockLocationId ?? null,
    },
  });

  console.log("!! company form values", form.getValues());
  console.log("!! company form defaults", form.formState.defaultValues);

  // console.log("!! Company form values", form.getValues(), form.formState.defaultValues);

  // Reset form when loader data changes (after save or record navigation)
  useEffect(() => {
    console.log("!! COMPANY CHANGED");
    const next = {
      id: company.id,
      name: company.name || "",
      notes: company.notes || "",
      isCarrier: !!company.isCarrier,
      isCustomer: !!company.isCustomer,
      isSupplier: !!company.isSupplier,
      isInactive: !!company.isInactive,
      defaultMarginOverride:
        company.defaultMarginOverride != null
          ? Number(company.defaultMarginOverride)
          : null,
      priceMultiplier:
        company.priceMultiplier != null
          ? Number(company.priceMultiplier)
          : undefined,
      stockLocationId: (company as any).stockLocationId ?? null,
    };

    form.reset(next, { keepDirty: false });
  }, [company.id, company.updatedAt]); // narrow deps to avoid loops

  // Wire this form into the global Save/Cancel header via GlobalFormProvider in root
  type FormValues = {
    name: string;
    notes: string;
    isCarrier: boolean;
    isCustomer: boolean;
    isSupplier: boolean;
    isInactive: boolean;
    defaultMarginOverride?: string | number | null;
    priceMultiplier?: string | number | null;
    stockLocationId?: number | null;
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
    if (
      values.defaultMarginOverride != null &&
      String(values.defaultMarginOverride) !== ""
    )
      fd.set("defaultMarginOverride", String(values.defaultMarginOverride));
    if (values.priceMultiplier != null && String(values.priceMultiplier) !== "")
      fd.set("priceMultiplier", String(values.priceMultiplier));
    // Always include stockLocationId so clearing propagates
    if (Object.prototype.hasOwnProperty.call(values, "stockLocationId")) {
      const raw: any = (values as any).stockLocationId;
      fd.set(
        "stockLocationId",
        raw === undefined || raw === null || raw === "" ? "" : String(raw)
      );
    }
    submit(fd, { method: "post" });
  };

  useInitGlobalFormContext(form as any, save, () => form.reset());

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        {(() => {
          const appendHref = useFindHrefAppender();
          return (
            <BreadcrumbSet
              breadcrumbs={[
                { label: "Companies", href: appendHref("/companies") },
                {
                  label: company.name,
                  href: "#",
                },
              ]}
            />
          );
        })()}
      </Group>

      <CompanyDetailForm mode="edit" form={form as any} company={company} />

      {company.isCustomer && (
        <Stack gap="xs">
          <Title order={4}>Customer Settings</Title>
          <Group align="end" gap="md">
            <Controller
              name="priceMultiplier"
              control={form.control}
              render={({ field }) => (
                <NumberInput
                  {...field}
                  label="Price Multiplier"
                  placeholder="e.g. 1.10"
                  step={0.01}
                  value={field.value ?? undefined}
                />
              )}
            />
          </Group>
        </Stack>
      )}

      {company.isCustomer && (
        <Stack gap="xs">
          <Title order={4}>Vendor Pricing Overrides</Title>
          <form method="post">
            <input type="hidden" name="_intent" value="pricing.add" />
            <Group align="end" gap="md">
              <Select
                name="vendorId"
                label="Vendor"
                placeholder="Select vendor"
                data={(vendors || []).map((v: any) => ({
                  value: String(v.id),
                  label: v.name || String(v.id),
                }))}
                required
              />
              <TextInput
                name="marginOverride"
                label="Margin (decimal)"
                placeholder="e.g. 0.15"
              />
              {/* Multiplier is now a customer-level field, not per-vendor mapping */}
              <Button type="submit" variant="light">
                Add / Update
              </Button>
            </Group>
          </form>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Vendor</Table.Th>
                <Table.Th>Margin</Table.Th>
                <Table.Th>Multiplier</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(mappings || []).map((m: any) => (
                <Table.Tr key={m.vendorId}>
                  <Table.Td>{m.vendor?.name || m.vendorId}</Table.Td>
                  <Table.Td>{m.marginOverride ?? ""}</Table.Td>
                  <Table.Td>{m.priceMultiplier ?? ""}</Table.Td>
                  <Table.Td>
                    <form method="post" style={{ display: "inline" }}>
                      <input
                        type="hidden"
                        name="_intent"
                        value="pricing.delete"
                      />
                      <input type="hidden" name="vendorId" value={m.vendorId} />
                      <Button
                        type="submit"
                        color="red"
                        variant="subtle"
                        size="xs"
                      >
                        Delete
                      </Button>
                    </form>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}

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
