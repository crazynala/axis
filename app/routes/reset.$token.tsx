import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useParams,
  useActionData,
  useNavigation,
  Form,
  Link,
} from "@remix-run/react";
import {
  Button,
  Card,
  Stack,
  Text,
  TextInput,
  Title,
  Anchor,
} from "@mantine/core";
import { completePasswordReset } from "../utils/auth.server";

export async function loader({ params }: LoaderFunctionArgs) {
  // Don't reveal anything; show form regardless
  return json({ token: params.token || "" });
}

export async function action({ params, request }: ActionFunctionArgs) {
  const token = String(params.token || "");
  const form = await request.formData();
  const otp = String(form.get("otp") || "");
  const password = String(form.get("password") || "");
  if (!otp || !password)
    return json({ error: "Code and password required" }, { status: 400 });
  const ok = await completePasswordReset(token, otp, password);
  if (!ok) return json({ error: "Invalid or expired code" }, { status: 400 });
  return json({ ok: true });
}

export default function Reset() {
  const { token } = useParams();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <Stack align="center" mt={80}>
      <Card withBorder maw={420} w="100%">
        <Title order={3} mb="md">
          Reset password
        </Title>
        {data && (data as any).error ? (
          <Text c="red">{(data as any).error}</Text>
        ) : null}
        {data && (data as any).ok ? (
          <>
            <Text c="green">Password updated. You can now sign in.</Text>
            <Anchor component={Link} to="/login" mt="sm">
              Back to login
            </Anchor>
          </>
        ) : (
          <Form method="post">
            <Stack>
              <TextInput
                name="otp"
                label="Code"
                placeholder="6-digit code"
                required
              />
              <TextInput
                name="password"
                label="New password"
                type="password"
                required
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Resetting…" : "Reset password"}
              </Button>
            </Stack>
          </Form>
        )}
      </Card>
    </Stack>
  );
}
