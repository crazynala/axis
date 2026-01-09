import {
  BreadcrumbSet,
  useGlobalFormContext,
  useInitGlobalFormContext,
} from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import {
  Button,
  Card,
  Code,
  Menu,
  ActionIcon,
  Anchor,
  TagsInput,
  Select,
  SegmentedControl,
  Grid,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Modal,
  Tabs,
  Tooltip,
  Text as MantineText,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconBug, IconMenu2, IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useMatches,
  useSubmit,
} from "@remix-run/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getMovementLabel } from "~/utils/movementLabels";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { AxisChip } from "~/components/AxisChip";
import { computeProductValidation } from "~/modules/product/validation/computeProductValidation";
import { productSpec } from "~/modules/product/spec";
import { StateChangeButton } from "~/base/state/StateChangeButton";
// BOM spreadsheet moved to full-page route: /products/:id/bom
import { ProductPickerModal } from "~/modules/product/components/ProductPickerModal";
import { useRecordContext } from "~/base/record/RecordContext";
import {
  InventoryAmendmentModal,
  type BatchRowLite,
} from "~/components/InventoryAmendmentModal";
import {
  InventoryTransferModal,
  type BatchOption,
} from "~/components/InventoryTransferModal";
import { JumpLink } from "~/components/JumpLink";
import {
  buildProductEditDefaults,
  useProductFindify,
} from "~/modules/product/findify/productFindify";
import { ProductDetailForm } from "../components/ProductDetailForm";
import { productStageConfig } from "~/modules/product/configs/productStageConfig";

import { ProductFindManager } from "../components/ProductFindManager";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
  getSavedIndexSearch,
} from "~/hooks/useNavLocation";
import { DebugDrawer } from "~/modules/debug/components/DebugDrawer";
import {
  FormStateDebugPanel,
  buildFormStateDebugData,
  buildFormStateDebugText,
} from "~/base/debug/FormStateDebugPanel";
import { loadProductDetailVM } from "~/modules/product/services/productDetailVM.server";
import { handleProductDetailAction } from "~/modules/product/services/productDetailActions.server";

// BOM spreadsheet modal removed; see /products/:id/bom page

const PRODUCT_DELETE_PHRASE = "LET'S DO IT";
const UNSAVED_CHANGES_TOOLTIP =
  "You have unsaved changes. Save or Discard to continue.";
const fmtDate = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

type BomDraftRow = {
  id?: number;
  tempId?: string;
  childId?: number | null;
  childSku?: string | null;
  childName?: string | null;
  childType?: string | null;
  supplierName?: string | null;
  quantity?: number | null;
  activityUsed?: string | null;
  deleted?: boolean;
};

export async function loader({ params, request }: LoaderFunctionArgs) {
  return loadProductDetailVM({ params, request });
}

export async function action({ request, params }: ActionFunctionArgs) {
  return handleProductDetailAction({ request, params } as any);
}

// Client-only helper to wire the global form context with stable callbacks
function GlobalFormInit({
  form,
  onSave,
  onReset,
  formInstanceId,
}: {
  form: any;
  onSave: (values: any) => void;
  onReset?: () => void;
  formInstanceId?: string;
}) {
  const resetForm = useCallback(() => form.reset(), [form]);
  // Call the timber hook with stable callbacks
  useInitGlobalFormContext(form as any, onSave, onReset ?? resetForm, {
    formInstanceId,
  });
  return null;
}

