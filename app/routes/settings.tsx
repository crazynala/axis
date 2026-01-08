import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteLoaderData,
  useRevalidator,
} from "@remix-run/react";
import {
  Button,
  Group,
  SegmentedControl,
  Stack,
  Title,
  Text,
  TextInput,
  PasswordInput,
} from "@mantine/core";
import { requireUserId } from "../utils/auth.server";
import { prisma } from "../utils/prisma.server";
import bcrypt from "bcryptjs";
import { useState } from "react";
import type { loader as rootLoader } from "~/root";

export async function loader({ request }: LoaderFunctionArgs) {
  const uid = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: {
      name: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  });
  const name =
    user?.name ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "";
  return json({
    name,
    email: user?.email || "",
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const uid = await requireUserId(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  if (intent === "profile.save") {
    const name = String(form.get("name") || "").trim();
    await prisma.user.update({
      where: { id: uid },
      data: { name: name || null },
    });
    return json({ ok: true, profileSaved: true });
  }
  if (intent === "password.change") {
    const currentPassword = String(form.get("currentPassword") || "");
    const nextPassword = String(form.get("newPassword") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    if (!currentPassword || !nextPassword || !confirmPassword) {
      return json(
        { error: "All password fields are required." },
        { status: 400 }
      );
    }
    if (nextPassword !== confirmPassword) {
      return json({ error: "New passwords do not match." }, { status: 400 });
    }
    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash) {
      return json({ error: "Password update unavailable." }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return json({ error: "Current password is incorrect." }, { status: 400 });
    }
    const hash = await bcrypt.hash(nextPassword, 12);
    await prisma.user.update({
      where: { id: uid },
      data: { passwordHash: hash },
    });
    return json({ ok: true, passwordChanged: true });
  }
  return json({ error: "Unknown intent." }, { status: 400 });
}

export const meta: MetaFunction = () => [{ title: "Account" }];

export default function Settings() {
  const { name, email } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const revalidator = useRevalidator();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [profileName, setProfileName] = useState(name);
  const profileDirty = profileName.trim() !== name.trim();
  const [colorScheme, setColorScheme] = useState<"light" | "dark">(
    (rootData?.colorScheme as "light" | "dark" | undefined) || "light"
  );
  const [schemeError, setSchemeError] = useState<string | null>(null);
  const [schemeSaving, setSchemeSaving] = useState(false);

  const handleSchemeChange = async (next: "light" | "dark") => {
    setColorScheme(next);
    setSchemeSaving(true);
    setSchemeError(null);
    try {
      const res = await fetch("/api.color-scheme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorScheme: next }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Unable to update theme.");
      }
      revalidator.revalidate();
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Unable to update theme.";
      setSchemeError(message);
      setColorScheme(
        (rootData?.colorScheme as "light" | "dark" | undefined) || "light"
      );
    } finally {
      setSchemeSaving(false);
    }
  };
  return (
    <Stack align="center" mt={40} w="100%">
      <Stack maw={560} w="100%" gap="xl">
        <Title order={2}>Account</Title>
        {data && (data as any).error ? (
          <Text c="red">{(data as any).error}</Text>
        ) : null}
        {data && (data as any).profileSaved ? (
          <Text c="green">Profile saved.</Text>
        ) : null}
        {data && (data as any).passwordChanged ? (
          <Text c="green">Password updated.</Text>
        ) : null}
        <Stack gap="sm">
          <Title order={4}>Profile</Title>
          <Form method="post">
            <Stack>
              <TextInput
                name="name"
                label="Name"
                value={profileName}
                onChange={(e) => setProfileName(e.currentTarget.value)}
              />
              <TextInput
                name="email"
                label="Email"
                value={email}
                readOnly
              />
              <Button
                type="submit"
                name="intent"
                value="profile.save"
                disabled={busy || !profileDirty}
                variant="default"
              >
                {busy ? "Saving..." : "Save"}
              </Button>
            </Stack>
          </Form>
        </Stack>
        <Stack gap="sm">
          <Title order={4}>Appearance</Title>
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text>Theme</Text>
              <SegmentedControl
                value={colorScheme}
                onChange={(value) =>
                  handleSchemeChange(value as "light" | "dark")
                }
                data={[
                  { label: "Light", value: "light" },
                  { label: "Dark", value: "dark" },
                ]}
                disabled={schemeSaving}
              />
            </Group>
            {schemeError ? <Text c="red">{schemeError}</Text> : null}
          </Stack>
        </Stack>
        <Stack gap="sm">
          <Title order={4}>Security</Title>
          <Form method="post">
            <Stack>
              <PasswordInput
                name="currentPassword"
                label="Current password"
              />
              <PasswordInput name="newPassword" label="New password" />
              <PasswordInput
                name="confirmPassword"
                label="Confirm password"
              />
              <Button
                type="submit"
                name="intent"
                value="password.change"
                disabled={busy}
                variant="default"
              >
                {busy ? "Saving..." : "Update password"}
              </Button>
            </Stack>
          </Form>
        </Stack>
        <Stack gap="sm">
          <Title order={4}>Session</Title>
          <Form method="post" action="/logout">
            <Button
              type="submit"
              variant="default"
              color="red"
              disabled={busy}
            >
              Log out
            </Button>
          </Form>
        </Stack>
      </Stack>
    </Stack>
  );
}
