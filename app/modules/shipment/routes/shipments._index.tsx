import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigate,
  useSearchParams,
  useLocation,
} from "@remix-run/react";
import { prismaBase } from "../../../utils/prisma.server";
import { buildPrismaArgs } from "../../../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group, Stack } from "@mantine/core";
import { useEffect, useMemo } from "react";
import { ShipmentFindManager } from "../findify/ShipmentFindManager";
import { FindRibbonAuto } from "../../../components/find/FindRibbonAuto";
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
} from "../../../utils/views.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../../../base/find/multiFind";
import { VirtualizedNavDataTable } from "../../../components/VirtualizedNavDataTable";
import { useRecords } from "../../../base/record/RecordContext";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { shipmentSpec } from "../spec";
import { shipmentColumns } from "../spec/indexList";
import {
  getDefaultColumnKeys,
  normalizeColumnsValue,
} from "~/base/index/columns";
import { useHybridIndexTable } from "~/base/index/useHybridIndexTable";
import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
  getSavedIndexSearch,
} from "~/hooks/useNavLocation";

const SHIPMENT_FIND_PARAM_KEYS = [
  "status",
  "type",
  "shipmentType",
  "trackingNo",
  "packingSlipCode",
  "date",
  "dateReceived",
  "findReqs",
  "view",
  "preset",
  "sort",
  "dir",
  "perPage",
  "q",
];