function DeferredGlobalFormInit({
  form,
  onSave,
  onReset,
  formInstanceId,
}: {
  form: any;
  onSave: (values: any) => void;
  onReset: () => void;
  formInstanceId?: string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  // 2025-12-24: keep the hook call unconditional within a mounted child.
  // This preserves the original "defer until after mount" intent while
  // avoiding hook-order violations now that timber's hook uses router hooks.
  return (
    <GlobalFormInit
      form={form}
      onSave={onSave}
      onReset={onReset}
      formInstanceId={formInstanceId}
    />
  );
}

function useImmediateActionDisabledReason() {
  const { isDirty } = useGlobalFormContext();
  return isDirty ? UNSAVED_CHANGES_TOOLTIP : null;
}

export default function ProductDetailRoute() {
  // Persist last visited product detail path for module restoration (include search for tab states)
  useRegisterNavLocation({ includeSearch: true, moduleKey: "products" });
  // Keep index search cached; detail route should not overwrite index search so we call persist here only when user returns to index later.
  // This hook is safe on detail; it only acts if pathname === /products
  usePersistIndexSearch("/products");
  const {
    product,
    metadataDefinitions,
    metadataValuesByKey,
    stockByLocation,
    stockByBatch,
    productChoices,
    movements,
    movementHeaders,
    locationNameById,
    salePriceGroups,
    usedInProducts,
    costingAssemblies,
    hasCmtLine,
    pricingSpecOptions,
    pricingSpecRangesById,
    categoryLabel,
    subCategoryLabel,
    subCategoryOptions,
    shipmentLines,
    effectivePricingModel,
    pricingModelLabel,
    userLevel,
    canDebug,
  } = useLoaderData<typeof loader>();
  const editFormInstanceIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `product-edit-${crypto.randomUUID()}`
      : `product-edit-${Math.random().toString(36).slice(2, 10)}`
  );
  const findFormInstanceIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `product-find-${crypto.randomUUID()}`
      : `product-find-${Math.random().toString(36).slice(2, 10)}`
  );
  const matches = useMatches();
  const rootData = matches.find((m) => m.id === "root")?.data as
    | { userLevel?: string | null }
    | undefined;
  const effectiveUserLevel = userLevel ?? rootData?.userLevel ?? null;
  const isAdminUser =
    !effectiveUserLevel || String(effectiveUserLevel) === "Admin";
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const { isDirty: globalIsDirty, formInstanceId: globalFormInstanceId } =
    useGlobalFormContext();
  const immediateActionDisabledReason = useImmediateActionDisabledReason();
  const immediateActionDisabled = Boolean(immediateActionDisabledReason);
  const pendingSaveRef = useRef<number | null>(null);
  const [lastSaveAt, setLastSaveAt] = useState<string | null>(null);
  const [lastDiscardAt, setLastDiscardAt] = useState<string | null>(null);
  const [lastResetAt, setLastResetAt] = useState<string | null>(null);
  const [lastResetReason, setLastResetReason] = useState<
    "saveOk" | "discard" | "loaderRefresh" | null
  >(null);
  const [lastChange, setLastChange] = useState<{
    name: string | null;
    type: string | null;
    at: string | null;
  } | null>(null);
  const [lastResetOptions, setLastResetOptions] = useState<Record<
    string,
    any
  > | null>(null);
  const [lastSaveStatus, setLastSaveStatus] = useState<
    "idle" | "pending" | "ok" | "error"
  >("idle");
  const [watchEnabled, setWatchEnabled] = useState(false);
  useEffect(() => {
    if (!actionData || typeof actionData !== "object") return;
    const error = (actionData as any).error;
    if (!error) return;
    notifications.show({
      color: "red",
      title: "Save failed",
      message: String(error),
    });
  }, [actionData]);
  const debugFetcher = useFetcher();
  const [debugOpen, setDebugOpen] = useState(false);
  const stockDebugFetcher = useFetcher();
  const [stockDebugRequested, setStockDebugRequested] = useState(false);
  // Sync RecordContext currentId for global navigation consistency
  const { setCurrentId } = useRecordContext();
  useEffect(() => {
    setCurrentId(product.id, "restore");
    // Do NOT clear on unmount; preserve selection like invoices module
  }, [product.id, setCurrentId]);
  useEffect(() => {
    if (!debugOpen) setStockDebugRequested(false);
  }, [debugOpen]);
  // Prev/Next hotkeys handled globally in RecordProvider
  const submit = useSubmit();
  const loadStockDebug = useCallback(() => {
    const qs = new URLSearchParams();
    qs.set("limit", "200");
    stockDebugFetcher.load(
      `/api/debug/products/${product.id}/stock?${qs.toString()}`
    );
  }, [product.id, stockDebugFetcher]);

  const stockDebugText = useMemo(() => {
    const data = stockDebugFetcher.data as any;
    if (!data) return "";
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [stockDebugFetcher.data]);

  const StockSnapshotTab = ({ active }: { active: boolean }) => {
    useEffect(() => {
      if (!debugOpen || !active || stockDebugRequested) return;
      setStockDebugRequested(true);
      loadStockDebug();
    }, [active, debugOpen, stockDebugRequested, loadStockDebug]);
    if (stockDebugFetcher.state === "loading" && !stockDebugFetcher.data) {
      return (
        <Text size="sm" c="dimmed">
          Loading…
        </Text>
      );
    }
    const data = stockDebugFetcher.data as any;
    if (stockDebugRequested && (!data || !data.context)) {
      return (
        <Text size="sm" c="red.7">
          Failed to load stock snapshot debug.
        </Text>
      );
    }
    if (!data) {
      return (
        <Text size="sm" c="dimmed">
          Select this tab to load stock snapshot debug.
        </Text>
      );
    }
    return (
      <ScrollArea h={400}>
        <Code block>{stockDebugText}</Code>
      </ScrollArea>
    );
  };

  // Findify hook (forms, mode, style, helpers) – pass nav for auto-exit
  const { editForm, findForm, buildUpdatePayload } = useProductFindify(
    product,
    nav,
    metadataDefinitions
  );
  const editFormInstanceId = editFormInstanceIdRef.current;
  const findFormInstanceId = findForm ? findFormInstanceIdRef.current : null;
  const applyReset = useCallback(
    (values: any, reason: "saveOk" | "discard" | "loaderRefresh") => {
      const options = {
        keepDirty: false,
        keepTouched: false,
        keepErrors: false,
        keepDirtyValues: false,
        keepDefaultValues: false,
      };
      editForm.reset(values, options);
      editForm.clearErrors();
      if (reason === "saveOk") {
        queueMicrotask(() => {
          editForm.reset(values, options);
          editForm.clearErrors();
        });
      }
      setLastResetAt(new Date().toISOString());
      setLastResetReason(reason);
      setLastResetOptions(options);
    },
    [editForm]
  );
  useEffect(() => {
    applyReset(
      buildProductEditDefaults(product, metadataDefinitions),
      "loaderRefresh"
    );
  }, [applyReset, product, metadataDefinitions]);

  useEffect(() => {
    if (lastResetReason !== "saveOk") return;
    setWatchEnabled(true);
    const timer = setTimeout(() => setWatchEnabled(false), 1000);
    return () => clearTimeout(timer);
  }, [lastResetReason, lastResetAt]);

  useEffect(() => {
    if (!watchEnabled) return;
    const subscription = editForm.watch((_value, info) => {
      setLastChange({
        name: info?.name ?? null,
        type: info?.type ?? null,
        at: new Date().toISOString(),
      });
    });
    return () => subscription.unsubscribe();
  }, [editForm, watchEnabled]);

  //!!!!!!!!!!!!!!!
  useEffect(() => {
    const sub = editForm.watch((values, info) => {
      if (info?.name) {
        console.log(
          "[RHF watch]",
          info.name,
          info.type,
          values[info.name as keyof typeof values]
        );
      }
    });
    return () => sub.unsubscribe();
  }, [editForm]);
  useEffect(() => {
    console.log("[RHF isDirty]", editForm.formState.isDirty);
  }, [editForm.formState.isDirty]);

  // Find modal is handled via ProductFindManager now (no inline find toggle)

  // Only wire header Save/Cancel to the real edit form
  const [bomDraftRows, setBomDraftRows] = useState<BomDraftRow[]>([]);
  const resetBomDraftRows = useCallback(() => {
    const nextRows =
      (product.productLines || []).map((pl: any) => ({
        id: pl.id,
        childId: pl.childId ?? pl.child?.id ?? null,
        childSku: pl.child?.sku ?? null,
        childName: pl.child?.name ?? null,
        childType: pl.child?.type ?? null,
        supplierName: pl.child?.supplier?.name ?? null,
        quantity: pl.quantity ?? null,
        activityUsed: pl.activityUsed ?? null,
        deleted: false,
      })) || [];
    setBomDraftRows(nextRows);
  }, [product.productLines]);
  useEffect(() => {
    resetBomDraftRows();
  }, [product.id, resetBomDraftRows]);

  useEffect(() => {
    if (!pendingSaveRef.current) return;
    if (nav.state !== "idle") return;
    const actionError =
      actionData &&
      typeof actionData === "object" &&
      (actionData as any).intent === "update" &&
      (actionData as any).error;
    if (actionError) {
      setLastSaveStatus("error");
      pendingSaveRef.current = null;
      return;
    }
    pendingSaveRef.current = null;
    setLastSaveStatus("ok");
    setLastSaveAt(new Date().toISOString());
    applyReset(editForm.getValues(), "saveOk");
    resetBomDraftRows();
  }, [actionData, applyReset, editForm, nav.state, resetBomDraftRows]);

  const visibleBomRows = useMemo(
    () => bomDraftRows.filter((row) => !row.deleted),
    [bomDraftRows]
  );

  const buildBomBatchFromDraft = useCallback(() => {
    const originalById = new Map<number, any>(
      (product.productLines || []).map((pl: any) => [Number(pl.id), pl])
    );
    const creates: Array<{
      childSku: string;
      quantity?: number;
      activityUsed?: string | null;
    }> = [];
    const updates: Array<{
      id: number;
      quantity?: number;
      activityUsed?: string | null;
    }> = [];
    const deletes: number[] = [];

    for (const row of bomDraftRows) {
      if (row.deleted) {
        if (row.id != null) deletes.push(Number(row.id));
        continue;
      }
      if (row.id != null) {
        const original = originalById.get(Number(row.id));
        if (!original) continue;
        const nextQty = Number(row.quantity ?? 0) || 0;
        const prevQty = Number(original.quantity ?? 0) || 0;
        const nextActivity = (row.activityUsed || "").trim() || null;
        const prevActivity = (original.activityUsed || "").trim() || null;
        if (nextQty !== prevQty || nextActivity !== prevActivity) {
          updates.push({
            id: Number(row.id),
            quantity: nextQty,
            activityUsed: nextActivity,
          });
        }
        continue;
      }
      const childSku = (row.childSku || "").trim();
      if (!childSku) continue;
      creates.push({
        childSku,
        quantity: Number(row.quantity ?? 0) || 0,
        activityUsed: (row.activityUsed || "").trim() || null,
      });
    }

    return { creates, updates, deletes };
  }, [bomDraftRows, product.productLines]);

  const bomDraftSummary = useMemo(() => {
    const batch = buildBomBatchFromDraft();
    return {
      draftDirty:
        batch.creates.length + batch.updates.length + batch.deletes.length > 0,
      draftRowCount: bomDraftRows.length,
      creates: batch.creates.length,
      updates: batch.updates.length,
      deletes: batch.deletes.length,
    };
  }, [buildBomBatchFromDraft, bomDraftRows.length]);

  const saveUpdate = useCallback(
    (values: any) => {
      pendingSaveRef.current = Date.now();
      setLastSaveStatus("pending");
      const updatePayload = buildUpdatePayload(values);
      const bomBatch = buildBomBatchFromDraft();
      if (
        bomBatch.creates.length ||
        bomBatch.updates.length ||
        bomBatch.deletes.length
      ) {
        updatePayload.set("bomCreates", JSON.stringify(bomBatch.creates));
        updatePayload.set("bomUpdates", JSON.stringify(bomBatch.updates));
        updatePayload.set("bomDeletes", JSON.stringify(bomBatch.deletes));
      }
      console.log("Saving with payload", updatePayload);
      submit(updatePayload, { method: "post" });
    },
    [buildUpdatePayload, buildBomBatchFromDraft, submit]
  );
  // Defer initialization to avoid HMR race where provider isn't ready yet
  // useInitGlobalFormContext(editForm as any, saveUpdate, () => editForm.reset());

  const [pickerOpen, setPickerOpen] = useState(false);
  // BOM spreadsheet modal removed (now a dedicated full-page route)

  const handleBomDelete = useCallback(
    (line: BomDraftRow) => {
      setBomDraftRows((rows) => {
        if (line.id == null) {
          return rows.filter((r) => r.tempId !== line.tempId);
        }
        return rows.map((r) =>
          r.id === line.id ? { ...r, deleted: true } : r
        );
      });
      editForm.setValue("bomDirty", String(Date.now()), { shouldDirty: true });
    },
    [editForm]
  );
  const [pickerSearch, setPickerSearch] = useState("");
  const [assemblyItemOnly, setAssemblyItemOnly] = useState(false);
  // Movements view: header-level ProductMovement vs line-level ProductMovementLine
  const [movementView, setMovementView] = useState<"header" | "line">("line");
  const [showAllMovements, setShowAllMovements] = useState(false);
  const [movementDetailId, setMovementDetailId] = useState<number | null>(null);
  const movementActionFetcher = useFetcher();
  const shipmentLookupFetcher = useFetcher<{ shipmentLine?: any }>();
  const [pendingDeleteMovementId, setPendingDeleteMovementId] = useState<
    number | null
  >(null);
  const [movementDeleteInput, setMovementDeleteInput] = useState("");
  const movementDeletePhrase = "ARE YOU SO SURE";
  useEffect(() => {
    // Collapse when navigating to a different product
    setShowAllMovements(false);
    setMovementDetailId(null);
    setPendingDeleteMovementId(null);
    setMovementDeleteInput("");
  }, [product.id]);
  useEffect(() => {
    setDeleteConfirmation("");
    setDeleteModalOpen(false);
  }, [product.id]);
  // Tags handled via global editForm (TagsInput in header)
  // Fetcher-based refresh for MV
  const refreshFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const { revalidate } = useRevalidator();
  useEffect(() => {
    if (refreshFetcher.state === "idle" && refreshFetcher.data) {
      if (refreshFetcher.data.ok) {
        notifications.show({
          color: "teal",
          title: "Stock refreshed",
          message: "Materialized view recalculation complete.",
        });
        revalidate();
      } else if (refreshFetcher.data.error) {
        notifications.show({
          color: "red",
          title: "Refresh failed",
          message: "Could not refresh stock view.",
        });
      }
    }
  }, [refreshFetcher.state, refreshFetcher.data, revalidate]);
  useEffect(() => {
    if (
      movementActionFetcher.state === "idle" &&
      movementActionFetcher.data &&
      (movementActionFetcher.data as any).ok
    ) {
      revalidate();
      setPendingDeleteMovementId(null);
      setMovementDeleteInput("");
    }
  }, [movementActionFetcher.state, movementActionFetcher.data, revalidate]);
  // Batch filters
  const [batchScope, setBatchScope] = useState<"all" | "current">("current");
  const [batchLocation, setBatchLocation] = useState<string>("all");
  const batchLocationOptions = useMemo(() => {
    const set = new Set<string>();
    (stockByBatch || []).forEach((row: any) => {
      const name =
        row.location_name ||
        (row.location_id ? `#${row.location_id}` : "(none)");
      // console.log("!! adding location name to set:", name);
      set.add(name);
    });
    const arr = Array.from(set);
    return [
      { value: "all", label: "All" },
      ...arr.map((n) => ({ value: n, label: n })),
    ];
  }, [stockByBatch]);
  const filteredBatches = useMemo(() => {
    return (stockByBatch || []).filter((row: any) => {
      const qty = Number(row.qty ?? 0);
      const name =
        row.location_name ||
        (row.location_id ? `#${row.location_id}` : "(none)");
      const scopeOk = batchScope === "all" || qty !== 0;
      const locOk = batchLocation === "all" || name === batchLocation;
      return scopeOk && locOk;
    });
  }, [stockByBatch, batchScope, batchLocation]);
  const filteredBatchRowsLite = useMemo<BatchRowLite[]>(() => {
    return filteredBatches.map((row: any) => ({
      batchId: Number(row.batch_id) || 0,
      locationId:
        row.location_id == null || row.location_id === ""
          ? null
          : Number(row.location_id),
      locationName:
        row.location_name ||
        (row.location_id ? String(row.location_id) : "(none)"),
      name: row.batch_name ?? null,
      codeMill: row.code_mill ?? null,
      codeSartor: row.code_sartor ?? null,
      qty: Number(row.qty || 0),
    }));
  }, [filteredBatches]);
  // console.log("!! filtered stockByBatch", filteredBatches);
  // Inventory modal state
  const [amendBatchOpen, setAmendBatchOpen] = useState(false);
  const [amendProductOpen, setAmendProductOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [activeBatch, setActiveBatch] = useState<any | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [batchEdit, setBatchEdit] = useState<{
    batchId: number;
    name?: string | null;
    codeMill?: string | null;
    codeSartor?: string | null;
  } | null>(null);
  const batchEditFormInstanceIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `product-batch-edit-${crypto.randomUUID()}`
      : `product-batch-edit-${Math.random().toString(36).slice(2, 10)}`
  );
  const batchEditForm = useForm<{
    name: string;
    codeMill: string;
    codeSartor: string;
  }>({
    defaultValues: {
      name: "",
      codeMill: "",
      codeSartor: "",
    },
  });
  const batchEditFetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    intent?: string;
  }>();
  const batchEditFormInstanceId = batchEditFormInstanceIdRef.current;
  const [batchEditSubmissionId, setBatchEditSubmissionId] = useState<
    number | null
  >(null);
  const [batchEditError, setBatchEditError] = useState<string | null>(null);
  const closeBatchEdit = useCallback(() => {
    setBatchEdit(null);
    batchEditForm.reset({ name: "", codeMill: "", codeSartor: "" });
    setBatchEditError(null);
    setBatchEditSubmissionId(null);
  }, [batchEditForm]);
  useEffect(() => {
    if (!batchEdit) return;
    batchEditForm.reset({
      name: batchEdit.name || "",
      codeMill: batchEdit.codeMill || "",
      codeSartor: batchEdit.codeSartor || "",
    });
    setBatchEditError(null);
  }, [batchEdit, batchEditForm]);
  useEffect(() => {
    if (batchEditSubmissionId == null) return;
    if (batchEditFetcher.state !== "idle") return;
    const data = batchEditFetcher.data;
    if (data?.ok) {
      closeBatchEdit();
      revalidate();
    } else if (data?.intent === "batch.editMeta") {
      setBatchEditError(data.error || "Unable to update batch.");
    }
    setBatchEditSubmissionId(null);
  }, [
    batchEditSubmissionId,
    batchEditFetcher.state,
    batchEditFetcher.data,
    closeBatchEdit,
    revalidate,
  ]);
  useEffect(() => {
    closeBatchEdit();
  }, [product.id, closeBatchEdit]);
  const filtered = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    let arr = productChoices as any[];
    if (q)
      arr = arr.filter((p) =>
        ((p.sku || "") + " " + (p.name || "")).toLowerCase().includes(q)
      );
    if (assemblyItemOnly)
      arr = arr.filter((p) => (p._count?.productLines ?? 0) === 0);
    return arr;
  }, [productChoices, pickerSearch, assemblyItemOnly]);
  const handleBatchEditSubmit = batchEditForm.handleSubmit((values) => {
    if (!batchEdit) return;
    const fd = new FormData();
    fd.set("_intent", "batch.editMeta");
    fd.set("batchId", String(batchEdit.batchId));
    fd.set("name", values.name ?? "");
    fd.set("codeMill", values.codeMill ?? "");
    fd.set("codeSartor", values.codeSartor ?? "");
    setBatchEditError(null);
    setBatchEditSubmissionId(Date.now());
    batchEditFetcher.submit(fd, { method: "post" });
  });
  const batchEditBusy = batchEditFetcher.state !== "idle";

  // Normalize arrays/records for safe rendering across loader branches
  const lines = useMemo(
    () => ((movements as any[]) || []).filter(Boolean),
    [movements]
  );
  const deletePhrase = PRODUCT_DELETE_PHRASE;
  const normalizedDeleteInput = deleteConfirmation
    .replace(/\u2019/g, "'")
    .trim();
  const deleteReady = normalizedDeleteInput === deletePhrase;
  const deleteActionResult =
    actionData &&
    typeof actionData === "object" &&
    (actionData as any).intent === "delete"
      ? (actionData as { intent: string; error?: string })
      : null;
  const deleteError = deleteActionResult?.error;
  const headers = useMemo(
    () => ((movementHeaders as any[]) || []).filter(Boolean),
    [movementHeaders]
  );
  const locById = useMemo(
    () => (locationNameById as any as Record<number | string, string>) || {},
    [locationNameById]
  );
  const movementDetail = useMemo(() => {
    if (!movementDetailId) return null;
    const header =
      headers.find((h: any) => Number(h.id) === Number(movementDetailId)) ||
      null;
    const movementLinesForMovement = lines.filter(
      (l: any) => Number(l?.movement?.id) === Number(movementDetailId)
    );
    const movement =
      header ||
      movementLinesForMovement[0]?.movement ||
      (header as any) ||
      null;
    return {
      movement,
      lines: movementLinesForMovement,
    };
  }, [headers, lines, movementDetailId]);
  const detailMovement = movementDetail?.movement ?? null;
  const detailLines = movementDetail?.lines ?? [];
  const shipmentLineById = useMemo(() => {
    const map = new Map<number, any>();
    (shipmentLines || []).forEach((sl: any) => {
      if (sl?.id != null) map.set(Number(sl.id), sl);
    });
    return map;
  }, [shipmentLines]);
  const detailShipment = useMemo(() => {
    if (!detailMovement) return null;
    const movementSid = Number((detailMovement as any)?.shippingLineId);
    if (Number.isFinite(movementSid) && shipmentLineById.has(movementSid)) {
      return shipmentLineById.get(movementSid);
    }
    return null;
  }, [detailMovement, shipmentLineById]);
  useEffect(() => {
    if (!detailMovement) return;
    if (detailShipment) return;
    const movementSid = Number((detailMovement as any)?.shippingLineId);
    if (!Number.isFinite(movementSid)) return;
    shipmentLookupFetcher.submit(
      {
        _intent: "movement.lookupShipment",
        movementId: String(detailMovement.id),
      },
      { method: "post" }
    );
  }, [detailMovement, detailShipment, shipmentLookupFetcher]);
  const detailShipmentFromFetcher =
    shipmentLookupFetcher.data?.shipmentLine ?? null;
  const assemblies =
    ((product as any)?.assemblies as any[])?.filter(Boolean) || [];
  const bomParents =
    (usedInProducts || []).map((pl: any) => pl.parent).filter(Boolean) || [];
  const costingAsm =
    (costingAssemblies || [])
      .map((c: any) => c.assembly)
      .filter((a: any) => a && a.id != null) || [];
  const handleDeleteMovement = useCallback(
    (movementId: number | null | undefined) => {
      if (!movementId || !isAdminUser) return;
      const fd = new FormData();
      fd.set("_intent", "movement.delete");
      fd.set("movementId", String(movementId));
      movementActionFetcher.submit(fd, { method: "post" });
    },
    [isAdminUser, movementActionFetcher]
  );
  const showInstances =
    assemblies.length > 0 || bomParents.length > 0 || costingAsm.length > 0;
  const [focusMissingRequired, setFocusMissingRequired] = useState<
    (() => void) | null
  >(null);
  const requiredIndicatorMode: "inline" | "chips" = "inline";
  const hasMovements = lines.length > 0;

  const watched = useWatch({ control: editForm.control }) as Record<string, any>;
  const stockTrackingEnabled = Boolean(
    watched?.stockTrackingEnabled ?? product.stockTrackingEnabled
  );
  const batchTrackingEnabled = Boolean(
    watched?.batchTrackingEnabled ?? product.batchTrackingEnabled
  );
  const trackingDisabledReason = !stockTrackingEnabled
    ? "Tracking is OFF"
    : null;
  const batchActionDisabledReason = !stockTrackingEnabled
    ? "Tracking is OFF"
    : !batchTrackingEnabled
    ? "Batch tracking is OFF"
    : null;
  const mutationDisabledReason =
    trackingDisabledReason || immediateActionDisabledReason;
  const focusField = useCallback(
    (fieldName?: string | null) => {
      if (!fieldName) return;
      try {
        editForm.setFocus(fieldName as any);
        const el = document?.querySelector?.(
          `[name="${fieldName}"]`
        ) as HTMLElement | null;
        if (el?.scrollIntoView) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } catch {}
    },
    [editForm]
  );
  const focusTrackingStatus = useCallback(() => {
    const el = document.getElementById("product-tracking-status");
    if (el?.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);
  const validation = useMemo(
    () =>
      computeProductValidation({
        type: watched?.type ?? product.type,
        sku: watched?.sku ?? product.sku,
        name: watched?.name ?? product.name,
        categoryId: watched?.categoryId ?? product.categoryId,
        templateId: watched?.templateId ?? product.templateId,
        supplierId: watched?.supplierId ?? product.supplierId,
        customerId: watched?.customerId ?? product.customerId,
        variantSetId: watched?.variantSetId ?? product.variantSetId,
        pricingModel: watched?.pricingModel ?? product.pricingModel,
        pricingSpecId: watched?.pricingSpecId ?? product.pricingSpecId,
        baselinePriceAtMoq:
          watched?.baselinePriceAtMoq ?? product.baselinePriceAtMoq,
        costPrice: watched?.costPrice ?? product.costPrice,
        leadTimeDays: watched?.leadTimeDays ?? product.leadTimeDays,
        externalStepType:
          watched?.externalStepType ?? product.externalStepType ?? null,
      }),
    [watched, product]
  );
  const warnings = useMemo(
    () =>
      productSpec.warnings.buildProductWarnings({
        type: watched?.type ?? product.type,
        sku: watched?.sku ?? product.sku,
        name: watched?.name ?? product.name,
        categoryId: watched?.categoryId ?? product.categoryId,
        templateId: watched?.templateId ?? product.templateId,
        supplierId: watched?.supplierId ?? product.supplierId,
        customerId: watched?.customerId ?? product.customerId,
        variantSetId: watched?.variantSetId ?? product.variantSetId,
        costPrice: watched?.costPrice ?? product.costPrice,
        leadTimeDays: watched?.leadTimeDays ?? product.leadTimeDays,
        externalStepType:
          watched?.externalStepType ?? product.externalStepType ?? null,
        stockTrackingEnabled,
        batchTrackingEnabled,
        hasCmtLine: hasCmtLine ?? undefined,
      }),
    [watched, product, stockTrackingEnabled, batchTrackingEnabled, hasCmtLine]
  );
  const productStageValue = String(
    watched?.productStage ?? product.productStage ?? "SETUP"
  );
  const isLoudMode = productStageValue === "SETUP";
  const productFieldCtx = useMemo(
    () => ({
      productStage: productStageValue,
      isLoudMode,
    }),
    [productStageValue, isLoudMode]
  );
  const handleStageChange = useCallback(
    (nextStage: string) => {
      editForm.setValue("productStage", nextStage, { shouldDirty: true });
      const fd = new FormData();
      fd.set("_intent", "product.updateStage");
      fd.set("productStage", nextStage);
      submit(fd, { method: "post" });
    },
    [editForm, submit]
  );
  const headerChips = useMemo(() => {
    const chips: Array<{
      tone: "warning" | "info" | "neutral";
      label: string;
      tooltip: string;
      onClick?: () => void;
    }> = [];
    for (const warning of warnings) {
      if (warning.code === "field_missing") {
        chips.push({
          tone: "warning",
          label: warning.label,
          tooltip: `Missing required: ${validation.missingRequired.join(", ")}`,
          onClick: focusMissingRequired || undefined,
        });
        continue;
      }
      if (
        warning.code === "enable_stock" ||
        warning.code === "stock_tracking_off"
      ) {
        chips.push({
          tone: warning.severity === "info" ? "info" : "warning",
          label: warning.label,
          tooltip:
            warning.severity === "info"
              ? "Stock tracking is optional for this product type."
              : "Stock tracking is required for this product type.",
          onClick: focusTrackingStatus,
        });
        continue;
      }
      if (
        warning.code === "enable_batch" ||
        warning.code === "batch_tracking_off"
      ) {
        chips.push({
          tone: warning.severity === "info" ? "info" : "warning",
          label: warning.label,
          tooltip:
            warning.severity === "info"
              ? "Batch tracking is optional for this product type."
              : "Batch tracking is required for this product type.",
          onClick: focusTrackingStatus,
        });
        continue;
      }
      if (warning.code === "no_cmt_on_bom") {
        chips.push({
          tone: warning.severity === "info" ? "info" : "warning",
          label: warning.label,
          tooltip: "Finished products should include a CMT line on the BOM.",
        });
      }
    }
    return chips;
  }, [
    warnings,
    validation.missingRequired,
    focusMissingRequired,
    focusTrackingStatus,
  ]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center" wrap="wrap">
        <Group gap="xs" align="center" wrap="wrap">
          {(() => {
            const appendHref = useFindHrefAppender();
            const saved = getSavedIndexSearch("/products");
            const hrefProducts = saved
              ? `/products${saved}`
              : appendHref("/products");
            return (
              <BreadcrumbSet
                breadcrumbs={[
                  { label: "Products", href: hrefProducts },
                  {
                    label: String(product.id),
                    href: appendHref(`/products/${product.id}`),
                  },
                ]}
              />
            );
          })()}
          {headerChips.length ? (
            <Group gap="xs" align="center" wrap="wrap">
              {headerChips.map((chip) => (
                <Tooltip
                  key={chip.label}
                  label={chip.tooltip}
                  withArrow
                  multiline
                  maw={260}
                  position="bottom"
                >
                  <AxisChip
                    tone={chip.tone}
                    onClick={chip.onClick}
                    style={chip.onClick ? { cursor: "pointer" } : undefined}
                  >
                    {chip.label}
                  </AxisChip>
                </Tooltip>
              ))}
            </Group>
          ) : null}
        </Group>
        <Group
          gap="xs"
          style={{ minWidth: 200, maxWidth: 520, flex: 1 }}
          justify="flex-end"
        >
          <StateChangeButton
            value={productStageValue}
            defaultValue={productStageValue}
            onChange={handleStageChange}
            disabled={editForm.formState.isDirty}
            config={productStageConfig}
          />
          <div style={{ minWidth: 180, maxWidth: 260, width: 220 }}>
            <Controller
              control={editForm.control as any}
              name={"whiteboard" as any}
              render={({ field }) => (
                <Textarea
                  placeholder="Whiteboard"
                  autosize
                  minRows={1}
                  maxRows={3}
                  value={field.value || ""}
                  onChange={(e) => field.onChange(e.currentTarget.value)}
                />
              )}
            />
          </div>
          <div style={{ minWidth: 220, maxWidth: 360, width: 240 }}>
            <Controller
              control={editForm.control as any}
              name={"tagNames" as any}
              render={({ field }) => (
                <TagsInput
                  placeholder="Add tags"
                  value={field.value || []}
                  onChange={(vals) => field.onChange(vals)}
                  clearable
                />
              )}
            />
          </div>
          <Menu withinPortal position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                size="lg"
                aria-label="Product actions"
              >
                <IconMenu2 size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component={Link} to="/products/new">
                New Product
              </Menu.Item>
              <Tooltip
                label={immediateActionDisabledReason}
                disabled={!immediateActionDisabled}
                withArrow
                position="left"
              >
                <span>
                  <Menu.Item
                    disabled={immediateActionDisabled}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("_intent", "product.duplicate");
                      submit(fd, { method: "post" });
                    }}
                  >
                    Duplicate Product
                  </Menu.Item>
                </span>
              </Tooltip>
              {canDebug ? (
                <Menu.Item
                  leftSection={<IconBug size={14} />}
                  onClick={() => {
                    setDebugOpen(true);
                    debugFetcher.load(`/products/${product.id}/debug`);
                  }}
                >
                  Debug
                </Menu.Item>
              ) : null}
              <Tooltip
                label={immediateActionDisabledReason}
                disabled={!immediateActionDisabled}
                withArrow
                position="left"
              >
                <span>
                  <Menu.Item
                    disabled={immediateActionDisabled}
                    onClick={() =>
                      refreshFetcher.submit(
                        { _intent: "stock.refresh" },
                        { method: "post" }
                      )
                    }
                  >
                    Refresh Stock View
                  </Menu.Item>
                </span>
              </Tooltip>
              <Tooltip
                label={immediateActionDisabledReason}
                disabled={!immediateActionDisabled}
                withArrow
                position="left"
              >
                <span>
                  <Menu.Item
                    color="red"
                    disabled={immediateActionDisabled}
                    onClick={() => {
                      setDeleteConfirmation("");
                      setDeleteModalOpen(true);
                    }}
                  >
                    Delete Product
                  </Menu.Item>
                </span>
              </Tooltip>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      {product.flagIsDisabled ? (
        <Card withBorder padding="xs" bg="red.1">
          <Group gap="xs" align="center" wrap="wrap">
            <Text fw={700} c="red.7">
              DISABLED
            </Text>
            <Text size="sm" c="red.7">
              This product is disabled and should not be used for new work.
            </Text>
          </Group>
        </Card>
      ) : null}
      <MantineText size="xs" c="dimmed">
        {(() => {
          const ts = fmtDate(product.updatedAt || product.modifiedAt);
          if (!ts) return null;
          const by = (product.modifiedBy || product.updatedBy || "").trim();
          return by ? `Last updated ${ts} by ${by}` : `Last updated ${ts}`;
        })()}
      </MantineText>
      {immediateActionDisabled ? (
        <MantineText size="xs" c="orange.7">
          {UNSAVED_CHANGES_TOOLTIP}
        </MantineText>
      ) : null}
      <ProductFindManager metadataDefinitions={metadataDefinitions} />
      {(() => {
        const debugDefaults = buildProductEditDefaults(
          product,
          metadataDefinitions
        );
        const dirtySources = {
          rhf: {
            isDirty: editForm.formState.isDirty,
            dirtyFieldsCount: Object.keys(editForm.formState.dirtyFields || {})
              .length,
            touchedFieldsCount: Object.keys(
              editForm.formState.touchedFields || {}
            ).length,
            submitCount: editForm.formState.submitCount,
            formInstanceId: editFormInstanceId,
          },
          global: {
            isDirty: globalIsDirty,
            formInstanceId: globalFormInstanceId,
          },
          bom: bomDraftSummary,
          sheets: {
            isDirty: null,
          },
          computed: {
            headerIsDirty: globalIsDirty,
          },
        };
        const saveSignals = {
          lastSaveAt,
          lastDiscardAt,
          lastResetAt,
          lastResetReason,
          lastResetOptions,
          lastSaveStatus,
          pendingSaveId: pendingSaveRef.current,
          lastChange,
        };
        const formInstances = {
          globalFormInstanceId,
          editFormInstanceId,
          findFormInstanceId,
          batchEditFormInstanceId,
          batchEditVisible: Boolean(batchEdit),
        };
        const globalIdMissing = !globalFormInstanceId;
        const assertions = {
          globalMatchesEdit: globalIdMissing
            ? null
            : Boolean(
                editFormInstanceId &&
                  globalFormInstanceId === editFormInstanceId
              ),
          globalIdMissing,
        };
        const debugData = buildFormStateDebugData({
          formId: `product-${product.id}`,
          formState: editForm.formState,
          values: editForm.getValues(),
          builderDefaults: debugDefaults,
          rhfDefaults: editForm.control?._defaultValues ?? null,
          rhfValues: editForm.control?._formValues ?? null,
          control: editForm.control,
        });
        const debugText = buildFormStateDebugText(debugData, true, {
          dirtySources,
          saveSignals,
          formInstances,
          assertions,
        });
        return (
          <>
            <DebugDrawer
              opened={debugOpen}
              onClose={() => setDebugOpen(false)}
              title={`Debug – Product ${product.id}`}
              payload={debugFetcher.data as any}
              loading={debugFetcher.state !== "idle"}
              formStateCopyText={debugText}
              extraTabs={
                canDebug
                  ? [
                      {
                        key: "stockSnapshot",
                        label: "Stock Snapshot",
                        render: ({ active }) => (
                          <StockSnapshotTab active={active} />
                        ),
                        copyText: stockDebugText,
                      },
                    ]
                  : []
              }
              formStatePanel={
                <FormProvider {...editForm}>
                  <FormStateDebugPanel
                    formId={`product-${product.id}`}
                    getDefaultValues={() => debugDefaults}
                    collapseLong
                    dirtySources={dirtySources}
                    saveSignals={saveSignals}
                    formInstances={formInstances}
                    assertions={assertions}
                  />
                </FormProvider>
              }
            />
          </>
        );
      })()}
      <Form id="product-form" method="post">
        {/* Isolate global form init into a dedicated child to reduce HMR churn */}
        <DeferredGlobalFormInit
          form={editForm as any}
          onSave={saveUpdate}
          onReset={() => {
            applyReset(
              buildProductEditDefaults(product, metadataDefinitions),
              "discard"
            );
            resetBomDraftRows();
            pendingSaveRef.current = null;
            setLastSaveStatus("idle");
            setLastDiscardAt(new Date().toISOString());
          }}
          formInstanceId={editFormInstanceId}
        />
        <ProductDetailForm
          mode={"edit" as any}
          form={editForm as any}
          product={product}
          fieldCtx={productFieldCtx}
          onSave={saveUpdate}
          metadataDefinitions={metadataDefinitions}
          validation={validation}
          onRegisterMissingFocus={setFocusMissingRequired}
          requiredIndicatorMode={requiredIndicatorMode}
          hasMovements={hasMovements}
          effectivePricingModel={effectivePricingModel}
          pricingModelLabel={pricingModelLabel}
          pricingSpecOptions={pricingSpecOptions || []}
          pricingSpecRangesById={pricingSpecRangesById || {}}
        />
      </Form>
      {/* Tags block removed; now handled by TagsInput in header and saved via global form */}
      {/* Bill of Materials (Finished products only) */}
      {product.type === "Finished" && (
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Group justify="space-between" align="center">
              <Group gap="sm" align="center">
                <Title order={4}>Bill of Materials</Title>
                <Button
                  size="xs"
                  variant="light"
                  component={Link}
                  to={`/products/${product.id}/bom-fullzoom`}
                >
                  Edit in Sheet
                </Button>
              </Group>
              <Button variant="light" onClick={() => setPickerOpen(true)}>
                Add Component
              </Button>
            </Group>
          </Card.Section>
          {visibleBomRows.length > 0 && (
            <Table striped withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>SKU</Table.Th>
                  <Table.Th>Product</Table.Th>
                  <Table.Th>Usage</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Supplier</Table.Th>
                  <Table.Th>Qty</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibleBomRows.map((row) => (
                  <Table.Tr key={row.id ?? row.tempId}>
                    <Table.Td>{row.id ?? "new"}</Table.Td>
                    <Table.Td>{row.childSku || ""}</Table.Td>
                    <Table.Td>
                      {row.childId ? (
                        <Link to={`/products/${row.childId}`}>
                          {row.childName || row.childId}
                        </Link>
                      ) : (
                        row.childId || ""
                      )}
                    </Table.Td>
                    <Table.Td>{row.activityUsed || ""}</Table.Td>
                    <Table.Td>{row.childType || ""}</Table.Td>
                    <Table.Td>{row.supplierName || ""}</Table.Td>
                    <Table.Td>{row.quantity}</Table.Td>
                    <Table.Td>
                      <Menu withinPortal position="bottom-end" shadow="md">
                        <Menu.Target>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            aria-label="BOM actions"
                          >
                            <IconMenu2 size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconTrash size={14} />}
                            color="red"
                            onClick={() => {
                              modals.openConfirmModal({
                                title: "Remove BOM line?",
                                children: (
                                  <Text size="sm">
                                    This will remove the line from the BOM.
                                  </Text>
                                ),
                                labels: { confirm: "OK", cancel: "Cancel" },
                                confirmProps: { color: "red" },
                                onConfirm: () => handleBomDelete(row),
                              });
                            }}
                          >
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      )}

      <Tabs defaultValue="stock" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="stock">Stock</Tabs.Tab>
          {showInstances ? (
            <Tabs.Tab value="instances">Instances</Tabs.Tab>
          ) : null}
        </Tabs.List>
        <Tabs.Panel value="stock" pt="md">
          {!stockTrackingEnabled ? (
            <Card withBorder padding="sm" mb="md">
              <Text size="sm" c="yellow.8">
                Stock tracking is OFF. Data below is legacy/read-only.
              </Text>
            </Card>
          ) : null}
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Stack>
                {/* Stock by Location + Batch (left) */}
                <Card withBorder padding="md" bg="transparent">
                  <Card.Section>
                    <Table highlightOnHover>
                      <Table.Tbody>
                        <Table.Tr>
                          <Table.Td>Total Stock</Table.Td>
                          <Table.Td>
                            <Title order={1}>
                              {Number(
                                (stockByLocation as any[])
                                  .reduce(
                                    (sum, r) => sum + Number(r.qty || 0),
                                    0
                                  )
                                  .toFixed(2)
                              )}
                            </Title>
                          </Table.Td>
                        </Table.Tr>
                        {(stockByLocation || []).map((row: any, i: number) => (
                          // Use composite key with index to avoid collisions when location_id is null/duplicate
                          <Table.Tr
                            key={`loc-${row.location_id ?? "none"}-${i}`}
                          >
                            <Table.Td>
                              {row.location_name ||
                                `${row.location_id ?? "(none)"}`}
                            </Table.Td>
                            <Table.Td>
                              {Number(row.qty ?? 0) === 0
                                ? ""
                                : Number(row.qty ?? 0)}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Card.Section>
                </Card>
                {/* Stock by Batch */}
                <Card withBorder padding="md" bg="transparent">
                  <Card.Section inheritPadding py="xs">
                    <Group justify="space-between" align="center" px={8} pb={6}>
                      <Title order={5}>Stock by Batch</Title>
                      <Group gap="sm" wrap="wrap">
                        <SegmentedControl
                          size="xs"
                          data={[
                            { label: "Current", value: "current" },
                            { label: "All", value: "all" },
                          ]}
                          value={batchScope}
                          onChange={(v) => setBatchScope(v as any)}
                        />
                        <Select
                          size="xs"
                          data={batchLocationOptions}
                          value={batchLocation}
                          onChange={(v) => setBatchLocation(v || "all")}
                          searchable
                          clearable={false}
                          w={200}
                        />
                        <Tooltip
                          label={batchActionDisabledReason}
                          disabled={
                            stockTrackingEnabled && batchTrackingEnabled
                          }
                          withArrow
                        >
                          <span>
                            <Button
                              size="xs"
                              variant="light"
                              disabled={
                                !stockTrackingEnabled || !batchTrackingEnabled
                              }
                              onClick={() => {
                                if (
                                  !stockTrackingEnabled ||
                                  !batchTrackingEnabled
                                )
                                  return;
                                const rows: BatchRowLite[] =
                                  filteredBatchRowsLite.map((r) => ({ ...r }));
                                setActiveBatch({ rows });
                                setAmendProductOpen(true);
                              }}
                            >
                              Amend All…
                            </Button>
                          </span>
                        </Tooltip>
                      </Group>
                    </Group>
                    {!batchTrackingEnabled ? (
                      <Text size="xs" c="dimmed" px={8}>
                        Batch tracking is OFF. Batch data is read-only.
                      </Text>
                    ) : null}
                  </Card.Section>
                  <Card.Section>
                    <Table withColumnBorders>
                      <Table.Thead fs="xs">
                        <Table.Tr>
                          {product.type === "Finished" ? (
                            <>
                              <Table.Th>Job</Table.Th>
                              <Table.Th>Assembly</Table.Th>
                            </>
                          ) : (
                            <>
                              <Table.Th>Codes</Table.Th>
                              <Table.Th>Location</Table.Th>
                              <Table.Th>Received</Table.Th>
                            </>
                          )}
                          <Table.Th>Qty</Table.Th>
                          <Table.Th></Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {filteredBatches.map((row: any) => (
                          // Batch id alone can repeat across locations; include location in key to ensure uniqueness
                          <Table.Tr
                            key={`batch-${row.batch_id}-${
                              row.location_id ?? "none"
                            }`}
                          >
                            {product.type === "Finished" ? (
                              <>
                                <Table.Td>
                                  {row.job_id ? (
                                    <JumpLink
                                      to={`/jobs/${row.job_id}`}
                                      label={`${
                                        row.job_project_code || "Job"
                                      } ${row.job_id}${
                                        row.job_name ? ` – ${row.job_name}` : ""
                                      }`}
                                    />
                                  ) : (
                                    ""
                                  )}
                                </Table.Td>
                                <Table.Td>
                                  {row.assembly_id ? (
                                    <JumpLink
                                      to={`/jobs/${row.job_id}/assembly/${row.assembly_id}`}
                                      label={
                                        row.assembly_name ||
                                        `A${row.assembly_id}`
                                      }
                                    />
                                  ) : (
                                    row.assembly_name || ""
                                  )}
                                </Table.Td>
                              </>
                            ) : (
                              <>
                                <Table.Td>
                                  {row.code_mill || row.code_sartor ? (
                                    <>
                                      {row.code_mill || ""}
                                      {row.code_sartor
                                        ? (row.code_mill ? " | " : "") +
                                          row.code_sartor
                                        : ""}
                                    </>
                                  ) : (
                                    `${row.batch_id}`
                                  )}
                                </Table.Td>

                                <Table.Td>
                                  {row.location_name ||
                                    (row.location_id
                                      ? `${row.location_id}`
                                      : "")}
                                </Table.Td>
                                <Table.Td>
                                  {row.received_at
                                    ? new Date(
                                        row.received_at
                                      ).toLocaleDateString()
                                    : ""}
                                </Table.Td>
                              </>
                            )}
                            <Table.Td>
                              {Number(row.qty ?? 0) === 0
                                ? ""
                                : Number(row.qty ?? 0)}
                            </Table.Td>
                            <Table.Td>
                              <Menu
                                withinPortal
                                position="bottom-end"
                                shadow="md"
                              >
                                <Menu.Target>
                                  <ActionIcon
                                    variant="subtle"
                                    size="sm"
                                    aria-label="Batch actions"
                                    disabled={
                                      !stockTrackingEnabled ||
                                      !batchTrackingEnabled
                                    }
                                  >
                                    <IconMenu2 size={16} />
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  <Tooltip
                                    label={batchActionDisabledReason}
                                    disabled={
                                      stockTrackingEnabled &&
                                      batchTrackingEnabled
                                    }
                                    withArrow
                                    position="left"
                                  >
                                    <span>
                                      <Menu.Item
                                        disabled={
                                          row.batch_id == null ||
                                          !stockTrackingEnabled ||
                                          !batchTrackingEnabled
                                        }
                                        onClick={() => {
                                          if (
                                            row.batch_id == null ||
                                            !stockTrackingEnabled ||
                                            !batchTrackingEnabled
                                          )
                                            return;
                                          setBatchEdit({
                                            batchId: Number(row.batch_id),
                                            name: row.batch_name ?? "",
                                            codeMill: row.code_mill ?? "",
                                            codeSartor: row.code_sartor ?? "",
                                          });
                                        }}
                                      >
                                        Edit details
                                      </Menu.Item>
                                    </span>
                                  </Tooltip>
                                  <Tooltip
                                    label={batchActionDisabledReason}
                                    disabled={
                                      stockTrackingEnabled &&
                                      batchTrackingEnabled
                                    }
                                    withArrow
                                    position="left"
                                  >
                                    <span>
                                      <Menu.Item
                                        disabled={
                                          !stockTrackingEnabled ||
                                          !batchTrackingEnabled
                                        }
                                        onClick={() => {
                                          if (
                                            !stockTrackingEnabled ||
                                            !batchTrackingEnabled
                                          )
                                            return;
                                          setActiveBatch(row);
                                          setAmendBatchOpen(true);
                                        }}
                                      >
                                        Amend
                                      </Menu.Item>
                                    </span>
                                  </Tooltip>
                                  <Tooltip
                                    label={batchActionDisabledReason}
                                    disabled={
                                      stockTrackingEnabled &&
                                      batchTrackingEnabled
                                    }
                                    withArrow
                                    position="left"
                                  >
                                    <span>
                                      <Menu.Item
                                        disabled={
                                          !stockTrackingEnabled ||
                                          !batchTrackingEnabled
                                        }
                                        onClick={() => {
                                          if (
                                            !stockTrackingEnabled ||
                                            !batchTrackingEnabled
                                          )
                                            return;
                                          setActiveBatch(row);
                                          setTransferOpen(true);
                                        }}
                                      >
                                        Transfer
                                      </Menu.Item>
                                    </span>
                                  </Tooltip>
                                </Menu.Dropdown>
                              </Menu>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Card.Section>
                </Card>
                {/* Modals */}
                <Modal
                  opened={deleteModalOpen}
                  onClose={() => {
                    setDeleteModalOpen(false);
                    setDeleteConfirmation("");
                  }}
                  title="Delete Product"
                  centered
                >
                  <Form method="post">
                    <Stack gap="sm">
                      <input type="hidden" name="_intent" value="delete" />
                      <Text size="sm" c="dimmed">
                        This action cannot be undone. Type the confirmation
                        phrase to proceed.
                      </Text>
                      <TextInput
                        name="confirmDelete"
                        label={`Type ${deletePhrase}`}
                        placeholder={deletePhrase}
                        value={deleteConfirmation}
                        onChange={(e) =>
                          setDeleteConfirmation(e.currentTarget.value)
                        }
                        autoComplete="off"
                      />
                      {deleteError ? (
                        <Text size="sm" c="red">
                          {deleteError}
                        </Text>
                      ) : null}
                      <Group justify="flex-end" gap="sm">
                        <Button
                          variant="default"
                          type="button"
                          onClick={() => {
                            setDeleteModalOpen(false);
                            setDeleteConfirmation("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          color="red"
                          type="submit"
                          disabled={!deleteReady || busy}
                          loading={busy}
                        >
                          Delete
                        </Button>
                      </Group>
                    </Stack>
                  </Form>
                </Modal>
                <Modal
                  opened={!!batchEdit}
                  onClose={closeBatchEdit}
                  title="Edit Batch Details"
                  centered
                  size="sm"
                >
                  {batchEdit ? (
                    <form onSubmit={handleBatchEditSubmit}>
                      <Stack gap="sm">
                        <TextInput
                          label="Batch name"
                          placeholder="Optional display name"
                          {...batchEditForm.register("name")}
                        />
                        <TextInput
                          label="Mill code"
                          placeholder="Enter mill code"
                          {...batchEditForm.register("codeMill")}
                        />
                        <TextInput
                          label="Sartor code"
                          placeholder="Enter Sartor code"
                          {...batchEditForm.register("codeSartor")}
                        />
                        <Text size="sm" c="dimmed">
                          Batch ID: {batchEdit.batchId}
                        </Text>
                        {batchEditError ? (
                          <Text size="sm" c="red">
                            {batchEditError}
                          </Text>
                        ) : null}
                        <Group justify="flex-end" gap="sm">
                          <Button
                            variant="default"
                            type="button"
                            onClick={closeBatchEdit}
                          >
                            Cancel
                          </Button>
                          <Tooltip
                            label={batchActionDisabledReason}
                            disabled={
                              batchEditBusy ||
                              (stockTrackingEnabled && batchTrackingEnabled)
                            }
                            withArrow
                          >
                            <span>
                              <Button
                                type="submit"
                                loading={batchEditBusy}
                                disabled={
                                  batchEditBusy ||
                                  !stockTrackingEnabled ||
                                  !batchTrackingEnabled
                                }
                              >
                                Save
                              </Button>
                            </span>
                          </Tooltip>
                        </Group>
                      </Stack>
                    </form>
                  ) : null}
                </Modal>
                <InventoryAmendmentModal
                  opened={amendBatchOpen}
                  onClose={() => setAmendBatchOpen(false)}
                  productId={product.id}
                  mode="batch"
                  batch={
                    activeBatch
                      ? {
                          batchId: activeBatch.batch_id,
                          locationId: activeBatch.location_id,
                          locationName: activeBatch.location_name,
                          name: activeBatch.batch_name,
                          codeMill: activeBatch.code_mill,
                          codeSartor: activeBatch.code_sartor,
                          qty: Number(activeBatch.qty || 0),
                        }
                      : null
                  }
                />
                <InventoryAmendmentModal
                  opened={amendProductOpen}
                  onClose={() => setAmendProductOpen(false)}
                  productId={product.id}
                  mode="product"
                  batches={(activeBatch?.rows || []) as any}
                />
                <InventoryTransferModal
                  opened={transferOpen}
                  onClose={() => setTransferOpen(false)}
                  productId={product.id}
                  sourceBatchId={activeBatch?.batch_id}
                  sourceLabel={
                    activeBatch
                      ? activeBatch.code_mill ||
                        activeBatch.code_sartor ||
                        String(activeBatch.batch_id)
                      : ""
                  }
                  sourceQty={Number(activeBatch?.qty || 0)}
                  sourceLocationId={activeBatch?.location_id ?? null}
                  targetOptions={
                    filteredBatches
                      .filter((r: any) => r.batch_id !== activeBatch?.batch_id)
                      .map((r: any) => ({
                        value: String(r.batch_id),
                        label: (r.code_mill ||
                          r.code_sartor ||
                          r.batch_name ||
                          String(r.batch_id)) as string,
                        locationId: r.location_id,
                      })) as BatchOption[]
                  }
                />
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 7 }}>
              {/* Product Movements (right) */}
              <Card withBorder padding="md" bg="transparent">
                <Card.Section inheritPadding py="xs">
                  <Group justify="space-between" align="center">
                    <Title order={4}>Product Movements</Title>
                    {/* view switch removed */}
                  </Group>
                </Card.Section>
                <Card.Section>
                  <Table withColumnBorders highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Date</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Out</Table.Th>
                        <Table.Th>In</Table.Th>
                        {movementView === "line" && <Table.Th>Batch</Table.Th>}
                        <Table.Th>Qty</Table.Th>
                        <Table.Th>Notes</Table.Th>
                        <Table.Th />
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {movementView === "line"
                        ? (showAllMovements ? lines : lines.slice(0, 8)).map(
                            (ml: any) => (
                              <Table.Tr key={`line-${ml.id}`}>
                                <Table.Td>
                                  {ml.movement?.date
                                    ? fmtDate(ml.movement.date)
                                    : ""}
                                </Table.Td>
                                <Table.Td>
                                  {getMovementLabel(ml.movement?.movementType)}
                                </Table.Td>
                                <Table.Td>
                                  {ml.movement?.locationOutId != null
                                    ? locById?.[ml.movement.locationOutId] ||
                                      ml.movement.locationOutId
                                    : ""}
                                </Table.Td>
                                <Table.Td>
                                  {ml.movement?.locationInId != null
                                    ? locById?.[ml.movement.locationInId] ||
                                      ml.movement.locationInId
                                    : ""}
                                </Table.Td>
                                <Table.Td>
                                  {ml.batch?.codeMill || ml.batch?.codeSartor
                                    ? `${ml.batch?.codeMill || ""}${
                                        ml.batch?.codeMill &&
                                        ml.batch?.codeSartor
                                          ? " | "
                                          : ""
                                      }${ml.batch?.codeSartor || ""}`
                                    : ml.batch?.id
                                    ? `${ml.batch.id}`
                                    : ""}
                                </Table.Td>
                                <Table.Td>
                                  {Number(ml.quantity || 0) === 0
                                    ? ""
                                    : ml.quantity}
                                </Table.Td>
                                <Table.Td>{ml.notes || ""}</Table.Td>
                                <Table.Td width={48}>
                                  <Menu
                                    withinPortal
                                    position="bottom-end"
                                    shadow="sm"
                                  >
                                    <Menu.Target>
                                      <ActionIcon
                                        variant="subtle"
                                        aria-label="Movement actions"
                                      >
                                        <IconMenu2 size={16} />
                                      </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                      <Menu.Item
                                        onClick={() =>
                                          setMovementDetailId(
                                            ml.movement?.id ?? null
                                          )
                                        }
                                        disabled={!ml.movement?.id}
                                      >
                                        Details
                                      </Menu.Item>
                                      {isAdminUser && (
                                        <Tooltip
                                          label={mutationDisabledReason}
                                          disabled={
                                            !mutationDisabledReason ||
                                            !ml.movement?.id
                                          }
                                          withArrow
                                          position="left"
                                        >
                                          <span>
                                            <Menu.Item
                                              color="red"
                                              onClick={() => {
                                                if (mutationDisabledReason)
                                                  return;
                                                if (!ml.movement?.id) return;
                                                setPendingDeleteMovementId(
                                                  ml.movement.id
                                                );
                                                setMovementDeleteInput("");
                                              }}
                                              disabled={
                                                !ml.movement?.id ||
                                                Boolean(mutationDisabledReason)
                                              }
                                            >
                                              Delete
                                            </Menu.Item>
                                          </span>
                                        </Tooltip>
                                      )}
                                    </Menu.Dropdown>
                                  </Menu>
                                </Table.Td>
                              </Table.Tr>
                            )
                          )
                        : (showAllMovements
                            ? headers
                            : headers.slice(0, 8)
                          ).map((mh: any) => (
                            <Table.Tr key={`hdr-${mh.id}`}>
                              <Table.Td>
                                {mh.date ? fmtDate(mh.date) : ""}
                              </Table.Td>
                              <Table.Td>{getMovementLabel(mh.movementType)}</Table.Td>
                              <Table.Td>
                                {mh.locationOutId != null
                                  ? locById?.[mh.locationOutId] ||
                                    mh.locationOutId
                                  : ""}
                              </Table.Td>
                              <Table.Td>
                                {mh.locationInId != null
                                  ? locById?.[mh.locationInId] ||
                                    mh.locationInId
                                  : ""}
                              </Table.Td>
                              <Table.Td>
                                {Number(mh.quantity || 0) === 0
                                  ? ""
                                  : mh.quantity}
                              </Table.Td>
                              <Table.Td>{mh.notes || ""}</Table.Td>
                              <Table.Td width={48}>
                                <Menu
                                  withinPortal
                                  position="bottom-end"
                                  shadow="sm"
                                >
                                  <Menu.Target>
                                    <ActionIcon
                                      variant="subtle"
                                      aria-label="Movement actions"
                                    >
                                      <IconMenu2 size={16} />
                                    </ActionIcon>
                                  </Menu.Target>
                                  <Menu.Dropdown>
                                    <Menu.Item
                                      onClick={() =>
                                        setMovementDetailId(mh.id ?? null)
                                      }
                                      disabled={!mh.id}
                                    >
                                      Details
                                    </Menu.Item>
                                    {isAdminUser && (
                                      <Tooltip
                                        label={mutationDisabledReason}
                                        disabled={
                                          !mutationDisabledReason || !mh.id
                                        }
                                        withArrow
                                        position="left"
                                      >
                                        <span>
                                          <Menu.Item
                                            color="red"
                                            onClick={() => {
                                              if (mutationDisabledReason)
                                                return;
                                              if (!mh.id) return;
                                              setPendingDeleteMovementId(
                                                mh.id as number
                                              );
                                              setMovementDeleteInput("");
                                            }}
                                            disabled={
                                              !mh.id ||
                                              Boolean(mutationDisabledReason)
                                            }
                                          >
                                            Delete
                                          </Menu.Item>
                                        </span>
                                      </Tooltip>
                                    )}
                                  </Menu.Dropdown>
                                </Menu>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                    </Table.Tbody>
                  </Table>
                </Card.Section>
                {(() => {
                  const total =
                    movementView === "line" ? lines.length : headers.length;
                  if (total > 8 && !showAllMovements)
                    return (
                      <Card.Section>
                        <Group justify="center" mt={8}>
                          <Anchor
                            component="button"
                            type="button"
                            onClick={() => setShowAllMovements(true)}
                            size="sm"
                          >
                            Show all {total} movements
                          </Anchor>
                        </Group>
                      </Card.Section>
                    );
                  return null;
                })()}
                <Modal
                  opened={!!movementDetail}
                  onClose={() => setMovementDetailId(null)}
                  title={
                    detailMovement?.id
                      ? `Movement ${detailMovement.id}`
                      : "Movement details"
                  }
                  size="lg"
                >
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text size="sm">
                        Date:{" "}
                        {detailMovement?.date
                          ? new Date(detailMovement.date).toLocaleString()
                          : "—"}
                      </Text>
                      <Text size="sm">
                        Type: {getMovementLabel(detailMovement?.movementType) || "—"}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm">
                        Out:{" "}
                        {detailMovement?.locationOutId != null
                          ? locById?.[detailMovement.locationOutId] ||
                            detailMovement.locationOutId
                          : "—"}
                      </Text>
                      <Text size="sm">
                        In:{" "}
                        {detailMovement?.locationInId != null
                          ? locById?.[detailMovement.locationInId] ||
                            detailMovement.locationInId
                          : "—"}
                      </Text>
                    </Group>
                    <Text size="sm">Notes: {detailMovement?.notes || "—"}</Text>
                    {detailShipment || detailShipmentFromFetcher ? (
                      <Stack gap={4}>
                        <Text fw={600} size="sm">
                          Shipment (Out)
                        </Text>
                        {(() => {
                          const sl =
                            detailShipment || detailShipmentFromFetcher;
                          if (!sl) return null;
                          return (
                            <>
                              <Text size="sm">
                                Shipment:{" "}
                                {sl.shipmentId != null ? sl.shipmentId : "—"}{" "}
                                {sl.shipment?.trackingNo
                                  ? `• AWB ${sl.shipment.trackingNo}`
                                  : ""}
                                {sl.shipment?.packingSlipCode
                                  ? ` • Packing Slip ${sl.shipment.packingSlipCode}`
                                  : ""}
                              </Text>
                              <Text size="sm">Shipment Line ID: {sl.id}</Text>
                            </>
                          );
                        })()}
                      </Stack>
                    ) : null}
                    <Text fw={600} size="sm">
                      Lines
                    </Text>
                    {detailLines.length ? (
                      <Table withColumnBorders>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>ID</Table.Th>
                            <Table.Th>Product</Table.Th>
                            <Table.Th>Batch</Table.Th>
                            <Table.Th>Qty</Table.Th>
                            <Table.Th>Notes</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {detailLines.map((ln: any) => (
                            <Table.Tr key={ln.id}>
                              <Table.Td>{ln.id}</Table.Td>
                              <Table.Td>{ln.productId ?? "—"}</Table.Td>
                              <Table.Td>
                                {ln.batch?.id
                                  ? ln.batch?.codeMill || ln.batch?.codeSartor
                                    ? `${ln.batch?.codeMill || ""}${
                                        ln.batch?.codeMill &&
                                        ln.batch?.codeSartor
                                          ? " | "
                                          : ""
                                      }${ln.batch?.codeSartor || ""}`
                                    : ln.batch.id
                                  : "—"}
                              </Table.Td>
                              <Table.Td>{ln.quantity ?? "—"}</Table.Td>
                              <Table.Td>{ln.notes || "—"}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    ) : (
                      <Text size="sm" c="dimmed">
                        No lines found for this movement.
                      </Text>
                    )}
                  </Stack>
                </Modal>
                <Modal
                  opened={pendingDeleteMovementId != null}
                  onClose={() => setPendingDeleteMovementId(null)}
                  title="Delete Movement"
                  centered
                >
                  <Stack gap="sm">
                    <Text size="sm">
                      To permanently delete movement{" "}
                      {pendingDeleteMovementId ?? ""}, type{" "}
                      <strong>{movementDeletePhrase}</strong> below.
                    </Text>
                    <TextInput
                      placeholder={movementDeletePhrase}
                      value={movementDeleteInput}
                      onChange={(e) =>
                        setMovementDeleteInput(e.currentTarget.value)
                      }
                    />
                    <Group justify="flex-end" gap="xs">
                      <Button
                        variant="default"
                        onClick={() => setPendingDeleteMovementId(null)}
                      >
                        Cancel
                      </Button>
                      <Tooltip
                        label={mutationDisabledReason}
                        disabled={!mutationDisabledReason}
                        withArrow
                      >
                        <span>
                          <Button
                            color="red"
                            loading={movementActionFetcher.state !== "idle"}
                            disabled={
                              Boolean(mutationDisabledReason) ||
                              movementDeleteInput
                                .replace(/\u2019/g, "'")
                                .trim() !== movementDeletePhrase
                            }
                            onClick={() =>
                              handleDeleteMovement(pendingDeleteMovementId)
                            }
                          >
                            Delete
                          </Button>
                        </span>
                      </Tooltip>
                    </Group>
                  </Stack>
                </Modal>
              </Card>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
        {showInstances ? (
          <Tabs.Panel value="instances" pt="md">
            <Stack gap="md">
              <Card withBorder padding="md" bg="transparent">
                <Card.Section inheritPadding py="xs">
                  <Title order={5}>Products using this item (BOM)</Title>
                </Card.Section>
                <Card.Section>
                  {bomParents.length ? (
                    <Table withColumnBorders highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>ID</Table.Th>
                          <Table.Th>SKU</Table.Th>
                          <Table.Th>Name</Table.Th>
                          <Table.Th>Type</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {bomParents.map((p: any) => (
                          <Table.Tr key={p.id}>
                            <Table.Td>
                              <Link to={`/products/${p.id}`}>{p.id}</Link>
                            </Table.Td>
                            <Table.Td>{p.sku || ""}</Table.Td>
                            <Table.Td>{p.name || ""}</Table.Td>
                            <Table.Td>{p.type || ""}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Text c="dimmed" size="sm">
                      This product is not used in other products.
                    </Text>
                  )}
                </Card.Section>
              </Card>

              <Card withBorder padding="md" bg="transparent">
                <Card.Section inheritPadding py="xs">
                  <Title order={5}>Assemblies using this product</Title>
                </Card.Section>
                <Card.Section>
                  {assemblies.length || costingAsm.length ? (
                    <Table withColumnBorders highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Assembly</Table.Th>
                          <Table.Th>Job</Table.Th>
                          <Table.Th>Project</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {assemblies.map((a: any) => (
                          <Table.Tr key={`primary-${a.id}`}>
                            <Table.Td>{a.name || `A${a.id}`}</Table.Td>
                            <Table.Td>
                              {a.job ? (
                                <Link to={`/jobs/${a.job.id}`}>{a.job.id}</Link>
                              ) : (
                                a.jobId || ""
                              )}
                            </Table.Td>
                            <Table.Td>
                              {a.job
                                ? `${a.job.projectCode || ""} ${
                                    a.job.name || ""
                                  }`.trim()
                                : ""}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                        {costingAsm.map((a: any) => (
                          <Table.Tr key={`costing-${a.id}`}>
                            <Table.Td>{a.name || `A${a.id}`}</Table.Td>
                            <Table.Td>
                              {a.job ? (
                                <Link to={`/jobs/${a.job.id}`}>{a.job.id}</Link>
                              ) : (
                                a.jobId || ""
                              )}
                            </Table.Td>
                            <Table.Td>
                              {a.job
                                ? `${a.job.projectCode || ""} ${
                                    a.job.name || ""
                                  }`.trim()
                                : ""}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Text c="dimmed" size="sm">
                      No assemblies currently use this product.
                    </Text>
                  )}
                </Card.Section>
              </Card>
            </Stack>
          </Tabs.Panel>
        ) : null}
      </Tabs>
      <ProductPickerModal
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add Component"
        searchValue={pickerSearch}
        onSearchChange={setPickerSearch}
        results={filtered as any}
        loading={false}
        assemblyItemOnly={assemblyItemOnly}
        onAssemblyItemOnlyChange={setAssemblyItemOnly}
        onSelect={(p) => {
          const tempId = `tmp-${Date.now()}-${p.id}`;
          setBomDraftRows((rows) => [
            ...rows,
            {
              tempId,
              childId: p.id,
              childSku: p.sku,
              childName: p.name ?? null,
              childType: p.type ?? null,
              supplierName: p.supplierName ?? null,
              quantity: 1,
              activityUsed: null,
              deleted: false,
            },
          ]);
          editForm.setValue("bomDirty", String(Date.now()), {
            shouldDirty: true,
          });
          setPickerOpen(false);
        }}
      />
    </Stack>
  );
}
