import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigation,
  useSubmit,
  useNavigate,
  useSearchParams,
  Form,
} from "@remix-run/react";
import { Button, TextInput, Group, Stack, Title } from "@mantine/core";
import { BreadcrumbSet } from "@aa/timber";
import { useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";
import { NavDataTable } from "../components/RefactoredNavDataTable";
import {
  idLinkColumn,
  nameOrFallbackColumn,
  simpleColumn,
} from "../components/tableColumns";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";

export const meta: MetaFunction = () => [{ title: "Assembly" }];

export async function loader(args: LoaderFunctionArgs) {
  const params = parseTableParams(args.request.url);
  const prismaArgs = buildPrismaArgs<any>(params, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["name", "status", "notes"],
  });
  const [rows, total] = await Promise.all([
    prisma.assembly.findMany({ ...prismaArgs }),
    prisma.assembly.count({ where: prismaArgs.where }),
  ]);
  return json({
    rows,
    total,
    page: params.page,
    perPage: params.perPage,
    q: params.q,
    sort: params.sort,
    dir: params.dir,
    filters: params.filters || {},
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "create") {
    const data = {
      name: (form.get("name") as string) || null,
    } as const;
    await prisma.assembly.create({ data: data as any });
    return redirect("/assembly");
  }

  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.assembly.delete({ where: { id } });
    return redirect("/assembly");
  }

  return redirect("/assembly");
}

export default function AssemblyIndexRoute() {
  const { rows, total, page, perPage, q, filters } =
    useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const form = useForm<{ name: string | null }>({
    defaultValues: { name: "" },
  });

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Assembly</Title>
        <BreadcrumbSet
          breadcrumbs={[{ label: "Assembly", href: "/assembly" }]}
        />
      </Group>
      <Group>
        <Button
          component="a"
          href="/assembly/new"
          variant="filled"
          color="blue"
        >
          New Assembly
        </Button>
      </Group>

      <section>
        <Title order={4} mb="xs">
          All Assemblies
        </Title>
        <Form method="get">
          <Group wrap="wrap" align="flex-end" mb="sm">
            <TextInput
              name="q"
              label="Search"
              placeholder="Name, status, notes"
              defaultValue={q || ""}
              w={240}
            />
            <Button type="submit" variant="default">
              Apply
            </Button>
          </Group>
        </Form>
        <NavDataTable
          module="assembly"
          records={rows as any}
          columns={[
            idLinkColumn("assembly"),
            nameOrFallbackColumn("name", "assembly"),
            simpleColumn("status", "Status"),
            simpleColumn("qtyOrdered", "# Ordered"),
          ]}
          onActivate={(rec: any) => {
            if (rec?.id != null) navigate(`/assembly/${rec.id}`);
          }}
        />
      </section>
    </Stack>
  );
}
