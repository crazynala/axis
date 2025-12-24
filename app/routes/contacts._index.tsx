import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { prisma } from "../utils/prisma.server";
import { Table, Title, Stack } from "@mantine/core";

export const meta: MetaFunction = () => [{ title: "Contacts" }];

export async function loader(_args: LoaderFunctionArgs) {
  const contacts = await prisma.contact.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: 1000,
    include: { company: { select: { id: true, name: true } } },
  });
  return json({ contacts });
}

export default function ContactsIndexRoute() {
  const { contacts } = useLoaderData<typeof loader>();
  return (
    <Stack gap="md">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Title order={2}>Contacts</Title>
        {(() => {
          const appendHref = useFindHrefAppender();
          return (
            <BreadcrumbSet
              breadcrumbs={[
                { label: "Contacts", href: appendHref("/contacts") },
              ]}
            />
          );
        })()}
      </div>
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th>Company</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Phone</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {contacts.map((c: any) => {
            const name =
              [c.firstName, c.lastName].filter(Boolean).join(" ") ||
              `Contact #${c.id}`;
            return (
              <Table.Tr key={c.id}>
                <Table.Td>{c.id}</Table.Td>
                <Table.Td>
                  <Link to={`/contacts/${c.id}`}>{name}</Link>
                </Table.Td>
                <Table.Td>{c.company?.name || ""}</Table.Td>
                <Table.Td>{c.email || ""}</Table.Td>
                <Table.Td>{c.phoneDirect || c.phoneMobile || ""}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
