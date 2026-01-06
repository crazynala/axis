import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useInitGlobalFormContext } from "@aa/timber";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { prisma } from "../utils/prisma.server";
import { useRecordContext } from "../base/record/RecordContext";
import type { AddressInput } from "~/modules/address/services/addresses.server";
import {
  createContactAddress,
  deleteContactAddress,
  setContactDefaultAddress,
  updateContactAddress,
} from "~/modules/address/services/addresses.server";
import {
  assertAddressOwnedByContact,
} from "~/utils/addressOwnership.server";
import { formatAddressLines } from "~/utils/addressFormat";
import { AddressPickerField } from "~/components/addresses/AddressPickerField";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.contact
      ? `Contact ${data.contact.firstName || ""} ${data.contact.lastName || ""}`.trim()
      : "Contact",
  },
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
  if (!id) return redirect("/contacts");
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
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
    },
  });
  if (!contact) return redirect("/contacts");
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
  return json({ contact, companies });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  if (!id) return redirect("/contacts");
  const form = await request.formData();
  const intent = form.get("_intent");

  if (
    intent === "contactAddress.create" ||
    intent === "contactAddress.update" ||
    intent === "contactAddress.delete" ||
    intent === "contactAddress.setDefault"
  ) {
    try {
      if (intent === "contactAddress.create") {
        await createContactAddress({ contactId: id, data: readAddressInput(form) });
      } else if (intent === "contactAddress.update") {
        const addressId = parseAddressId(form.get("addressId"));
        if (!addressId) {
          return json({ error: "Missing addressId" }, { status: 400 });
        }
        await updateContactAddress({
          contactId: id,
          addressId,
          data: readAddressInput(form),
        });
      } else if (intent === "contactAddress.delete") {
        const addressId = parseAddressId(form.get("addressId"));
        if (!addressId) {
          return json({ error: "Missing addressId" }, { status: 400 });
        }
        await deleteContactAddress({ contactId: id, addressId });
      } else if (intent === "contactAddress.setDefault") {
        const addressId = parseAddressId(form.get("addressId"));
        if (addressId != null) {
          const owned = await assertAddressOwnedByContact(addressId, id);
          if (!owned) {
            return json(
              { error: "Default address must belong to this contact." },
              { status: 400 }
            );
          }
        }
        await setContactDefaultAddress({ contactId: id, addressId: addressId ?? null });
      }
      return redirect(`/contacts/${id}`);
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "Request failed" },
        { status: 400 }
      );
    }
  }

  if (intent === "update") {
    const data: any = {
      firstName: (form.get("firstName") as string) || null,
      lastName: (form.get("lastName") as string) || null,
      email: (form.get("email") as string) || null,
      department: (form.get("department") as string) || null,
      title: (form.get("title") as string) || null,
      phoneDirect: (form.get("phoneDirect") as string) || null,
      phoneMobile: (form.get("phoneMobile") as string) || null,
      phoneHome: (form.get("phoneHome") as string) || null,
      position: (form.get("position") as string) || null,
      recordType: (form.get("recordType") as string) || null,
    };

    if (form.has("companyId")) {
      const raw = String(form.get("companyId") ?? "");
      if (raw === "") data.companyId = null;
      else {
        const companyId = Number(raw);
        data.companyId = Number.isFinite(companyId) ? companyId : null;
      }
    }

    let error: string | null = null;
    if (form.has("defaultAddressId")) {
      const raw = String(form.get("defaultAddressId") ?? "");
      if (raw === "") {
        data.defaultAddressId = null;
      } else {
        const addressId = Number(raw);
        if (!Number.isFinite(addressId)) {
          data.defaultAddressId = null;
          error = "Default address must belong to this contact.";
        } else {
          const owned = await assertAddressOwnedByContact(addressId, id);
          if (!owned) {
            data.defaultAddressId = null;
            error = "Default address must belong to this contact.";
          } else {
            data.defaultAddressId = addressId;
          }
        }
      }
    }

    await prisma.contact.update({ where: { id }, data });
    if (error) return json({ error }, { status: 400 });
    return redirect(`/contacts/${id}`);
  }

  return redirect(`/contacts/${id}`);
}

