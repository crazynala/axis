import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  Outlet,
  useActionData,
  useNavigation,
  useRouteLoaderData,
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
  Modal,
} from "@mantine/core";
import { CompanyDetailForm } from "~/modules/company/forms/CompanyDetailForm";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { prisma } from "../../../utils/prisma.server";
import { BreadcrumbSet } from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { getSavedIndexSearch } from "~/hooks/useNavLocation";
import { formatAddressLines } from "~/utils/addressFormat";
import type { AddressInput } from "~/modules/address/services/addresses.server";
import {
  createCompanyAddress,
  deleteCompanyAddress,
  setCompanyDefaultAddress,
  updateCompanyAddress,
} from "~/modules/address/services/addresses.server";
import { assertAddressOwnedByCompany } from "~/utils/addressOwnership.server";
import { AddressPickerField } from "~/components/addresses/AddressPickerField";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.company?.name ? `Company ${data.company.name}` : "Company" },
];

function readAddressInput(form: FormData): AddressInput {
  const get = (key: string) => {
    const raw = form.get(key);
    if (raw == null) return null;
    const value = String(raw).trim();
    return value === "" ? null : value;
  };
  return {
    name: get("name"),
    addressCountry: get("addressCountry"),
    addressCountyState: get("addressCountyState"),
    addressLine1: get("addressLine1"),
    addressLine2: get("addressLine2"),
    addressLine3: get("addressLine3"),
    addressTownCity: get("addressTownCity"),
    addressZipPostCode: get("addressZipPostCode"),
  };
}

