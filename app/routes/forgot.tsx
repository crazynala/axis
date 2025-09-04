import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import {
  Button,
  Card,
  Stack,
  Text,
  TextInput,
  Title,
  Anchor,
} from "@mantine/core";
import { getUserId, startPasswordReset } from "../utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const uid = await getUserId(request);
  return json({ loggedIn: Boolean(uid) });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") || "")
    .trim()
    .toLowerCase();
  if (!email) return json({ error: "Email required" }, { status: 400 });
  await startPasswordReset(email);
  return json({ ok: true });
}

export default function Forgot() {
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <Stack align="center" mt={80}>
      <Card withBorder maw={420} w="100%">
        <Title order={3} mb="md">
          Forgot password
        </Title>
        {data && (data as any).error ? (
          <Text c="red">{(data as any).error}</Text>
        ) : null}
        {data && (data as any).ok ? (
          <Text c="green">If the email exists, a code has been sent.</Text>
        ) : (
          <Form method="post">
            <Stack>
              <TextInput
                name="email"
                label="Email"
                placeholder="you@example.com"
                required
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send code"}
              </Button>
            </Stack>
          </Form>
        )}
        <Anchor component={Link} to="/login" mt="sm">
          Back to login
        </Anchor>
      </Card>
    </Stack>
  );
}
