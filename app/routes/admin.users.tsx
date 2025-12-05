import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Badge,
  Button,
  Card,
  Group,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import type { UserLevel } from "@prisma/client";
import bcrypt from "bcryptjs";
import { requireAdminUser } from "~/utils/auth.server";
import { prisma } from "~/utils/prisma.server";

type LoaderData = {
  users: {
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    userLevel: UserLevel;
    isActive: boolean;
  }[];
  currentUserId: number;
};

const USER_LEVEL_OPTIONS: { value: UserLevel; label: string }[] = [
  { value: "Admin", label: "Admin" },
  { value: "Manager", label: "Manager" },
  { value: "RegularJoe", label: "Regular Joe" },
];

function parseUserLevel(
  raw: FormDataEntryValue | null | undefined
): UserLevel | null {
  if (!raw) return null;
  const value = String(raw);
  return USER_LEVEL_OPTIONS.find((opt) => opt.value === value)?.value ?? null;
}

function buildFullName(firstName?: string | null, lastName?: string | null) {
  const first = firstName?.trim() || "";
  const last = lastName?.trim() || "";
  const combined = [first, last].filter(Boolean).join(" ");
  return combined || null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdminUser(request);
  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      userLevel: true,
      isActive: true,
    },
  });
  return json<LoaderData>({ users, currentUserId: admin.id });
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdminUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");

  if (intent === "create") {
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const firstName = String(form.get("firstName") || "").trim() || null;
    const lastName = String(form.get("lastName") || "").trim() || null;
    const userLevel = parseUserLevel(form.get("userLevel"));
    if (!email || !password || !userLevel) {
      return json(
        { error: "Email, password, and user level are required." },
        { status: 400 }
      );
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return json({ error: "A user with that email already exists." }, { status: 400 });
    }
    const hash = await bcrypt.hash(password, 12);
    const name = buildFullName(firstName, lastName);
    await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        userLevel,
        firstName,
        lastName,
        name,
      },
    });
    return redirect("/admin/users");
  }

  const id = Number(form.get("id"));
  if (!Number.isFinite(id)) {
    return json({ error: "A valid user id is required." }, { status: 400 });
  }

  if (intent === "update") {
    const firstName = String(form.get("firstName") || "").trim() || null;
    const lastName = String(form.get("lastName") || "").trim() || null;
    const userLevel = parseUserLevel(form.get("userLevel"));
    if (!userLevel) {
      return json({ error: "Choose a user level." }, { status: 400 });
    }
    if (id === admin.id && userLevel !== "Admin") {
      return json(
        { error: "You cannot remove your own Admin access." },
        { status: 400 }
      );
    }
    await prisma.user.update({
      where: { id },
      data: {
        firstName,
        lastName,
        userLevel,
        name: buildFullName(firstName, lastName),
      },
    });
    return redirect("/admin/users");
  }

  if (intent === "suspend") {
    if (id === admin.id) {
      return json({ error: "You cannot suspend your own account." }, { status: 400 });
    }
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    return redirect("/admin/users");
  }

  if (intent === "activate") {
    await prisma.user.update({ where: { id }, data: { isActive: true } });
    return redirect("/admin/users");
  }

  if (intent === "delete") {
    if (id === admin.id) {
      return json({ error: "You cannot delete your own account." }, { status: 400 });
    }
    await prisma.user.delete({ where: { id } });
    return redirect("/admin/users");
  }

  return json({ error: "Unknown action." }, { status: 400 });
}

export default function AdminUsersPage() {
  const { users, currentUserId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>Users</Title>
      </Group>
      {actionData && "error" in actionData && actionData.error ? (
        <Text c="red">{actionData.error}</Text>
      ) : null}

      <Card withBorder>
        <Card.Section inheritPadding py="xs">
          <Title order={4}>Add User</Title>
        </Card.Section>
        <Form method="post">
          <input type="hidden" name="_intent" value="create" />
          <Stack mt="sm" gap="sm">
            <Group gap="sm" wrap="wrap">
              <TextInput name="firstName" label="First name" placeholder="Jane" />
              <TextInput name="lastName" label="Last name" placeholder="Doe" />
              <TextInput
                name="email"
                label="Email"
                placeholder="jane@example.com"
                required
                type="email"
              />
              <PasswordInput
                name="password"
                label="Password"
                placeholder="Enter a password"
                required
              />
              <Select
                name="userLevel"
                label="User level"
                data={USER_LEVEL_OPTIONS}
                defaultValue="RegularJoe"
                required
                withinPortal
              />
              <Button type="submit" loading={busy}>
                Create
              </Button>
            </Group>
          </Stack>
        </Form>
      </Card>

      <Card withBorder>
        <Card.Section inheritPadding py="xs">
          <Title order={4}>Existing Users</Title>
        </Card.Section>
        <Table striped highlightOnHover verticalSpacing="sm" mt="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>User</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((user) => (
              <Table.Tr key={user.id}>
                <Table.Td>
                  <Form method="post">
                    <input type="hidden" name="_intent" value="update" />
                    <input type="hidden" name="id" value={user.id} />
                    <Stack gap={6}>
                      <Group gap="xs" wrap="wrap">
                        <TextInput
                          name="firstName"
                          placeholder="First"
                          defaultValue={user.firstName ?? ""}
                          size="xs"
                        />
                        <TextInput
                          name="lastName"
                          placeholder="Last"
                          defaultValue={user.lastName ?? ""}
                          size="xs"
                        />
                        <Select
                          name="userLevel"
                          data={USER_LEVEL_OPTIONS}
                          defaultValue={user.userLevel}
                          size="xs"
                          withinPortal
                        />
                        <Button type="submit" size="xs" variant="light" loading={busy}>
                          Save
                        </Button>
                      </Group>
                      <Text size="xs" c="dimmed">
                        ID {user.id}
                      </Text>
                    </Stack>
                  </Form>
                </Table.Td>
                <Table.Td>
                  <Stack gap={4}>
                    <Text fw={600}>{user.email}</Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Badge color={user.isActive ? "green" : "yellow"}>
                    {user.isActive ? "Active" : "Suspended"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Form method="post">
                      <input
                        type="hidden"
                        name="_intent"
                        value={user.isActive ? "suspend" : "activate"}
                      />
                      <input type="hidden" name="id" value={user.id} />
                      <Button
                        type="submit"
                        size="xs"
                        variant="subtle"
                        color={user.isActive ? "orange" : "green"}
                        loading={busy}
                        disabled={user.id === currentUserId && user.isActive}
                      >
                        {user.isActive ? "Suspend" : "Activate"}
                      </Button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="_intent" value="delete" />
                      <input type="hidden" name="id" value={user.id} />
                      <Button
                        type="submit"
                        size="xs"
                        variant="light"
                        color="red"
                        loading={busy}
                        disabled={user.id === currentUserId}
                      >
                        Delete
                      </Button>
                    </Form>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {!users.length && (
          <Text c="dimmed" p="md">
            No users yet.
          </Text>
        )}
      </Card>
    </Stack>
  );
}
