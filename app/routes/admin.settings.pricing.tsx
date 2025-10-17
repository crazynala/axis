import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { prisma } from "~/utils/prisma.server";
import { Button, Group, NumberInput, Stack, Title } from "@mantine/core";

export const meta: MetaFunction = () => [{ title: "Pricing Settings" }];

export async function loader(_: LoaderFunctionArgs) {
  const setting = await prisma.setting.findUnique({
    where: { key: "defaultMargin" },
  });
  const defaultMargin =
    setting?.number != null
      ? Number(setting.number)
      : setting?.value != null
      ? Number(setting.value)
      : 0.1;
  return json({ defaultMargin });
}

export async function action({ request }: ActionFunctionArgs) {
  const fd = await request.formData();
  const v = fd.get("defaultMargin");
  const num = typeof v === "string" ? Number(v) : 0;
  await prisma.setting.upsert({
    where: { key: "defaultMargin" },
    create: { key: "defaultMargin", number: num },
    update: { number: num },
  });
  return redirect("/admin/settings/pricing");
}

export default function PricingSettingsRoute() {
  const { defaultMargin } = useLoaderData<typeof loader>();
  return (
    <Stack>
      <Title order={2}>Pricing Settings</Title>
      <Form method="post">
        <Stack w={340}>
          <NumberInput
            name="defaultMargin"
            label="Default Margin (decimal)"
            step={0.01}
            min={0}
            max={10}
            defaultValue={defaultMargin}
          />
          <Group>
            <Button type="submit">Save</Button>
          </Group>
        </Stack>
      </Form>
    </Stack>
  );
}