export default function ContactDetailRoute() {
  const { contact, companies } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const { setCurrentId } = useRecordContext();
  useEffect(() => {
    setCurrentId(contact.id, "restore");
  }, [contact.id, setCurrentId]);

  const form = useForm({
    defaultValues: {
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      email: contact.email || "",
      department: contact.department || "",
      title: contact.title || "",
      phoneDirect: contact.phoneDirect || "",
      phoneMobile: contact.phoneMobile || "",
      phoneHome: contact.phoneHome || "",
      position: contact.position || "",
      recordType: contact.recordType || "",
      companyId: contact.companyId ?? null,
      defaultAddressId: contact.defaultAddressId ?? null,
    },
  });

  const save = (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "update");
    fd.set("firstName", values.firstName ?? "");
    fd.set("lastName", values.lastName ?? "");
    fd.set("email", values.email ?? "");
    fd.set("department", values.department ?? "");
    fd.set("title", values.title ?? "");
    fd.set("phoneDirect", values.phoneDirect ?? "");
    fd.set("phoneMobile", values.phoneMobile ?? "");
    fd.set("phoneHome", values.phoneHome ?? "");
    fd.set("position", values.position ?? "");
    fd.set("recordType", values.recordType ?? "");
    fd.set(
      "companyId",
      values.companyId == null || values.companyId === ""
        ? ""
        : String(values.companyId)
    );
    fd.set(
      "defaultAddressId",
      values.defaultAddressId == null || values.defaultAddressId === ""
        ? ""
        : String(values.defaultAddressId)
    );
    submit(fd, { method: "post" });
  };

  useInitGlobalFormContext(form as any, save, () => form.reset());

  const name =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    `Contact #${contact.id}`;
  const defaultAddress = contact.defaultAddress;
  const addresses = contact.addresses || [];
  const addressOptions = (contact.addresses || []).map((addr: any) => {
    const lines = formatAddressLines(addr);
    const base = lines[0] || `Address ${addr.id}`;
    const tail = lines.slice(1).join(", ");
    return { value: String(addr.id), label: tail ? `${base} — ${tail}` : base };
  });
  const addressById = new Map(
    (contact.addresses || []).map((addr: any) => [addr.id, addr])
  );
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
      editingAddress ? "contactAddress.update" : "contactAddress.create"
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
    fd.set("_intent", "contactAddress.delete");
    fd.set("addressId", String(addressId));
    submit(fd, { method: "post" });
  };
  const handleSetDefaultAddress = (addressId: number | null) => {
    const fd = new FormData();
    fd.set("_intent", "contactAddress.setDefault");
    fd.set("addressId", addressId == null ? "" : String(addressId));
    submit(fd, { method: "post" });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Contacts", href: "/contacts" },
            { label: name, href: `/contacts/${contact.id}` },
          ]}
        />
        <Button component={Link} to={`/contacts`} variant="light">
          Back to Contacts
        </Button>
      </Group>

      <Title order={2}>{name}</Title>
      {actionData?.error && <Text c="red">{actionData.error}</Text>}

      <Stack gap="sm">
        <Group grow>
          <Controller
            name="firstName"
            control={form.control}
            render={({ field }) => (
              <TextInput {...field} label="First Name" />
            )}
          />
          <Controller
            name="lastName"
            control={form.control}
            render={({ field }) => (
              <TextInput {...field} label="Last Name" />
            )}
          />
        </Group>
        <Group grow>
          <Controller
            name="email"
            control={form.control}
            render={({ field }) => <TextInput {...field} label="Email" />}
          />
          <Controller
            name="companyId"
            control={form.control}
            render={({ field }) => (
              <Select
                {...field}
                label="Company"
                placeholder="Select company"
                data={(companies || []).map((c: any) => ({
                  value: String(c.id),
                  label: c.name || `Company ${c.id}`,
                }))}
                value={field.value != null ? String(field.value) : ""}
                onChange={(value) => field.onChange(value ? Number(value) : null)}
                clearable
              />
            )}
          />
        </Group>
        <Group grow>
          <Controller
            name="phoneDirect"
            control={form.control}
            render={({ field }) => (
              <TextInput {...field} label="Phone (Direct)" />
            )}
          />
          <Controller
            name="phoneMobile"
            control={form.control}
            render={({ field }) => (
              <TextInput {...field} label="Phone (Mobile)" />
            )}
          />
          <Controller
            name="phoneHome"
            control={form.control}
            render={({ field }) => (
              <TextInput {...field} label="Phone (Home)" />
            )}
          />
        </Group>
        <Group grow>
          <Controller
            name="department"
            control={form.control}
            render={({ field }) => (
              <TextInput {...field} label="Department" />
            )}
          />
          <Controller
            name="title"
            control={form.control}
            render={({ field }) => <TextInput {...field} label="Title" />}
          />
          <Controller
            name="position"
            control={form.control}
            render={({ field }) => <TextInput {...field} label="Position" />}
          />
        </Group>
        <Group grow>
          <Controller
            name="recordType"
            control={form.control}
            render={({ field }) => (
              <TextInput {...field} label="Record Type" />
            )}
          />
        </Group>
        <AddressPickerField
          label="Default Address"
          value={form.watch("defaultAddressId") ?? null}
          options={addressOptions}
          previewAddress={addressById.get(form.watch("defaultAddressId")) ?? null}
          hint="No default address."
          onChange={(nextId) => form.setValue("defaultAddressId", nextId)}
        />
        <Group justify="end">
          <Button onClick={form.handleSubmit(save)} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </Group>
      </Stack>

      <Stack gap="xs">
        <Title order={4}>Default Address</Title>
        {defaultAddress ? (
          <Stack gap={2}>
            {formatAddressLines(defaultAddress).map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </Stack>
        ) : (
          <Text c="dimmed">No default address.</Text>
        )}
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
                const isDefault = contact.defaultAddressId === addr.id;
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
                          variant="light"
                          onClick={() => handleSetDefaultAddress(addr.id)}
                        >
                          Set Default
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
    </Stack>
  );
}