export const meta: MetaFunction = () => [{ title: "Shipments" }];

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  console.debug("[shipments.index] url", url.toString());
  const viewUser = await getViewUser(args.request);
  const views = await listViews("shipments", viewUser);
  const viewName = url.searchParams.get("view");
  const presetParam = url.searchParams.get("preset");
  const valuesFromSearch = (input: URLSearchParams, keys: string[]) => {
    const filters: Record<string, any> = {};
    keys.forEach((k) => {
      const v = input.get(k);
      if (v !== null && v !== "") filters[k] = v;
    });
    const findReqs = input.get("findReqs");
    if (findReqs) filters.findReqs = findReqs;
    return filters;
  };
  const semanticKeys = Array.from(shipmentSpec.find.deriveSemanticKeys());
  const hasSemantic =
    url.searchParams.has("q") ||
    url.searchParams.has("findReqs") ||
    semanticKeys.some((k) => {
      const v = url.searchParams.get(k);
      return v !== null && v !== "";
    });
  const viewActive = !!viewName && !hasSemantic;
  console.debug("[shipments.index] view", {
    viewName,
    viewActive,
    hasSemantic,
    presetParam,
  });
  const activeView = viewActive ? findViewByParam(views, viewName) : null;
  const viewParams: any = activeView?.params || null;
  const viewFilters: Record<string, any> = (viewParams?.filters || {}) as any;
  const effectivePage = Number(
    url.searchParams.get("page") || viewParams?.page || 1
  );
  const effectivePerPage = Number(
    url.searchParams.get("perPage") || viewParams?.perPage || 20
  );
  const effectiveSort =
    url.searchParams.get("sort") || viewParams?.sort || null;
  const effectiveDir = url.searchParams.get("dir") || viewParams?.dir || null;
  const effectiveQ = viewActive
    ? viewParams?.q ?? null
    : url.searchParams.get("q");
  let findWhere: any = null;
  const findKeys = semanticKeys;
  const hasFindIndicators = viewActive
    ? findKeys.some(
        (k) => viewFilters[k] !== undefined && viewFilters[k] !== null
      ) || !!viewFilters.findReqs
    : findKeys.some((k) => url.searchParams.has(k)) ||
      url.searchParams.has("findReqs");
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const k of findKeys) {
      const v = viewActive ? viewFilters[k] : url.searchParams.get(k);
      if (v !== null && v !== undefined && v !== "") values[k] = v;
    }
    // simple where (basic contains/equals heuristics)
    const simple: any = {};
    if (values.status)
      simple.status = { contains: values.status, mode: "insensitive" };
    if (values.type)
      simple.type = { contains: values.type, mode: "insensitive" };
    if (values.shipmentType)
      simple.shipmentType = {
        contains: values.shipmentType,
        mode: "insensitive",
      };
    if (values.trackingNo)
      simple.trackingNo = { contains: values.trackingNo, mode: "insensitive" };
    if (values.packingSlipCode)
      simple.packingSlipCode = {
        contains: values.packingSlipCode,
        mode: "insensitive",
      };
    if (values.date)
      simple.date = values.date ? new Date(values.date) : undefined;
    if (values.dateReceived)
      simple.dateReceived = values.dateReceived
        ? new Date(values.dateReceived)
        : undefined;
    const rawFindReqs = viewActive
      ? viewFilters.findReqs
      : url.searchParams.get("findReqs");
    const multi = decodeRequests(rawFindReqs);
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        status: (v) => ({ status: { contains: v, mode: "insensitive" } }),
        type: (v) => ({ type: { contains: v, mode: "insensitive" } }),
        shipmentType: (v) => ({
          shipmentType: { contains: v, mode: "insensitive" },
        }),
        trackingNo: (v) => ({
          trackingNo: { contains: v, mode: "insensitive" },
        }),
        packingSlipCode: (v) => ({
          packingSlipCode: { contains: v, mode: "insensitive" },
        }),
      };
      const multiWhere = buildWhereFromRequests(multi, interpreters);
      findWhere = mergeSimpleAndMulti(simple, multiWhere);
    } else findWhere = simple;
  }
  const effectivePreset = viewActive ? null : presetParam ? presetParam : "out";
  console.debug("[shipments.index] effectivePreset", effectivePreset);
  let baseParams: any = {
    page: findWhere ? 1 : effectivePage,
    perPage: effectivePerPage,
    sort: effectiveSort,
    dir: effectiveDir,
    q: effectiveQ ?? null,
    filters: viewActive
      ? viewFilters
      : valuesFromSearch(url.searchParams, findKeys),
  };
  if (baseParams.filters) {
    const {
      findReqs: _omitFindReqs,
      find: _legacyFind,
      ...rest
    } = baseParams.filters;
    baseParams = { ...baseParams, filters: rest };
  }
  const prismaArgs = buildPrismaArgs<any>(baseParams, {
    defaultSort: { field: "id", dir: "desc" },
    searchableFields: ["trackingNo", "status", "shipmentType", "type"],
    filterMappers: {
      companyIdCarrier: (v: any) => ({
        companyIdCarrier: Number(v) || undefined,
      }),
      companyIdReceiver: (v: any) => ({
        companyIdReceiver: Number(v) || undefined,
      }),
      companyIdSender: (v: any) => ({
        companyIdSender: Number(v) || undefined,
      }),
      locationId: (v: any) => ({ locationId: Number(v) || undefined }),
      addressIdShip: (v: any) => ({ addressIdShip: Number(v) || undefined }),
      contactIdReceiver: (v: any) => ({
        contactIdReceiver: Number(v) || undefined,
      }),
    },
  });
  if (effectivePreset === "out") {
    const hasExplicitType =
      findWhere &&
      ("type" in findWhere ||
        (Array.isArray((findWhere as any).AND) &&
          (findWhere as any).AND.some((c: any) => "type" in (c || {}))) ||
        (Array.isArray((findWhere as any).OR) &&
          (findWhere as any).OR.some((c: any) => "type" in (c || {}))));
    const hasExplicitShipmentType =
      findWhere &&
      ("shipmentType" in findWhere ||
        (Array.isArray((findWhere as any).AND) &&
          (findWhere as any).AND.some(
            (c: any) => "shipmentType" in (c || {})
          )) ||
        (Array.isArray((findWhere as any).OR) &&
          (findWhere as any).OR.some((c: any) => "shipmentType" in (c || {}))));
    const presetFilters: any[] = [];
    if (!hasExplicitType) presetFilters.push({ type: "Out" });
    if (!hasExplicitShipmentType) {
      presetFilters.push({ shipmentType: { not: "Keep Sample" } });
    }
    if (presetFilters.length) {
      findWhere = findWhere
        ? { AND: [findWhere, ...presetFilters] }
        : presetFilters.length === 1
        ? presetFilters[0]
        : { AND: presetFilters };
    }
  }
  console.debug("[shipments.index] findWhere", findWhere);
  if (findWhere) prismaArgs.where = findWhere;
  // Hybrid roster subset
  const ID_CAP = 50000;
  const idRows = await prismaBase.shipment.findMany({
    where: prismaArgs.where,
    orderBy: prismaArgs.orderBy || { id: "asc" },
    select: { id: true },
    take: ID_CAP,
  });
  const idList = idRows.map((r) => r.id);
  const idListComplete = idRows.length < ID_CAP;
  const INITIAL_COUNT = 100;
  const initialIds = idList.slice(0, INITIAL_COUNT);
  let initialRows: any[] = [];
  if (initialIds.length) {
    initialRows = await prismaBase.shipment.findMany({
      where: { id: { in: initialIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        date: true,
        status: true,
        type: true,
        shipmentType: true,
        trackingNo: true,
        companySender: { select: { name: true } },
        companyReceiver: { select: { name: true } },
      },
    });
  }
  return json({
    idList,
    idListComplete,
    initialRows,
    total: idList.length,
    views,
    activeView: viewActive
      ? String(activeView?.id ?? viewName ?? "") || null
      : null,
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
    if (!viewId || !name) return redirect("/shipments");
    await renameView({ viewId, name, user: viewUser, module: "shipments" });
    return redirect(`/shipments?view=${encodeURIComponent(viewId)}`);
  }
  if (intent === "view.delete") {
    if (!viewId) return redirect("/shipments");
    await deleteView({ viewId, user: viewUser, module: "shipments" });
    return redirect("/shipments");
  }
  if (intent === "view.duplicate") {
    if (!viewId) return redirect("/shipments");
    const view = await duplicateView({
      viewId,
      name: name || null,
      user: viewUser,
      module: "shipments",
    });
    return redirect(`/shipments?view=${encodeURIComponent(String(view.id))}`);
  }
  if (intent === "view.publish") {
    if (!viewId) return redirect("/shipments");
    await publishView({ viewId, user: viewUser, module: "shipments" });
    return redirect(`/shipments?view=${encodeURIComponent(viewId)}`);
  }
  if (intent === "view.unpublish") {
    if (!viewId) return redirect("/shipments");
    await unpublishView({ viewId, user: viewUser, module: "shipments" });
    return redirect(`/shipments?view=${encodeURIComponent(viewId)}`);
  }
  if (
    intent === "saveView" ||
    intent === "view.saveAs" ||
    intent === "view.overwriteFromUrl"
  ) {
    if (intent === "view.overwriteFromUrl") {
      if (!viewId) return redirect("/shipments");
    } else if (!name) {
      return redirect("/shipments");
    }
    const url = new URL(request.url);
    const sp = url.searchParams;
    const semanticKeys = Array.from(shipmentSpec.find.deriveSemanticKeys());
    const q = sp.get("q");
    const findReqs = sp.get("findReqs");
    const filters: Record<string, any> = {};
    for (const k of semanticKeys) {
      const v = sp.get(k);
      if (v !== null && v !== "") filters[k] = v;
    }
    if (findReqs) filters.findReqs = findReqs;
    const hasSemantic =
      (q != null && q !== "") ||
      !!findReqs ||
      Object.keys(filters).length > (findReqs ? 1 : 0);
    const viewParam = sp.get("view");
    let baseParams: any = null;
    if (viewParam && !hasSemantic) {
      const base = await getView("shipments", viewParam);
      baseParams = (base?.params || {}) as any;
    }
    const nextQ = hasSemantic ? q ?? null : baseParams?.q ?? null;
    const nextFilters = hasSemantic
      ? filters
      : { ...(baseParams?.filters || {}) };
    const perPage = Number(sp.get("perPage") || baseParams?.perPage || 20);
    const sort = sp.get("sort") || baseParams?.sort || null;
    const dir = sp.get("dir") || baseParams?.dir || null;
    const columnsFromUrl = normalizeColumnsValue(sp.get("columns"));
    const baseColumns = normalizeColumnsValue(baseParams?.columns);
    const defaultColumns = getDefaultColumnKeys(shipmentColumns);
    const columns =
      columnsFromUrl.length > 0
        ? columnsFromUrl
        : baseColumns.length > 0
        ? baseColumns
        : defaultColumns;
    const params = {
      page: 1,
      perPage,
      sort,
      dir,
      q: nextQ ?? null,
      filters: nextFilters,
      columns,
    };
    if (intent === "view.overwriteFromUrl") {
      await updateViewParams({
        viewId,
        params,
        user: viewUser,
        module: "shipments",
      });
      return redirect(`/shipments?view=${encodeURIComponent(viewId)}`);
    }
    const view = await saveView({
      module: "shipments",
      name,
      params,
      user: viewUser,
    });
    return redirect(`/shipments?view=${encodeURIComponent(String(view.id))}`);
  }
  return redirect("/shipments");
}

export default function ShipmentsIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "shipments" });
  usePersistIndexSearch("/shipments");
  const data = useLoaderData<typeof loader>();
  const { currentId, setCurrentId, setIdList, addRows } = useRecords();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  const appendHref = useFindHrefAppender();
  const savedSearch = getSavedIndexSearch("/shipments");
  const shipmentsHref = savedSearch
    ? `/shipments${savedSearch}`
    : appendHref("/shipments");
  const findConfig = useMemo(() => shipmentSpec.find.buildConfig(), []);
  const viewMode = !!data?.activeView;
  const presetParam = sp.get("preset");
  const viewTabs = [
    { value: "preset:out", label: "Out" },
    { value: "All", label: "All" },
    ...(data?.views || [])
      .map((v: any) => ({
        value: String(v.id),
        label: v.name,
      }))
      .filter((v: any) => v.label && v.label !== "All"),
  ];
  const activeTabValue = viewMode
    ? String(data?.activeView ?? "All")
    : presetParam === "all"
    ? "All"
    : "preset:out";
  const {
    records,
    columns,
    sortStatus,
    onSortStatusChange,
    onReachEnd,
    atEnd,
    fetching,
    total,
  } = useHybridIndexTable({
    module: "shipments",
    rowEndpointPath: "/shipments/rows",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
    columns: shipmentColumns,
    viewColumns: data?.activeViewParams?.columns,
    viewMode,
  });
  useEffect(() => {
    console.debug("[shipments.index] setIdList", {
      count: data.idList?.length ?? 0,
      first: data.idList?.[0],
      last: data.idList?.[data.idList?.length - 1],
    });
    setIdList("shipments", data.idList, data.idListComplete);
    if (data.initialRows?.length) {
      console.debug("[shipments.index] addRows", {
        count: data.initialRows.length,
      });
      addRows("shipments", data.initialRows, { updateRecordsArray: true });
    }
  }, [addRows, data.idList, data.idListComplete, data.initialRows, setIdList]);
  return (
    <Stack gap="lg">
      <ShipmentFindManager activeViewParams={data?.activeViewParams || null} />
      <Group justify="space-between" align="center" mb="sm">
        <BreadcrumbSet
          breadcrumbs={[{ label: "Shipments", href: shipmentsHref }]}
        />
        <Button
          component={Link}
          to="/shipments/new"
          variant="filled"
          color="blue"
        >
          New
        </Button>
      </Group>
      <FindRibbonAuto
        views={data?.views || []}
        viewTabs={viewTabs}
        activeView={activeTabValue}
        activeViewId={data?.activeView || null}
        activeViewParams={data?.activeViewParams || null}
        findConfig={findConfig}
        enableLastView
        columnsConfig={shipmentColumns}
        ignoreFilterKeys={["preset"]}
        onSelectView={(val, helpers) => {
          if (val === "preset:out") {
            const next = new URLSearchParams(helpers.searchParams);
            next.delete("view");
            next.set("preset", "out");
            next.delete("page");
            const qs = next.toString();
            helpers.navigate(
              qs ? `${helpers.pathname}?${qs}` : helpers.pathname
            );
            return;
          } else if (val === "All") {
            const next = new URLSearchParams(helpers.searchParams);
            next.delete("view");
            next.set("preset", "all");
            next.delete("page");
            const qs = next.toString();
            helpers.navigate(
              qs ? `${helpers.pathname}?${qs}` : helpers.pathname
            );
            return;
          } else {
            const next = new URLSearchParams();
            next.set("view", val);
            const qs = next.toString();
            helpers.navigate(`${helpers.pathname}?${qs}`);
            return;
          }
        }}
      />
      <VirtualizedNavDataTable
        records={records as any}
        currentId={currentId as any}
        columns={columns as any}
        sortStatus={sortStatus as any}
        onSortStatusChange={onSortStatusChange as any}
        onRowDoubleClick={(rec: any) => {
          if (rec?.id != null) navigate(`/shipments/${rec.id}`);
        }}
        onRowClick={(rec: any) => setCurrentId(rec?.id, "mouseRow")}
        onReachEnd={onReachEnd}
        footer={
          atEnd ? (
            <span style={{ fontSize: 12 }}>End of results ({total})</span>
          ) : fetching ? (
            <span>Loading…</span>
          ) : (
            <span style={{ fontSize: 11 }}>Scroll to load more…</span>
          )
        }
      />
    </Stack>
  );
}

export const shouldRevalidate = makeModuleShouldRevalidate(
  "/shipments",
  SHIPMENT_FIND_PARAM_KEYS
);
