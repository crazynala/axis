import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import {
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  useSubmit,
  useRevalidator,
} from "@remix-run/react";
import { Badge, Button, Drawer, Group, Menu, Stack, Table, Text } from "@mantine/core";
import {
  useEffect,
  useState,
  type ReactNode,
  useMemo,
  useCallback,
} from "react";
import { BreadcrumbSet, getLogger } from "@aa/timber";
import { useRecordContext } from "../../../base/record/RecordContext";
import { AssembliesEditor } from "~/modules/job/components/AssembliesEditor";
import { normalizeAssemblyState } from "~/modules/job/stateUtils";
import { useRegisterNavLocation } from "~/hooks/useNavLocation";
import { MaterialCoverageDetails } from "~/modules/materials/components/MaterialCoverageDetails";
import { DebugDrawer } from "~/modules/debug/components/DebugDrawer";
import { IconBug, IconMenu2 } from "@tabler/icons-react";
import { showToastError } from "~/utils/toast";
import { loadAssemblyDetailVM } from "~/modules/job/services/assemblyDetailVM.server";
import { handleAssemblyDetailAction } from "~/modules/job/services/assemblyDetailActions.server";

export const meta: MetaFunction = () => [{ title: "Job Assembly" }];

export async function loader({ params, request }: LoaderFunctionArgs) {
  return loadAssemblyDetailVM({ request, params });
}

export async function action({ request, params }: ActionFunctionArgs) {
  return handleAssemblyDetailAction({ request, params } as any);
}

