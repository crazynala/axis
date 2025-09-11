import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Button,
  Card,
  NumberInput,
  Stack,
  Title,
  Text,
  SegmentedControl,
  Group,
} from "@mantine/core";
import { requireUserId } from "../utils/auth.server";
import { prisma } from "../utils/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const uid = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { recordsPerPage: true, colorScheme: true },
  });
  return json({
    recordsPerPage: user?.recordsPerPage ?? 25,
    colorScheme: (user?.colorScheme as "light" | "dark" | undefined) || "light",
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const uid = await requireUserId(request);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "update-color-scheme") {
    const scheme = form.get("colorScheme");
    if (scheme === "light" || scheme === "dark") {
      await prisma.user.update({
        where: { id: uid },
        data: { colorScheme: scheme },
      });
      return json({ ok: true, colorScheme: scheme });
    }
    return json({ error: "Invalid color scheme" }, { status: 400 });
  }
  // recordsPerPage update (default path)
  const rpp = Number(form.get("recordsPerPage"));
  if (!Number.isFinite(rpp) || rpp <= 0) {
    return json({ error: "Enter a positive number" }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: uid },
    data: { recordsPerPage: Math.floor(rpp) },
  });
  return json({ ok: true });
}

export default function Settings() {
  const { recordsPerPage, colorScheme } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <Stack align="center" mt={40}>
      <Card withBorder maw={520} w="100%">
        <Title order={3} mb="md">
          Settings
        </Title>
        {data && (data as any).error ? (
          <Text c="red">{(data as any).error}</Text>
        ) : null}
        {data && (data as any).ok && !(data as any).error ? (
          <Text c="green">Saved.</Text>
        ) : null}
        <Stack gap="lg">
          <Form method="post">
            <Stack>
              <NumberInput
                name="recordsPerPage"
                label="Records per page"
                defaultValue={recordsPerPage}
                min={1}
                step={1}
              />
              <Button
                type="submit"
                disabled={busy}
                name="intent"
                value="update-rpp"
              >
                {busy ? "Saving..." : "Save"}
              </Button>
            </Stack>
          </Form>
          <Form method="post">
            <Stack>
              <Group gap="sm">
                <SegmentedControl
                  name="colorScheme"
                  defaultValue={colorScheme}
                  data={[
                    { label: "Light", value: "light" },
                    { label: "Dark", value: "dark" },
                  ]}
                />
              </Group>
              <Button
                type="submit"
                name="intent"
                value="update-color-scheme"
                disabled={busy}
              >
                {busy ? "Saving..." : "Update Theme"}
              </Button>
            </Stack>
          </Form>
        </Stack>
      </Card>
    </Stack>
  );
}
