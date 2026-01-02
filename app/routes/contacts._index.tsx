import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { prisma } from "../utils/prisma.server";
import { Table, Title, Stack } from "@mantine/core";
import { FindRibbonAuto } from "../components/find/FindRibbonAuto";
import { listViews, saveView, getView } from "../utils/views.server";
import { contactColumns } from "~/modules/contact/config/contactColumns";
import {
  getDefaultColumnKeys,
  getVisibleColumnKeys,
  normalizeColumnsValue,
} from "~/base/index/columns";
import { useMemo } from "react";

export const meta: MetaFunction = () => [{ title: "Contacts" }];

export async function loader(_args: LoaderFunctionArgs) {
  const url = new URL(_args.request.url);
  const views = await listViews("contacts");
  const viewName = url.searchParams.get("view");
  const hasSemantic =
    url.searchParams.has("q") || url.searchParams.has("findReqs");
  const viewActive = !!viewName && !hasSemantic;
  const activeView = viewActive
    ? (views.find((x: any) => x.name === viewName) as any)
    : null;
  const viewParams: any = activeView?.params || null;
  const effectiveSort =
    url.searchParams.get("sort") || viewParams?.sort || null;
  const effectiveDir = url.searchParams.get("dir") || viewParams?.dir || null;
  const orderBy = effectiveSort
    ? { [effectiveSort]: effectiveDir || "asc" }
    : { id: "desc" };
  const contacts = await prisma.contact.findMany({
    orderBy,
    take: 1000,
    include: { company: { select: { id: true, name: true } } },
  });
  return json({
    contacts,
    views,
    activeView: viewActive ? viewName || null : null,
    activeViewParams: viewActive ? viewParams || null : null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (
    intent === "saveView" ||
    intent === "view.saveAs" ||
    intent === "view.overwriteFromUrl"
  ) {
    const name =
      intent === "view.overwriteFromUrl"
        ? String(form.get("viewId") || form.get("name") || "").trim()
        : String(form.get("name") || "").trim();
    if (!name) return redirect("/contacts");
    const url = new URL(request.url);
    const sp = url.searchParams;
    const viewParam = sp.get("view");
    const hasSemantic = sp.has("q") || sp.has("findReqs");
    let baseParams: any = null;
    if (viewParam && !hasSemantic) {
      const base = await getView("contacts", viewParam);
      baseParams = (base?.params || {}) as any;
    }
    const perPage = Number(sp.get("perPage") || baseParams?.perPage || 20);
    const sort = sp.get("sort") || baseParams?.sort || null;
    const dir = sp.get("dir") || baseParams?.dir || null;
    const columnsFromUrl = normalizeColumnsValue(sp.get("columns"));
    const baseColumns = normalizeColumnsValue(baseParams?.columns);
    const defaultColumns = getDefaultColumnKeys(contactColumns);
    const columns =
      columnsFromUrl.length > 0
        ? columnsFromUrl
        : baseColumns.length > 0
        ? baseColumns
        : defaultColumns;
    await saveView({
      module: "contacts",
      name,
      params: { page: 1, perPage, sort, dir, q: null, filters: {}, columns },
    });
    return redirect(`/contacts?view=${encodeURIComponent(name)}`);
  }
  return redirect("/contacts");
}

export default function ContactsIndexRoute() {
  const { contacts, views, activeView, activeViewParams } =
    useLoaderData<typeof loader>();
  const [sp] = useSearchParams();
  const viewMode = !!activeView;
  const visibleColumnKeys = useMemo(
    () =>
      getVisibleColumnKeys({
        defs: contactColumns,
        urlColumns: sp.get("columns"),
        viewColumns: activeViewParams?.columns,
        viewMode,
      }),
    [activeViewParams?.columns, sp, viewMode]
  );
  const visibleColumns = useMemo(
    () =>
      visibleColumnKeys
        .map((key) => contactColumns.find((col) => col.key === key))
        .filter(Boolean),
    [visibleColumnKeys]
  );
  const getValue = (row: any, accessor?: string) => {
    if (!accessor) return "";
    return accessor.split(".").reduce((acc: any, part: string) => {
      if (acc == null) return "";
      return acc[part];
    }, row);
  };
  return (
    <Stack gap="md">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Title order={2}>Contacts</Title>
        {(() => {
          const appendHref = useFindHrefAppender();
          return (
            <BreadcrumbSet
              breadcrumbs={[
                { label: "Contacts", href: appendHref("/contacts") },
              ]}
            />
          );
        })()}
      </div>
      <FindRibbonAuto
        views={views as any}
        activeView={activeView as any}
        activeViewId={activeView as any}
        activeViewParams={activeViewParams as any}
        semanticKeys={[]}
        enableLastView
        columnsConfig={contactColumns}
      />
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            {visibleColumns.map((col) => (
              <Table.Th key={col?.key || ""}>{col?.title}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {contacts.map((c: any) => {
            return (
              <Table.Tr key={c.id}>
                {visibleColumns.map((col) => (
                  <Table.Td key={col?.key || ""}>
                    {col?.render ? col.render(c) : getValue(c, col?.accessor)}
                  </Table.Td>
                ))}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
