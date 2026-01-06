import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { prisma } from "../utils/prisma.server";
import { Table, Title, Stack } from "@mantine/core";
import { FindRibbonAuto } from "../components/find/FindRibbonAuto";
import {
  deleteView,
  duplicateView,
  findViewByParam,
  getView,
  getViewUser,
  listViews,
  publishView,
  renameView,
  saveView,
  unpublishView,
  updateViewParams,
} from "../utils/views.server";
import { contactColumns } from "~/modules/contact/spec/indexList";
import {
  getDefaultColumnKeys,
  getVisibleColumnKeys,
  normalizeColumnsValue,
} from "~/base/index/columns";
import { useMemo } from "react";

export const meta: MetaFunction = () => [{ title: "Contacts" }];

export async function loader(_args: LoaderFunctionArgs) {
  const url = new URL(_args.request.url);
  const viewUser = await getViewUser(_args.request);
  const views = await listViews("contacts", viewUser);
  const viewName = url.searchParams.get("view");
  const hasSemantic =
    url.searchParams.has("q") || url.searchParams.has("findReqs");
  const viewActive = !!viewName && !hasSemantic;
  const activeView = viewActive ? findViewByParam(views, viewName) : null;
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
    activeView: viewActive ? String(activeView?.id ?? viewName ?? "") || null : null,
    activeViewParams: viewActive ? viewParams || null : null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  const viewUser = await getViewUser(request);
  const viewId = String(form.get("viewId") || "").trim();
  const name = String(form.get("name") || "").trim();
  if (intent === "view.rename") {
    if (!viewId || !name) return redirect("/contacts");
    await renameView({ viewId, name, user: viewUser, module: "contacts" });
    return redirect(`/contacts?view=${encodeURIComponent(viewId)}`);
  }
  if (intent === "view.delete") {
    if (!viewId) return redirect("/contacts");
    await deleteView({ viewId, user: viewUser, module: "contacts" });
    return redirect("/contacts");
  }
  if (intent === "view.duplicate") {
    if (!viewId) return redirect("/contacts");
    const view = await duplicateView({
      viewId,
      name: name || null,
      user: viewUser,
      module: "contacts",
    });
    return redirect(`/contacts?view=${encodeURIComponent(String(view.id))}`);
  }
  if (intent === "view.publish") {
    if (!viewId) return redirect("/contacts");
    await publishView({ viewId, user: viewUser, module: "contacts" });
    return redirect(`/contacts?view=${encodeURIComponent(viewId)}`);
  }
  if (intent === "view.unpublish") {
    if (!viewId) return redirect("/contacts");
    await unpublishView({ viewId, user: viewUser, module: "contacts" });
    return redirect(`/contacts?view=${encodeURIComponent(viewId)}`);
  }
  if (
    intent === "saveView" ||
    intent === "view.saveAs" ||
    intent === "view.overwriteFromUrl"
  ) {
    if (intent === "view.overwriteFromUrl") {
      if (!viewId) return redirect("/contacts");
    } else if (!name) {
      return redirect("/contacts");
    }
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
    const params = { page: 1, perPage, sort, dir, q: null, filters: {}, columns };
    if (intent === "view.overwriteFromUrl") {
      await updateViewParams({
        viewId,
        params,
        user: viewUser,
        module: "contacts",
      });
      return redirect(`/contacts?view=${encodeURIComponent(viewId)}`);
    }
    const view = await saveView({
      module: "contacts",
      name,
      params,
      user: viewUser,
    });
    return redirect(`/contacts?view=${encodeURIComponent(String(view.id))}`);
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
