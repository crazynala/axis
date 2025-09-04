import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useNavigation,
  useLoaderData,
} from "@remix-run/react";
import {
  Button,
  Card,
  Stack,
  TextInput,
  Title,
  Anchor,
  Text,
} from "@mantine/core";
import { createUserSession, getUserId, login } from "../utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  if (userId) return redirect("/");
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/";
  return json({ redirectTo });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") || "");
  const redirectTo = String(form.get("redirectTo") || "/");
  if (!email || !password)
    return json({ error: "Email and password required" }, { status: 400 });
  const user = await login(email, password);
  if (!user) return json({ error: "Invalid credentials" }, { status: 400 });
  return createUserSession(user.id, redirectTo);
}

export default function Login() {
  const data = useActionData<typeof action>();
  const { redirectTo } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <Stack align="center" mt={80}>
      <Card withBorder maw={420} w="100%">
        <Title order={3} mb="md">
          Sign in
        </Title>
        {data?.error ? (
          <Text c="red" mb="sm">
            {data.error}
          </Text>
        ) : null}
        <Form method="post">
          <Stack>
            <input type="hidden" name="redirectTo" value={redirectTo || "/"} />
            <TextInput
              name="email"
              label="Email"
              placeholder="you@example.com"
              required
            />
            <TextInput
              name="password"
              label="Password"
              type="password"
              required
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </Stack>
        </Form>
        <Anchor component={Link} to="/forgot" mt="sm">
          Forgot password?
        </Anchor>
      </Card>
    </Stack>
  );
}