export default function JobAssemblyRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "jobs" });
  const data = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  const assemblies = (data.assemblies || []) as any[];
  const isGroup = (assemblies?.length || 0) > 1;

  const job = { id: data?.job?.id as number, name: data?.job?.name ?? null };
  const log = getLogger("assembly");
  const idKey = (assemblies || []).map((a: any) => a.id).join(",");
  log.debug({ assemblyId: idKey, jobId: job.id }, "Rendering assembly view");

  const {
    costingStats,
    activityConsumptionMap,
    activities,
    products,
    productVariantSet,
    assemblyTypes,
    groupInfo,
  } = data as any;

  const nav = useNavigation();
  const submit = useSubmit();
  const acceptGapFetcher = useFetcher<{ ok?: boolean }>();
  const toleranceFetcher = useFetcher<{ ok?: boolean }>();
  const reservationFetcher = useFetcher<{ ok?: boolean }>();
  const debugFetcher = useFetcher();
  const revalidator = useRevalidator();
  const { setCurrentId } = useRecordContext();
  const [debugTarget, setDebugTarget] = useState<{
    assemblyId: number;
    jobId: number;
  } | null>(null);
  const [groupDrawerOpen, setGroupDrawerOpen] = useState(false);
  const canDebug = Boolean(data?.canDebug);
  useEffect(() => {
    if (actionData?.error) {
      showToastError(actionData.error);
    }
  }, [actionData]);
  useEffect(() => {
    if (isGroup) setCurrentId(idKey);
    else if (assemblies?.[0]?.id) setCurrentId(assemblies[0].id);
  }, [isGroup, idKey, assemblies, setCurrentId]);

  // Prev/Next hotkeys handled globally in RecordProvider
  // Path building now automatic (replace last path segment with id); no custom builder needed.
  const [cutOpen, setCutOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<null | any>(null);
  useEffect(() => {
    if (
      (acceptGapFetcher.state === "idle" && acceptGapFetcher.data) ||
      (toleranceFetcher.state === "idle" && toleranceFetcher.data) ||
      (reservationFetcher.state === "idle" && reservationFetcher.data)
    ) {
      revalidator.revalidate();
    }
  }, [
    acceptGapFetcher.state,
    acceptGapFetcher.data,
    toleranceFetcher.state,
    toleranceFetcher.data,
    reservationFetcher.state,
    reservationFetcher.data,
    revalidator,
  ]);
  const coverageByAssembly = useMemo(() => {
    const map = new Map<number, any>();
    (data.materialCoverageByAssembly || []).forEach((entry: any) => {
      if (entry?.assemblyId != null) {
        map.set(entry.assemblyId, entry.coverage ?? null);
      }
    });
    return map;
  }, [data.materialCoverageByAssembly]);
  const handleAcceptGap = useCallback(
    (assemblyId: number, productId: number) => {
      const fd = new FormData();
      fd.set("_intent", "acceptGap");
      fd.set("assemblyId", String(assemblyId));
      fd.set("productId", String(productId));
      acceptGapFetcher.submit(fd, {
        method: "post",
        action: "/production/dashboard",
      });
    },
    [acceptGapFetcher]
  );
  const handleToleranceSave = useCallback(
    (assemblyId: number, abs: number | null, pct: number | null) => {
      const fd = new FormData();
      fd.set("_intent", "updateTolerance");
      fd.set("assemblyId", String(assemblyId));
      if (pct != null && Number.isFinite(pct)) {
        fd.set("pct", String(pct));
      }
      if (abs != null && Number.isFinite(abs)) {
        fd.set("abs", String(abs));
      }
      toleranceFetcher.submit(fd, {
        method: "post",
        action: "/production/dashboard",
      });
    },
    [toleranceFetcher]
  );
  const handleToleranceReset = useCallback(
    (assemblyId: number) => {
      const fd = new FormData();
      fd.set("_intent", "updateTolerance");
      fd.set("assemblyId", String(assemblyId));
      fd.set("reset", "1");
      toleranceFetcher.submit(fd, {
        method: "post",
        action: "/production/dashboard",
      });
    },
    [toleranceFetcher]
  );
  const handleTrimReservations = useCallback(
    (lineId: number) => {
      const fd = new FormData();
      fd.set("_intent", "reservations.trim");
      fd.set("lineId", String(lineId));
      reservationFetcher.submit(fd, {
        method: "post",
        action: "/production/dashboard",
      });
    },
    [reservationFetcher]
  );
  const handleSettleReservations = useCallback(
    (assemblyId: number, productId: number, note: string | null) => {
      const fd = new FormData();
      fd.set("_intent", "reservations.settle");
      fd.set("assemblyId", String(assemblyId));
      fd.set("productId", String(productId));
      if (note) {
        fd.set("note", note);
      }
      reservationFetcher.submit(fd, {
        method: "post",
        action: "/production/dashboard",
      });
    },
    [reservationFetcher]
  );
  const handleOpenDebug = useCallback(
    (assemblyId: number, jobId: number) => {
      setDebugTarget({ assemblyId, jobId });
      debugFetcher.load(`/jobs/${jobId}/assembly/${assemblyId}/debug`);
    },
    [debugFetcher]
  );
  const acceptGapTargetProductId =
    acceptGapFetcher.state !== "idle"
      ? Number(acceptGapFetcher.formData?.get("productId"))
      : null;
  const reservationIntent =
    reservationFetcher.state !== "idle"
      ? String(reservationFetcher.formData?.get("_intent") || "")
      : "";
  const trimCandidate =
    reservationIntent === "reservations.trim"
      ? Number(reservationFetcher.formData?.get("lineId"))
      : NaN;
  const settleCandidate =
    reservationIntent === "reservations.settle"
      ? Number(reservationFetcher.formData?.get("productId"))
      : NaN;
  const trimmingLineId = Number.isFinite(trimCandidate) ? trimCandidate : null;
  const settlingProductId = Number.isFinite(settleCandidate)
    ? settleCandidate
    : null;

  const handleSubmitOrdered = (arr: number[]) => {
    const fd = new FormData();
    fd.set("_intent", "assembly.updateOrderedBreakdown");
    fd.set("orderedArr", JSON.stringify(arr));
    submit(fd, { method: "post" });
  };
  const primaryAssembly = (assemblies || [])[0] as any | null;
  const renderStatusBar = ({
    statusControls,
    whiteboardControl,
  }: {
    statusControls: ReactNode;
    whiteboardControl: ReactNode | null;
  }) => {
    const breadcrumbs = isGroup
      ? [
          { label: "Jobs", href: "/jobs" },
          { label: `Job ${job.id}`, href: `/jobs/${job.id}` },
          {
            label: `Assemblies ${(assemblies || [])
              .map((a: any) => `A${a.id}`)
              .join(",")}`,
            href: `/jobs/${job.id}/assembly/${(assemblies || [])
              .map((a: any) => a.id)
              .join(",")}`,
          },
        ]
      : [
          { label: "Jobs", href: "/jobs" },
          { label: `Job ${job.id}`, href: `/jobs/${job.id}` },
          {
            label: `Assembly ${primaryAssembly?.id ?? ""}`,
            href: `/jobs/${job.id}/assembly/${primaryAssembly?.id ?? ""}`,
          },
        ];
    const actionsMenu =
      !isGroup && canDebug && primaryAssembly ? (
        <Menu withinPortal position="bottom-end" shadow="sm">
          <Menu.Target>
            <Button
              size="xs"
              variant="light"
              rightSection={<IconMenu2 size={14} />}
            >
              Actions
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconBug size={14} />}
              onClick={() => handleOpenDebug(primaryAssembly.id, job.id)}
            >
              Debug
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      ) : null;
    const groupBadge =
      !isGroup && primaryAssembly?.assemblyGroupId ? (
        <Group gap="xs">
          <Badge variant="light">
            Group G{primaryAssembly.assemblyGroupId}
          </Badge>
          <Button
            size="xs"
            variant="light"
            onClick={() => setGroupDrawerOpen(true)}
          >
            View group
          </Button>
        </Group>
      ) : null;
    return (
      <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
        <BreadcrumbSet breadcrumbs={breadcrumbs} />
        <Group gap="sm" align="center">
          {whiteboardControl}
          {statusControls}
          {groupBadge}
          {actionsMenu}
        </Group>
      </Group>
    );
  };
  if (isGroup) {
    const quantityItems = (data.quantityItems || []) as any[];
    return (
      <Stack gap="lg">
        <AssembliesEditor
          job={job as any}
          assemblies={assemblies as any}
          quantityItems={quantityItems as any}
          priceMultiplier={1}
          costingStats={(costingStats || {}) as any}
          saveIntent="group.updateOrderedBreakdown"
          stateChangeIntent="assembly.update.fromGroup"
          groupContext={{ jobId: job.id, groupId: 0 }}
          products={products as any}
          activities={activities as any}
          activityConsumptionMap={activityConsumptionMap as any}
          packActivityReferences={data.packActivityReferences as any}
          assemblyTypeOptions={(assemblyTypes || []).map(
            (t: any) => t.label || ""
          )}
          defectReasons={data.defectReasons as any}
          renderStatusBar={renderStatusBar}
          packContext={data.packContext as any}
          primaryCostingIdByAssembly={data.primaryCostingIdByAssembly as any}
          rollupsByAssembly={data.rollupsByAssembly as any}
          vendorOptionsByStep={data.vendorOptionsByStep as any}
        />
      </Stack>
    );
  }

  const assembly = assemblies[0] as any;
  // Single assembly view previously tried to destructure a top-level `costings` that
  // the loader never provided (loader only returns `assemblies` with nested `costings`).
  // This caused the costings table to render empty for single assembly while group view worked.
  // Treat single assembly as a degenerate group: rely on `assembly.costings` like group mode.
  return (
    <Stack gap="lg">
      <AssembliesEditor
        job={job as any}
        assemblies={
          [
            {
              ...assembly,
              // Pull nested costings directly off the assembly (loader includes them)
              costings: ((assembly as any).costings || []) as any,
              qtyOrderedBreakdown: (assembly as any).qtyOrderedBreakdown || [],
              c_qtyOrdered: (assembly as any).c_qtyOrdered ?? 0,
              c_qtyCut: (assembly as any).c_qtyCut ?? 0,
            },
          ] as any
        }
        quantityItems={data.quantityItems as any}
        priceMultiplier={
          Number((assembly.job as any)?.company?.priceMultiplier ?? 1) || 1
        }
        costingStats={costingStats as any}
        saveIntent="assembly.updateOrderedBreakdown"
        stateChangeIntent="assembly.update"
        products={products as any}
        activities={activities as any}
        activityConsumptionMap={activityConsumptionMap as any}
        packActivityReferences={data.packActivityReferences as any}
        assemblyTypeOptions={(assemblyTypes || []).map(
          (t: any) => t.label || ""
        )}
        activityVariantLabels={
          (assembly.variantSet?.variants?.length
            ? (assembly.variantSet.variants as any)
            : (productVariantSet?.variants as any)) || []
        }
        defectReasons={data.defectReasons as any}
        renderStatusBar={renderStatusBar}
        packContext={data.packContext as any}
        primaryCostingIdByAssembly={data.primaryCostingIdByAssembly as any}
        rollupsByAssembly={data.rollupsByAssembly as any}
        vendorOptionsByStep={data.vendorOptionsByStep as any}
      />
      <MaterialCoverageDetails
        assemblyId={assembly.id}
        coverage={coverageByAssembly.get(assembly.id) ?? null}
        toleranceDefaults={data.toleranceDefaults}
        toleranceAbs={assembly.materialCoverageToleranceAbs ?? null}
        tolerancePct={assembly.materialCoverageTolerancePct ?? null}
        onAcceptGap={handleAcceptGap}
        acceptingProductId={acceptGapTargetProductId}
        onTrimReservations={handleTrimReservations}
        trimmingLineId={trimmingLineId}
        onSettleReservations={handleSettleReservations}
        settlingProductId={settlingProductId}
        onUpdateTolerance={handleToleranceSave}
        onResetTolerance={handleToleranceReset}
        toleranceSaving={toleranceFetcher.state !== "idle"}
      />
      <DebugDrawer
        opened={!!debugTarget}
        onClose={() => setDebugTarget(null)}
        title={`Debug – A${debugTarget?.assemblyId ?? ""}`}
        payload={debugFetcher.data as any}
        loading={debugFetcher.state !== "idle"}
      />
      <Drawer
        opened={groupDrawerOpen}
        onClose={() => setGroupDrawerOpen(false)}
        title={`Group G${groupInfo?.id ?? ""}`}
        position="right"
        size="lg"
      >
        {groupInfo ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Coordination only. Assemblies remain separate for detail and edits.
            </Text>
            <Table withTableBorder striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Assembly</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(groupInfo.assemblies || []).map((asm: any) => (
                  <Table.Tr key={asm.id}>
                    <Table.Td>A{asm.id}</Table.Td>
                    <Table.Td>{asm.name || "—"}</Table.Td>
                    <Table.Td>{asm.status || "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            No group details available.
          </Text>
        )}
      </Drawer>
    </Stack>
  );
}
