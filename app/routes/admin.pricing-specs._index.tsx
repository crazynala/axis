import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData, useSubmit } from "@remix-run/react";
import {
  Button,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { requireAdminUser } from "~/utils/auth.server";
import { prismaBase } from "~/utils/prisma.server";
import { makePricingSpecCode } from "~/modules/pricing/utils/pricingSpecUtils.server";
import { GlobalFormProvider, SaveCancelHeader, useInitGlobalFormContext } from "@aa/timber";
import { useForm } from "react-hook-form";
import { useCallback, useEffect, useMemo } from "react";

type LoaderData = {
  specs: Array<{
    id: number;
    name: string;
    target: string;
    updatedAt: string;
    rangeCount: number;
    inUseCount: number;
  }>;
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  const specs = await prismaBase.pricingSpec.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      target: true,
      updatedAt: true,
      _count: { select: { ranges: true, products: true } },
    },
  });
  return json<LoaderData>({
    specs: specs.map((spec) => ({
      id: spec.id,
      name: spec.name,
      target: spec.target,
      updatedAt: spec.updatedAt.toISOString(),
      rangeCount: spec._count.ranges,
      inUseCount: spec._count.products,
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdminUser(request);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") || "");
  const specId = Number(formData.get("specId"));
  if (intent === "pricingSpec.updateNames") {
    const raw = String(formData.get("payload") || "");
    let payload: Record<string, string> = {};
    try {
      payload = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return json({ error: "Invalid payload." }, { status: 400 });
    }
    const entries = Object.entries(payload);
    if (!entries.length) {
      return json({ ok: true });
    }
    for (const [, name] of entries) {
      if (!String(name || "").trim()) {
        return json(
          { error: "Spec name cannot be empty." },
          { status: 400 }
        );
      }
    }
    await prismaBase.$transaction(async (tx) => {
      for (const [id, name] of entries) {
        const idNum = Number(id);
        if (!Number.isFinite(idNum)) continue;
        await tx.pricingSpec.update({
          where: { id: idNum },
          data: { name: String(name || "").trim() },
        });
      }
    });
    return json({ ok: true });
  }
  if (!Number.isFinite(specId)) {
    return json({ error: "Invalid pricing spec id." }, { status: 400 });
  }

  if (intent === "pricingSpec.delete") {
    const inUse = await prismaBase.product.count({
      where: { pricingSpecId: specId },
    });
    if (inUse > 0) {
      return json(
        {
          error:
            "This spec is in use by products. Remove usage before deleting.",
        },
        { status: 400 }
      );
    }
    await prismaBase.pricingSpec.delete({ where: { id: specId } });
    return redirect("/admin/pricing-specs");
  }

  if (intent === "pricingSpec.duplicate") {
    const spec = await prismaBase.pricingSpec.findUnique({
      where: { id: specId },
      include: { ranges: true },
    });
    if (!spec) {
      return json({ error: "Pricing spec not found." }, { status: 404 });
    }
    const name = `${spec.name} (copy)`;
    const duplicated = await prismaBase.pricingSpec.create({
      data: {
        code: makePricingSpecCode(name),
        name,
        target: spec.target,
        curveFamily: spec.curveFamily,
        defaultBreakpoints: spec.defaultBreakpoints,
        params: spec.params,
        notes: spec.notes,
        ranges: {
          create: spec.ranges.map((range) => ({
            rangeFrom: range.rangeFrom,
            rangeTo: range.rangeTo,
            multiplier: range.multiplier,
          })),
        },
      },
    });
    return redirect(`/admin/pricing-specs/${duplicated.id}/sheet`);
  }

  return json({ error: "Invalid intent." }, { status: 400 });
}

export default function PricingSpecListRoute() {
  const { specs } = useLoaderData<typeof loader>();
  return (
    <GlobalFormProvider>
      <PricingSpecListContent specs={specs} />
    </GlobalFormProvider>
  );
}

function PricingSpecListContent({ specs }: LoaderData) {
  const submit = useSubmit();
  const defaultNames = useMemo(
    () =>
      specs.reduce<Record<string, string>>((acc, spec) => {
        acc[String(spec.id)] = spec.name || "";
        return acc;
      }, {}),
    [specs]
  );
  const form = useForm<{ names: Record<string, string> }>({
    defaultValues: { names: defaultNames },
  });
  useEffect(() => {
    form.reset({ names: defaultNames });
  }, [defaultNames, form]);
  const saveNames = useCallback(
    (values: { names: Record<string, string> }) => {
      const fd = new FormData();
      fd.set("_intent", "pricingSpec.updateNames");
      fd.set("payload", JSON.stringify(values.names || {}));
      submit(fd, { method: "post" });
    },
    [submit]
  );
  const resetNames = useCallback(() => {
    form.reset({ names: defaultNames });
  }, [defaultNames, form]);
  const submitIntent = useCallback(
    (intent: string, specId: number) => {
      const fd = new FormData();
      fd.set("_intent", intent);
      fd.set("specId", String(specId));
      submit(fd, { method: "post" });
    },
    [submit]
  );
  useInitGlobalFormContext(
    {
      handleSubmit: form.handleSubmit,
      reset: resetNames,
      formState: form.formState,
      control: form.control,
    },
    (data) => saveNames(data as any),
    resetNames
  );

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>Price Specs</Title>
        <Button component={Link} to="/admin/pricing-specs/new/sheet">
          New Spec
        </Button>
      </Group>
      <SaveCancelHeader />
      <form onSubmit={form.handleSubmit(saveNames)}>
        <Table withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Target</Table.Th>
              <Table.Th># Ranges</Table.Th>
              <Table.Th>Updated</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {specs.length ? (
              specs.map((spec) => (
                <Table.Tr key={spec.id}>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      placeholder="Spec name"
                      {...form.register(`names.${spec.id}`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{spec.target}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{spec.rangeCount}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {new Date(spec.updatedAt).toLocaleDateString()}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button
                        component={Link}
                        to={`/admin/pricing-specs/${spec.id}/sheet`}
                        size="xs"
                        variant="light"
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="default"
                        onClick={() =>
                          submitIntent("pricingSpec.duplicate", spec.id)
                        }
                      >
                        Duplicate
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="subtle"
                        color="red"
                        disabled={spec.inUseCount > 0}
                        onClick={() =>
                          submitIntent("pricingSpec.delete", spec.id)
                        }
                      >
                        Delete
                      </Button>
                    </Group>
                    {spec.inUseCount > 0 ? (
                      <Text size="xs" c="dimmed">
                        In use by {spec.inUseCount} product
                        {spec.inUseCount === 1 ? "" : "s"}
                      </Text>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="dimmed">
                    No pricing specs yet.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </form>
    </Stack>
  );
}
