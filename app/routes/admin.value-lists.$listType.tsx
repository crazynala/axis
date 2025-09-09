import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import {
  Button,
  Group,
  NumberInput,
  Stack,
  Table,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm, Controller } from "react-hook-form";

export async function loader({ params }: LoaderFunctionArgs) {
  const type = params.listType as string;
  const values = await prisma.valueList.findMany({
    where: { type },
    orderBy: [{ label: "asc" }],
  });
  return json({ type, values });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const type = params.listType as string;
  const form = await request.formData();
  const intent = form.get("_intent");
  if (intent === "create") {
    const code = (form.get("code") as string) || null;
    const label = (form.get("label") as string) || null;
    const valueRaw = form.get("value") as string | null;
    const value = valueRaw ? Number(valueRaw) : null;
    await prisma.valueList.create({ data: { code, label, value, type } });
  } else if (intent === "delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.valueList.delete({ where: { id } });
  }
  const values = await prisma.valueList.findMany({
    where: { type },
    orderBy: [{ label: "asc" }],
  });
  return json({ type, values });
}

export default function AdminValueListRoute() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const form = useForm<{ code: string; label: string; value: number | null }>({
    defaultValues: { code: "", label: "", value: null },
  });
  return (
    <Stack>
      <Title order={3}>Value Lists: {data.type}</Title>
      <form
        onSubmit={form.handleSubmit((v) => {
          const fd = new FormData();
          fd.set("_intent", "create");
          if (v.code) fd.set("code", v.code);
          if (v.label) fd.set("label", v.label);
          if (v.value != null) fd.set("value", String(v.value));
          submit(fd, { method: "post" });
        })}
      >
        <Group align="flex-end" wrap="wrap">
          <TextInput label="Code" w={140} {...form.register("code")} />
          <TextInput label="Label" w={180} {...form.register("label")} />
          <Controller
            name="value"
            control={form.control}
            render={({ field }) => (
              <NumberInput
                label="Value"
                w={140}
                value={field.value ?? undefined}
                onChange={(v) => field.onChange(v === "" ? null : Number(v))}
                allowDecimal
              />
            )}
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Add"}
          </Button>
        </Group>
      </form>
      <Table striped withTableBorder withColumnBorders highlightOnHover mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Code</Table.Th>
            <Table.Th>Label</Table.Th>
            <Table.Th>Value</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.values.map((vl: any) => (
            <Table.Tr key={vl.id}>
              <Table.Td>{vl.id}</Table.Td>
              <Table.Td>{vl.code}</Table.Td>
              <Table.Td>{vl.label}</Table.Td>
              <Table.Td>{vl.value}</Table.Td>
              <Table.Td>
                <Button
                  variant="light"
                  color="red"
                  disabled={busy}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("_intent", "delete");
                    fd.set("id", String(vl.id));
                    submit(fd, { method: "post" });
                  }}
                >
                  Delete
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
