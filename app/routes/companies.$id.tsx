import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Button,
  Checkbox,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.company?.name ? `Company ${data.company.name}` : "Company" },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) throw new Response("Not Found", { status: 404 });
  return json({ company });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "update") {
    const data = {
      name: (form.get("name") as string) || null,
      type: (form.get("type") as string) || null,
      is_active: form.get("is_active") === "on",
      notes: (form.get("notes") as string) || null,
    } as const;
    await prisma.company.update({ where: { id }, data: data as any });
    return redirect(`/companies/${id}`);
  }

  if (intent === "delete") {
    await prisma.company.delete({ where: { id } });
    return redirect("/companies");
  }

  return redirect(`/companies/${id}`);
}

export default function CompanyDetailRoute() {
  const { company } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{company.name || `Company #${company.id}`}</Title>
        <Link to="/companies">Back</Link>
      </Group>

      <Form method="post">
        <input type="hidden" name="_intent" value="update" />
        <Group align="flex-end" wrap="wrap">
          <TextInput
            name="name"
            label="Name"
            w={240}
            defaultValue={company.name || ""}
          />
          <TextInput
            name="type"
            label="Type"
            w={180}
            defaultValue={(company as any).type || ""}
          />
          <Checkbox
            name="is_active"
            label="Active"
            defaultChecked={(company as any).is_active || false}
          />
          <TextInput
            name="notes"
            label="Notes"
            w={300}
            defaultValue={company.notes || ""}
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </Group>
      </Form>

      <Form method="post">
        <input type="hidden" name="_intent" value="delete" />
        <Button type="submit" color="red" variant="light" disabled={busy}>
          {busy ? "Deleting..." : "Delete"}
        </Button>
      </Form>

      <Text c="dimmed" size="sm">
        ID: {company.id}
      </Text>
    </Stack>
  );
}
