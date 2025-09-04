import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { useNavigation, useSubmit } from "@remix-run/react";
import { Button, Group, Stack, TextInput, Title } from "@mantine/core";
import { useForm } from "react-hook-form";
import { BreadcrumbSet } from "packages/timber";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "New Assembly" }];

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const data = {
    name: (form.get("name") as string) || null,
  } as const;
  await prisma.assembly.create({ data: data as any });
  return redirect("/assembly");
}

export default function NewAssemblyRoute() {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const form = useForm({ defaultValues: { name: "" } });
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>New Assembly</Title>
        <BreadcrumbSet breadcrumbs={[{ label: "Assembly", href: "/assembly" }, { label: "New", href: "#" }]} />
      </Group>
      <form
        onSubmit={form.handleSubmit((values) => {
          const fd = new FormData();
          if (values.name) fd.set("name", values.name);
          submit(fd, { method: "post" });
        })}
      >
        <Group align="flex-end" wrap="wrap">
          <TextInput label="Name" w={260} {...form.register("name")} />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </Group>
      </form>
    </Stack>
  );
}
