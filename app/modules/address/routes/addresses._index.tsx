import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { prisma } from "~/utils/prisma.server";
import { formatAddressLines } from "~/utils/addressFormat";
import {
  Button,
  Group,
  Select,
  Stack,
  Table,
  TextInput,
  Title,
} from "@mantine/core";

export const meta: MetaFunction = () => [{ title: "Addresses" }];

type Filters = {
  ownerType: "all" | "company" | "contact";
  ownerId: string;
  q: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const ownerType =
    (url.searchParams.get("ownerType") as Filters["ownerType"]) || "all";
  const ownerIdRaw = url.searchParams.get("ownerId") || "";
  const q = url.searchParams.get("q") || "";
  const ownerId = Number(ownerIdRaw);
  const ownerIdValid = Number.isFinite(ownerId) && ownerId > 0;

  const ownerFilters: any[] = [];
  if (ownerType === "company") {
    ownerFilters.push({ companyId: ownerIdValid ? ownerId : { not: null } });
  } else if (ownerType === "contact") {
    ownerFilters.push({ contactId: ownerIdValid ? ownerId : { not: null } });
  } else if (ownerIdValid) {
    ownerFilters.push({ companyId: ownerId });
    ownerFilters.push({ contactId: ownerId });
  }

  const search = q.trim();
  const searchFilters = search
    ? [
        { name: { contains: search, mode: "insensitive" } },
        { addressLine1: { contains: search, mode: "insensitive" } },
        { addressTownCity: { contains: search, mode: "insensitive" } },
        { addressCountry: { contains: search, mode: "insensitive" } },
      ]
    : [];

  const where: any = {
    AND: [
      ownerFilters.length
        ? ownerType === "all"
          ? { OR: ownerFilters }
          : ownerFilters[0]
        : undefined,
      searchFilters.length ? { OR: searchFilters } : undefined,
    ].filter(Boolean),
  };

  const addresses = await prisma.address.findMany({
    where,
    take: 2000,
    orderBy: { id: "desc" },
    include: {
      company: { select: { id: true, name: true } },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  });

  return json({
    addresses,
    filters: { ownerType, ownerId: ownerIdRaw, q } as Filters,
  });
}

export default function AddressesIndexRoute() {
  const { addresses, filters } = useLoaderData<typeof loader>();
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Addresses</Title>
        {(() => {
          const appendHref = useFindHrefAppender();
          return (
            <BreadcrumbSet
              breadcrumbs={[{ label: "Addresses", href: appendHref("/addresses") }]}
            />
          );
        })()}
      </Group>

      <Form method="get">
        <Group align="end" wrap="wrap">
          <Select
            name="ownerType"
            label="Owner Type"
            data={[
              { value: "all", label: "All" },
              { value: "company", label: "Company" },
              { value: "contact", label: "Contact" },
            ]}
            defaultValue={filters.ownerType}
          />
          <TextInput
            name="ownerId"
            label="Owner ID"
            defaultValue={filters.ownerId}
          />
          <TextInput name="q" label="Search" defaultValue={filters.q} />
          <Button type="submit" variant="light">
            Apply
          </Button>
        </Group>
      </Form>

      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Owner</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th>Preview</Table.Th>
            <Table.Th>City</Table.Th>
            <Table.Th>Country</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {addresses.map((addr: any) => {
            const lines = formatAddressLines(addr);
            const owner = addr.company
              ? { label: addr.company.name || `Company ${addr.company.id}`, to: `/companies/${addr.company.id}` }
              : addr.contact
                ? {
                    label:
                      [addr.contact.firstName, addr.contact.lastName]
                        .filter(Boolean)
                        .join(" ") || `Contact ${addr.contact.id}`,
                    to: `/contacts/${addr.contact.id}`,
                  }
                : null;
            return (
              <Table.Tr key={addr.id}>
                <Table.Td>
                  <Link to={`/addresses/${addr.id}`}>{addr.id}</Link>
                </Table.Td>
                <Table.Td>
                  {owner ? <Link to={owner.to}>{owner.label}</Link> : ""}
                </Table.Td>
                <Table.Td>{addr.name || ""}</Table.Td>
                <Table.Td>{lines.join(", ")}</Table.Td>
                <Table.Td>{addr.addressTownCity || ""}</Table.Td>
                <Table.Td>{addr.addressCountry || ""}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