function parseAddressId(raw: FormDataEntryValue | null) {
  const value = raw == null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) return redirect("/companies");
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      defaultAddress: true,
      addresses: {
        select: {
          id: true,
          name: true,
          addressLine1: true,
          addressLine2: true,
          addressLine3: true,
          addressTownCity: true,
          addressCountyState: true,
          addressZipPostCode: true,
          addressCountry: true,
        },
        orderBy: { id: "asc" },
      },
      contacts: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneDirect: true,
          phoneMobile: true,
          defaultAddressId: true,
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!company) return redirect("/companies");
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

  if (
    intent === "companyAddress.create" ||
    intent === "companyAddress.update" ||
    intent === "companyAddress.delete" ||
    intent === "companyAddress.setDefault"
  ) {
    try {
      if (intent === "companyAddress.create") {
        await createCompanyAddress({ companyId: id, data: readAddressInput(form) });
      } else if (intent === "companyAddress.update") {
        const addressId = parseAddressId(form.get("addressId"));
        if (!addressId) {
          return json({ error: "Missing addressId" }, { status: 400 });
        }
        await updateCompanyAddress({
          companyId: id,
          addressId,
          data: readAddressInput(form),
        });
      } else if (intent === "companyAddress.delete") {
        const addressId = parseAddressId(form.get("addressId"));
        if (!addressId) {
          return json({ error: "Missing addressId" }, { status: 400 });
        }
        await deleteCompanyAddress({ companyId: id, addressId });
      } else if (intent === "companyAddress.setDefault") {
        const addressId = parseAddressId(form.get("addressId"));
        if (addressId != null) {
          const owned = await assertAddressOwnedByCompany(addressId, id);
          if (!owned) {
            return json(
              { error: "Default address must belong to this company." },
              { status: 400 }
            );
          }
        }
        await setCompanyDefaultAddress({ companyId: id, addressId: addressId ?? null });
      }
      return redirect(`/companies/${id}`);
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "Request failed" },
        { status: 400 }
      );
    }
  }

  if (intent === "update") {
    const data = {
      name: (form.get("name") as string) || null,
      isCarrier: form.get("isCarrier") === "on",
      isCustomer: form.get("isCustomer") === "on",
      isConsignee: form.get("isConsignee") === "on",
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
      invoiceBillUpon: (form.get("invoiceBillUpon") as string) || null,
      invoicePercentOnCut:
        form.get("invoicePercentOnCut") != null &&
        String(form.get("invoicePercentOnCut")).trim() !== ""
          ? Number(form.get("invoicePercentOnCut"))
          : null,
      invoicePercentOnOrder:
        form.get("invoicePercentOnOrder") != null &&
        String(form.get("invoicePercentOnOrder")).trim() !== ""
          ? Number(form.get("invoicePercentOnOrder"))
          : null,
      defaultLeadTimeDays:
        form.get("defaultLeadTimeDays") != null &&
        String(form.get("defaultLeadTimeDays")).trim() !== ""
          ? Number(form.get("defaultLeadTimeDays"))
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

export function CompanyDetailView() {
  const { company, mappings, vendors } = useRouteLoaderData<typeof loader>(
    "modules/company/routes/companies.$id"
  )!;
  const actionData = useActionData<typeof action>() as any;
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
    isConsignee: boolean;
    isSupplier: boolean;
    isInactive: boolean;
    defaultMarginOverride?: string | number | null;
    priceMultiplier?: string | number;
    stockLocationId?: number | null;
    invoiceBillUpon?: string | null;
    invoicePercentOnCut?: number | string | null;
    invoicePercentOnOrder?: number | string | null;
    defaultLeadTimeDays?: number | string | null;
  }>({
    defaultValues: {
      id: company.id,
      name: company.name || "",
      notes: company.notes || "",
      isCarrier: !!company.isCarrier,
      isCustomer: !!company.isCustomer,
      isConsignee: !!company.isConsignee,
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
      invoiceBillUpon: (company as any).invoiceBillUpon || null,
      invoicePercentOnCut:
        (company as any).invoicePercentOnCut != null
          ? Number((company as any).invoicePercentOnCut)
          : null,
      invoicePercentOnOrder:
        (company as any).invoicePercentOnOrder != null
          ? Number((company as any).invoicePercentOnOrder)
          : null,
      defaultLeadTimeDays:
        (company as any).defaultLeadTimeDays != null
          ? Number((company as any).defaultLeadTimeDays)
          : null,
    },
  });

  // console.log("!! Company form values", form.getValues(), form.formState.defaultValues);

  // Reset form when loader data changes (after save or record navigation)
  useEffect(() => {
    const next = {
      id: company.id,
      name: company.name || "",
      notes: company.notes || "",
      isCarrier: !!company.isCarrier,
      isCustomer: !!company.isCustomer,
      isConsignee: !!company.isConsignee,
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
      invoiceBillUpon: (company as any).invoiceBillUpon || null,
      invoicePercentOnCut:
        (company as any).invoicePercentOnCut != null
          ? Number((company as any).invoicePercentOnCut)
          : null,
      invoicePercentOnOrder:
        (company as any).invoicePercentOnOrder != null
          ? Number((company as any).invoicePercentOnOrder)
          : null,
      defaultLeadTimeDays:
        (company as any).defaultLeadTimeDays != null
          ? Number((company as any).defaultLeadTimeDays)
          : null,
    };

    form.reset(next, { keepDirty: false });
  }, [company.id, company.updatedAt]); // narrow deps to avoid loops

  // Wire this form into the global Save/Cancel header via GlobalFormProvider in root
  type FormValues = {
    name: string;
    notes: string;
    isCarrier: boolean;
    isCustomer: boolean;
    isConsignee: boolean;
    isSupplier: boolean;
    isInactive: boolean;
    defaultMarginOverride?: string | number | null;
    priceMultiplier?: string | number | null;
    stockLocationId?: number | null;
    invoiceBillUpon?: string | null;
    invoicePercentOnCut?: number | string | null;
    invoicePercentOnOrder?: number | string | null;
    defaultLeadTimeDays?: number | string | null;
  };
  const save = (values: FormValues) => {
    const fd = new FormData();
    fd.set("_intent", "update");
    fd.set("name", values.name ?? "");
    if (values.notes) fd.set("notes", values.notes);
    if (values.isCarrier) fd.set("isCarrier", "on");
    if (values.isCustomer) fd.set("isCustomer", "on");
    if (values.isConsignee) fd.set("isConsignee", "on");
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
    if (values.invoiceBillUpon)
      fd.set("invoiceBillUpon", String(values.invoiceBillUpon));
    if (
      values.invoicePercentOnCut != null &&
      String(values.invoicePercentOnCut) !== ""
    )
      fd.set("invoicePercentOnCut", String(values.invoicePercentOnCut));
    if (
      values.invoicePercentOnOrder != null &&
      String(values.invoicePercentOnOrder) !== ""
    )
      fd.set("invoicePercentOnOrder", String(values.invoicePercentOnOrder));
    if (
      Object.prototype.hasOwnProperty.call(values, "defaultLeadTimeDays")
    ) {
      const raw: any = (values as any).defaultLeadTimeDays;
      fd.set(
        "defaultLeadTimeDays",
        raw === undefined || raw === null || raw === "" ? "" : String(raw)
      );
    }
    submit(fd, { method: "post" });
  };

  useInitGlobalFormContext(form as any, save, () => form.reset());
  const defaultAddress = (company as any).defaultAddress;
  const addresses = (company as any).addresses || [];
  const contacts = (company as any).contacts || [];
  const addressOptions = addresses.map((addr: any) => {
    const lines = formatAddressLines(addr);
    const base = lines[0] || `Address ${addr.id}`;
    const tail = lines.slice(1).join(", ");
    return { value: String(addr.id), label: tail ? `${base} — ${tail}` : base };
  });
  const addressById = new Map(addresses.map((addr: any) => [addr.id, addr]));
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any>(null);
  const addressForm = useForm({
    defaultValues: {
      name: "",
      addressLine1: "",
      addressLine2: "",
      addressLine3: "",
      addressTownCity: "",
      addressCountyState: "",
      addressZipPostCode: "",
      addressCountry: "",
    },
  });
  useEffect(() => {
    if (!editingAddress) {
      addressForm.reset({
        name: "",
        addressLine1: "",
        addressLine2: "",
        addressLine3: "",
        addressTownCity: "",
        addressCountyState: "",
        addressZipPostCode: "",
        addressCountry: "",
      });
      return;
    }
    addressForm.reset({
      name: editingAddress.name || "",
      addressLine1: editingAddress.addressLine1 || "",
      addressLine2: editingAddress.addressLine2 || "",
      addressLine3: editingAddress.addressLine3 || "",
      addressTownCity: editingAddress.addressTownCity || "",
      addressCountyState: editingAddress.addressCountyState || "",
      addressZipPostCode: editingAddress.addressZipPostCode || "",
      addressCountry: editingAddress.addressCountry || "",
    });
  }, [editingAddress, addressForm]);
  const submitAddress = (values: any) => {
    const fd = new FormData();
    fd.set(
      "_intent",
      editingAddress ? "companyAddress.update" : "companyAddress.create"
    );
    if (editingAddress?.id) fd.set("addressId", String(editingAddress.id));
    fd.set("name", values.name || "");
    fd.set("addressLine1", values.addressLine1 || "");
    fd.set("addressLine2", values.addressLine2 || "");
    fd.set("addressLine3", values.addressLine3 || "");
    fd.set("addressTownCity", values.addressTownCity || "");
    fd.set("addressCountyState", values.addressCountyState || "");
    fd.set("addressZipPostCode", values.addressZipPostCode || "");
    fd.set("addressCountry", values.addressCountry || "");
    submit(fd, { method: "post" });
    setAddressModalOpen(false);
  };
  const handleDeleteAddress = (addressId: number) => {
    const fd = new FormData();
    fd.set("_intent", "companyAddress.delete");
    fd.set("addressId", String(addressId));
    submit(fd, { method: "post" });
  };
  const handleSetDefaultAddress = (addressId: number | null) => {
    const fd = new FormData();
    fd.set("_intent", "companyAddress.setDefault");
    fd.set("addressId", addressId == null ? "" : String(addressId));
    submit(fd, { method: "post" });
  };
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        {(() => {
          const appendHref = useFindHrefAppender();
          const saved = getSavedIndexSearch("/companies");
          const hrefCompanies = saved
            ? `/companies${saved}`
            : appendHref("/companies");
          return (
            <BreadcrumbSet
              breadcrumbs={[
                { label: "Companies", href: hrefCompanies },
                { label: company.name, href: `#` },
              ]}
            />
          );
        })()}
      </Group>

      <CompanyDetailForm mode="edit" form={form as any} company={company} />

      {actionData?.error ? <Text c="red">{actionData.error}</Text> : null}

      <Stack gap="xs">
        <Title order={4}>Default Address</Title>
        <AddressPickerField
          label="Default Address"
          value={company.defaultAddressId ?? null}
          options={addressOptions}
          previewAddress={addressById.get(company.defaultAddressId) ?? null}
          hint="No default address."
          onChange={(nextId) => handleSetDefaultAddress(nextId)}
        />
      </Stack>

      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Title order={4}>Addresses</Title>
          <Button
            variant="light"
            onClick={() => {
              setEditingAddress(null);
              setAddressModalOpen(true);
            }}
          >
            Add Address
          </Button>
        </Group>
        {addresses.length ? (
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Preview</Table.Th>
                <Table.Th>Default</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {addresses.map((addr: any) => {
                const lines = formatAddressLines(addr);
                const isDefault = company.defaultAddressId === addr.id;
                return (
                  <Table.Tr key={addr.id}>
                    <Table.Td>{addr.id}</Table.Td>
                    <Table.Td>{addr.name || ""}</Table.Td>
                    <Table.Td>{lines.join(", ")}</Table.Td>
                    <Table.Td>{isDefault ? "Default" : ""}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => {
                            setEditingAddress(addr);
                            setAddressModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          onClick={() => handleDeleteAddress(addr.id)}
                        >
                          Delete
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        ) : (
          <Text c="dimmed">No addresses yet.</Text>
        )}
      </Stack>

      <Stack gap="xs">
        <Title order={4}>Contacts</Title>
        {contacts.length ? (
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Phone</Table.Th>
                <Table.Th>Default Address</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {contacts.map((contact: any) => {
                const name =
                  [contact.firstName, contact.lastName]
                    .filter(Boolean)
                    .join(" ") || `Contact #${contact.id}`;
                return (
                  <Table.Tr key={contact.id}>
                    <Table.Td>{contact.id}</Table.Td>
                    <Table.Td>
                      <Link to={`/contacts/${contact.id}`}>{name}</Link>
                    </Table.Td>
                    <Table.Td>{contact.email || ""}</Table.Td>
                    <Table.Td>
                      {contact.phoneDirect || contact.phoneMobile || ""}
                    </Table.Td>
                    <Table.Td>
                      {contact.defaultAddressId != null
                        ? `Address ${contact.defaultAddressId}`
                        : ""}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        ) : (
          <Text c="dimmed">No contacts linked to this company.</Text>
        )}
      </Stack>

      <Modal
        opened={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        title={editingAddress ? "Edit Address" : "Add Address"}
      >
        <Stack gap="sm">
          <TextInput
            label="Name"
            {...addressForm.register("name")}
          />
          <TextInput
            label="Address Line 1"
            {...addressForm.register("addressLine1")}
          />
          <TextInput
            label="Address Line 2"
            {...addressForm.register("addressLine2")}
          />
          <TextInput
            label="Address Line 3"
            {...addressForm.register("addressLine3")}
          />
          <Group grow>
            <TextInput
              label="City"
              {...addressForm.register("addressTownCity")}
            />
            <TextInput
              label="County/State"
              {...addressForm.register("addressCountyState")}
            />
          </Group>
          <Group grow>
            <TextInput
              label="Postal Code"
              {...addressForm.register("addressZipPostCode")}
            />
            <TextInput
              label="Country"
              {...addressForm.register("addressCountry")}
            />
          </Group>
          <Group justify="end">
            <Button
              variant="default"
              onClick={() => setAddressModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={addressForm.handleSubmit(submitAddress)}>
              {editingAddress ? "Save" : "Create"}
            </Button>
          </Group>
        </Stack>
      </Modal>

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

export default function CompanyDetailLayout() {
  return <Outlet />;
}
