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
  useNavigate,
  useSubmit,
} from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import {
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { prisma } from "~/utils/prisma.server";
import { formatAddressLines } from "~/utils/addressFormat";
import type { AddressInput } from "~/modules/address/services/addresses.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.address ? `Address ${data.address.id}` : "Address" },
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

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid address id", { status: 400 });

  const address = await prisma.address.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true, defaultAddressId: true } },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          defaultAddressId: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!address) return redirect("/addresses");

  const [
    companyDefaults,
    contactDefaults,
    jobs,
    assemblies,
    shipments,
  ] = await Promise.all([
    prisma.company.findMany({
      where: { defaultAddressId: id },
      select: { id: true, name: true },
    }),
    prisma.contact.findMany({
      where: { defaultAddressId: id },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.job.findMany({
      where: { shipToAddressId: id },
      select: { id: true, name: true, company: { select: { id: true, name: true } } },
    }),
    prisma.assembly.findMany({
      where: { shipToAddressIdOverride: id },
      select: {
        id: true,
        name: true,
        job: { select: { id: true, name: true } },
      },
    }),
    prisma.shipment.findMany({
      where: { addressIdShip: id },
      select: {
        id: true,
        trackingNo: true,
        companyIdReceiver: true,
        contactIdReceiver: true,
        createdAt: true,
      },
    }),
  ]);

  return json({
    address,
    usedBy: {
      companyDefaults,
      contactDefaults,
      jobs,
      assemblies,
      shipments,
    },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return redirect("/addresses");
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");

  if (intent === "address.update") {
    const data = readAddressInput(form);
    await prisma.address.update({ where: { id }, data });
    return redirect(`/addresses/${id}`);
  }

  if (intent === "address.delete") {
    const address = await prisma.address.findUnique({
      where: { id },
      select: { id: true, companyId: true, contactId: true },
    });
    if (!address) return redirect("/addresses");

    await prisma.$transaction(async (tx) => {
      await tx.company.updateMany({
        where: { defaultAddressId: id },
        data: { defaultAddressId: null },
      });
      await tx.contact.updateMany({
        where: { defaultAddressId: id },
        data: { defaultAddressId: null },
      });
      await tx.job.updateMany({
        where: { shipToAddressId: id },
        data: { shipToAddressId: null },
      });
      await tx.assembly.updateMany({
        where: { shipToAddressIdOverride: id },
        data: { shipToAddressIdOverride: null },
      });
      await tx.shipment.updateMany({
        where: { addressIdShip: id },
        data: {
          addressIdShip: null,
          addressName: null,
          addressCountry: null,
          addressCountyState: null,
          addressLine1: null,
          addressLine2: null,
          addressLine3: null,
          addressTownCity: null,
          addressZipPostCode: null,
        },
      });
      await tx.address.delete({ where: { id } });
    });

    if (address.companyId) return redirect(`/companies/${address.companyId}`);
    if (address.contactId) return redirect(`/contacts/${address.contactId}`);
    return redirect("/addresses");
  }

  return redirect(`/addresses/${id}`);
}

export default function AddressDetailRoute() {
  const { address, usedBy } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as any;
  const submit = useSubmit();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const deletePhrase = "DELETE";

  const form = useForm({
    defaultValues: {
      name: address.name || "",
      addressLine1: address.addressLine1 || "",
      addressLine2: address.addressLine2 || "",
      addressLine3: address.addressLine3 || "",
      addressTownCity: address.addressTownCity || "",
      addressCountyState: address.addressCountyState || "",
      addressZipPostCode: address.addressZipPostCode || "",
      addressCountry: address.addressCountry || "",
    },
  });

  useEffect(() => {
    form.reset({
      name: address.name || "",
      addressLine1: address.addressLine1 || "",
      addressLine2: address.addressLine2 || "",
      addressLine3: address.addressLine3 || "",
      addressTownCity: address.addressTownCity || "",
      addressCountyState: address.addressCountyState || "",
      addressZipPostCode: address.addressZipPostCode || "",
      addressCountry: address.addressCountry || "",
    });
  }, [address, form]);

  const save = (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "address.update");
    fd.set("name", values.name || "");
    fd.set("addressLine1", values.addressLine1 || "");
    fd.set("addressLine2", values.addressLine2 || "");
    fd.set("addressLine3", values.addressLine3 || "");
    fd.set("addressTownCity", values.addressTownCity || "");
    fd.set("addressCountyState", values.addressCountyState || "");
    fd.set("addressZipPostCode", values.addressZipPostCode || "");
    fd.set("addressCountry", values.addressCountry || "");
    submit(fd, { method: "post" });
  };

  const ownerLabel = address.company
    ? {
        label: address.company.name || `Company ${address.company.id}`,
        to: `/companies/${address.company.id}`,
      }
    : address.contact
      ? {
          label:
            [address.contact.firstName, address.contact.lastName]
              .filter(Boolean)
              .join(" ") || `Contact ${address.contact.id}`,
          to: `/contacts/${address.contact.id}`,
        }
      : null;

  const addressLines = useMemo(() => formatAddressLines(address), [address]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Addresses", href: "/addresses" },
            { label: `Address ${address.id}`, href: `/addresses/${address.id}` },
          ]}
        />
        <Button variant="light" onClick={() => navigate(-1)}>
          Back
        </Button>
      </Group>

      <Group justify="space-between" align="center">
        <Title order={2}>Address {address.id}</Title>
        {ownerLabel ? <Link to={ownerLabel.to}>{ownerLabel.label}</Link> : null}
      </Group>

      {actionData?.error ? <Text c="red">{actionData.error}</Text> : null}

      <Stack gap="sm">
        <Group grow>
          <TextInput label="Name" {...form.register("name")} />
          <TextInput label="Address Line 1" {...form.register("addressLine1")} />
        </Group>
        <Group grow>
          <TextInput label="Address Line 2" {...form.register("addressLine2")} />
          <TextInput label="Address Line 3" {...form.register("addressLine3")} />
        </Group>
        <Group grow>
          <TextInput label="City" {...form.register("addressTownCity")} />
          <TextInput label="County/State" {...form.register("addressCountyState")} />
        </Group>
        <Group grow>
          <TextInput label="Postal Code" {...form.register("addressZipPostCode")} />
          <TextInput label="Country" {...form.register("addressCountry")} />
        </Group>
        <Group justify="end">
          <Button onClick={form.handleSubmit(save)}>Save</Button>
        </Group>
      </Stack>

      <Stack gap="xs">
        <Title order={4}>Preview</Title>
        {addressLines.length ? (
          <Stack gap={2}>
            {addressLines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </Stack>
        ) : (
          <Text c="dimmed">No address details.</Text>
        )}
      </Stack>

      <Stack gap="xs">
        <Title order={4}>Used By</Title>
        <Stack gap="xs">
          <Text fw={600}>Companies (default)</Text>
          {usedBy.companyDefaults.length ? (
            <Table withTableBorder withColumnBorders>
              <Table.Tbody>
                {usedBy.companyDefaults.map((c: any) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>{c.id}</Table.Td>
                    <Table.Td>
                      <Link to={`/companies/${c.id}`}>{c.name || `Company ${c.id}`}</Link>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed">None.</Text>
          )}
        </Stack>
        <Stack gap="xs">
          <Text fw={600}>Contacts (default)</Text>
          {usedBy.contactDefaults.length ? (
            <Table withTableBorder withColumnBorders>
              <Table.Tbody>
                {usedBy.contactDefaults.map((c: any) => {
                  const name =
                    [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                    `Contact ${c.id}`;
                  return (
                    <Table.Tr key={c.id}>
                      <Table.Td>{c.id}</Table.Td>
                      <Table.Td>
                        <Link to={`/contacts/${c.id}`}>{name}</Link>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed">None.</Text>
          )}
        </Stack>
        <Stack gap="xs">
          <Text fw={600}>Jobs (ship-to)</Text>
          {usedBy.jobs.length ? (
            <Table withTableBorder withColumnBorders>
              <Table.Tbody>
                {usedBy.jobs.map((j: any) => (
                  <Table.Tr key={j.id}>
                    <Table.Td>{j.id}</Table.Td>
                    <Table.Td>
                      <Link to={`/jobs/${j.id}`}>{j.name || `Job ${j.id}`}</Link>
                    </Table.Td>
                    <Table.Td>{j.company?.name || ""}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed">None.</Text>
          )}
        </Stack>
        <Stack gap="xs">
          <Text fw={600}>Assemblies (override)</Text>
          {usedBy.assemblies.length ? (
            <Table withTableBorder withColumnBorders>
              <Table.Tbody>
                {usedBy.assemblies.map((a: any) => (
                  <Table.Tr key={a.id}>
                    <Table.Td>{a.id}</Table.Td>
                    <Table.Td>
                      <Link to={`/jobs/${a.job?.id}/assembly/${a.id}`}>
                        {a.name || `Assembly ${a.id}`}
                      </Link>
                    </Table.Td>
                    <Table.Td>{a.job?.name || ""}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed">None.</Text>
          )}
        </Stack>
        <Stack gap="xs">
          <Text fw={600}>Shipments</Text>
          {usedBy.shipments.length ? (
            <Table withTableBorder withColumnBorders>
              <Table.Tbody>
                {usedBy.shipments.map((s: any) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>{s.id}</Table.Td>
                    <Table.Td>
                      <Link to={`/shipments/${s.id}`}>
                        {s.trackingNo || `Shipment ${s.id}`}
                      </Link>
                    </Table.Td>
                    <Table.Td>{s.companyIdReceiver || ""}</Table.Td>
                    <Table.Td>{s.contactIdReceiver || ""}</Table.Td>
                    <Table.Td>
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ""}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed">None.</Text>
          )}
        </Stack>
      </Stack>

      <Stack gap="xs">
        <Title order={4}>Danger Zone</Title>
        <Button color="red" onClick={() => setDeleteOpen(true)}>
          Delete Address
        </Button>
      </Stack>

      <Modal opened={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Address">
        <Stack gap="sm">
          <Text>
            This will remove the address and clear any defaults or ship-to references.
          </Text>
          <TextInput
            label={`Type ${deletePhrase} to confirm`}
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.currentTarget.value)}
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={deleteConfirm !== deletePhrase}
              onClick={() => {
                const fd = new FormData();
                fd.set("_intent", "address.delete");
                submit(fd, { method: "post" });
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
