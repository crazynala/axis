import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import {
  Button,
  Card,
  Menu,
  ActionIcon,
  Anchor,
  TagsInput,
  Select,
  SegmentedControl,
  Grid,
  Group,
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
import { IconBug, IconMenu2 } from "@tabler/icons-react";
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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { AxisChip, type AxisChipTone } from "~/components/AxisChip";
import { computeProductValidation } from "~/modules/product/validation/computeProductValidation";
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

import { ProductFindManager } from "../components/ProductFindManager";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
  getSavedIndexSearch,
} from "~/hooks/useNavLocation";
import { DebugDrawer } from "~/modules/debug/components/DebugDrawer";
import { loadProductDetailVM } from "~/modules/product/services/productDetailVM.server";
import { handleProductDetailAction } from "~/modules/product/services/productDetailActions.server";

// BOM spreadsheet modal removed; see /products/:id/bom page

const PRODUCT_DELETE_PHRASE = "LET'S DO IT";
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
}: {
  form: any;
  onSave: (values: any) => void;
}) {
  const resetForm = useCallback(() => form.reset(), [form]);
  // Call the timber hook with stable callbacks
  useInitGlobalFormContext(form as any, onSave, resetForm);
  return null;
}

function DeferredGlobalFormInit({
  form,
  onSave,
  onReset,
}: {
  form: any;
  onSave: (values: any) => void;
  onReset: () => void;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  // Call the timber hook only after initial mount to avoid HMR timing issues
  useInitGlobalFormContext(form as any, onSave, onReset);
  return null;
}

export default function ProductDetailRoute() {
  // Persist last visited product detail path for module restoration (include search for tab states)
  useRegisterNavLocation({ includeSearch: true, moduleKey: "products" });
  // Keep index search cached; detail route should not overwrite index search so we call persist here only when user returns to index later.
  // This hook is safe on detail; it only acts if pathname === /products
  usePersistIndexSearch("/products");
  const {
    product,
    stockByLocation,
    stockByBatch,
    productChoices,
    movements,
    movementHeaders,
    locationNameById,
    salePriceGroups,
    usedInProducts,
    costingAssemblies,
    shipmentLines,
    userLevel,
    canDebug,
  } = useLoaderData<typeof loader>();
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
  const debugFetcher = useFetcher();
  const [debugOpen, setDebugOpen] = useState(false);
  // Sync RecordContext currentId for global navigation consistency
  const { setCurrentId } = useRecordContext();
  useEffect(() => {
    setCurrentId(product.id);
    // Do NOT clear on unmount; preserve selection like invoices module
  }, [product.id, setCurrentId]);
  // Prev/Next hotkeys handled globally in RecordProvider
  const submit = useSubmit();

  // Findify hook (forms, mode, style, helpers) – pass nav for auto-exit
  const { editForm, buildUpdatePayload } = useProductFindify(product, nav);
  useEffect(() => {
    editForm.reset(buildProductEditDefaults(product), {
      keepDirty: false,
      keepDefaultValues: false,
    });
  }, [product]);

  console.log("!! form values:", editForm.getValues());
  console.log(
    "!! form dirty:",
    editForm.formState.isDirty,
    editForm.formState.dirtyFields,
    editForm.formState.defaultValues
  );

  // Find modal is handled via ProductFindManager now (no inline find toggle)

  // Only wire header Save/Cancel to the real edit form
  const saveUpdate = useCallback(
    (values: any) => {
      const updatePayload = buildUpdatePayload(values);
      console.log("Saving with payload", updatePayload);
      submit(updatePayload, { method: "post" });
    },
    [buildUpdatePayload, submit]
  );
  // Defer initialization to avoid HMR race where provider isn't ready yet
  // useInitGlobalFormContext(editForm as any, saveUpdate, () => editForm.reset());

  const [pickerOpen, setPickerOpen] = useState(false);
  // BOM spreadsheet modal removed (now a dedicated full-page route)
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
  const requiredIndicatorMode: "inline" | "chips" = "chips";
  const hasMovements = lines.length > 0;

  const watched = editForm.watch() as Record<string, any>;
  const validation = useMemo(
    () =>
      computeProductValidation({
        type: watched?.type ?? product.type,
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
      }),
    [watched, product]
  );

  type HealthChip = {
    tone: AxisChipTone;
    label: string;
    tooltip: string;
    icon?: ReactNode;
    onClick?: () => void;
  };
  const topHealth = useMemo(() => {
    const warnings: HealthChip[] = [];
    const infos: HealthChip[] = [];
    const neutral: HealthChip[] = [];
    const typeLabel = product.type || "Unspecified";
    const typeUpper = String(typeLabel || "").toUpperCase();
    const supplyTypes = new Set(["FABRIC", "TRIM", "PACKAGING"]);
    const requiresSupplier =
      supplyTypes.has(typeUpper) ||
      (typeUpper === "SERVICE" && !!product.externalStepType);
    const requiresCustomer = typeUpper === "FINISHED" || typeUpper === "CMT";
    const isFabric = typeUpper === "FABRIC";

    if (!product.type) {
      warnings.push({
        tone: "warning",
        label: "Type missing",
        tooltip: "Select a product type to enable template and SKU rules.",
        icon: "⚠",
      });
    }
    if (requiresSupplier && !product.supplierId) {
      warnings.push({
        tone: "warning",
        label: "Supplier required",
        tooltip: `${typeLabel} should link a supplier for ordering and costing.`,
        icon: "⚠",
      });
    }
    if (requiresCustomer && !product.customerId) {
      warnings.push({
        tone: "warning",
        label: "Customer required",
        tooltip: `${typeLabel} should link a customer for pricing and BOM rules.`,
        icon: "⚠",
      });
    }
    if (isFabric) {
      if (!product.stockTrackingEnabled) {
        warnings.push({
          tone: "warning",
          label: "Stock tracking off",
          tooltip: "Fabric must track stock to manage inventory accurately.",
          icon: "⚠",
        });
      } else if (product.stockTrackingEnabled && product.batchTrackingEnabled === false) {
        warnings.push({
          tone: "warning",
          label: "Batch tracking off",
          tooltip: "Fabric with stock tracking should also enable batch tracking.",
          icon: "⚠",
        });
      }
    } else if (supplyTypes.has(typeUpper) && !product.stockTrackingEnabled) {
      warnings.push({
        tone: "warning",
        label: `Stock tracking off (${typeLabel})`,
        tooltip: `Enable stock tracking for ${typeLabel.toLowerCase()} to manage inventory.`,
        icon: "⚠",
      });
    }
    if (typeUpper === "SERVICE" && !product.templateId) {
      warnings.push({
        tone: "warning",
        label: "Template missing",
        tooltip: "Service products need a template to set expected steps and SKU rules.",
        icon: "⚠",
      });
    }
    if (validation.missingRequired.length && requiredIndicatorMode !== "inline") {
      const grouped = Object.entries(validation.bySection)
        .map(([section, data]) =>
          data.missingRequired.length
            ? `${section}: ${data.missingRequired.join(", ")}`
            : null
        )
        .filter(Boolean)
        .join("\n");
      warnings.push({
        tone: "warning",
        label: `Missing required: ${validation.missingRequired.length}`,
        tooltip: grouped || "Missing required fields",
        icon: "⚠",
        onClick: focusMissingRequired || undefined,
      });
    }

    if (product.type) {
      infos.push({
        tone: "info",
        label: `Type: ${typeLabel}`,
        tooltip: "Current product type drives rules for suppliers/customers.",
      });
    }
    if (product.templateId) {
      infos.push({
        tone: "info",
        label: `Template #${product.templateId}`,
        tooltip: "Template linked for defaults and SKU series.",
      });
    }
    if (product.externalStepType) {
      infos.push({
        tone: "info",
        label: `External: ${product.externalStepType}`,
        tooltip: "External step expectation applied to services and BOM costings.",
      });
    }
    if (product.leadTimeDays != null) {
      infos.push({
        tone: "info",
        label: `Lead time ${product.leadTimeDays}d`,
        tooltip: "Overrides supplier default lead time for ETAs.",
      });
    }
    const variantSetId = product.variantSetId ?? product.variantSet?.id ?? null;
    if (!variantSetId && typeUpper === "FINISHED") {
      infos.push({
        tone: "neutral",
        label: "Variant set optional",
        tooltip: "No variant set selected; add one to manage sizes/colors if needed.",
      });
    }

    neutral.push({
      tone: "neutral",
      label: `SKU ${product.sku || "—"}`,
      tooltip: product.sku ? "SKU assigned" : "No SKU on record",
    });
    neutral.push({
      tone: "neutral",
      label: `ID ${product.id}`,
      tooltip: "Internal product id",
    });

    return { warnings, infos, neutral };
  }, [product]);

  const renderHealthChip = (chip: HealthChip, key: string) => (
    <Tooltip
      key={key}
      label={chip.tooltip}
      withArrow
      multiline
      maw={260}
      position="bottom"
    >
      <AxisChip
        tone={chip.tone}
        leftSection={chip.icon}
        onClick={chip.onClick}
        style={chip.onClick ? { cursor: "pointer" } : undefined}
      >
        {chip.label}
      </AxisChip>
    </Tooltip>
  );

  const renderBucket = (
    chips: HealthChip[],
    maxVisible: number,
    fallbackTone: AxisChipTone
  ) => {
    if (!chips.length) return null;
    const visible = chips.slice(0, maxVisible);
    const overflow = chips.slice(maxVisible);
    const rendered = visible.map((chip, idx) =>
      renderHealthChip(chip, `${chip.label}-${idx}`)
    );
    if (overflow.length) {
      const summary = overflow.map((c) => `• ${c.label}`).join("\n");
      rendered.push(
        <Tooltip
          key={`more-${fallbackTone}`}
          label={summary || "More"}
          withArrow
          multiline
          maw={260}
        >
          <AxisChip tone={fallbackTone} leftSection="+">
            +{overflow.length}
          </AxisChip>
        </Tooltip>
      );
    }
    return rendered;
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
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
        <Group
          gap="xs"
          style={{ minWidth: 200, maxWidth: 520, flex: 1 }}
          justify="flex-end"
        >
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
              <Menu.Item
                onClick={() => {
                  const fd = new FormData();
                  fd.set("_intent", "product.duplicate");
                  submit(fd, { method: "post" });
                }}
              >
                Duplicate Product
              </Menu.Item>
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
              <Menu.Item
                onClick={() =>
                  refreshFetcher.submit(
                    { _intent: "stock.refresh" },
                    { method: "post" }
                  )
                }
              >
                Refresh Stock View
              </Menu.Item>
              <Menu.Item
                color="red"
                onClick={() => {
                  setDeleteConfirmation("");
                  setDeleteModalOpen(true);
                }}
              >
                Delete Product
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <MantineText size="xs" c="dimmed">
        {(() => {
          const ts = fmtDate(product.updatedAt || product.modifiedAt);
          if (!ts) return null;
          const by = (product.modifiedBy || product.updatedBy || "").trim();
          return by ? `Last updated ${ts} by ${by}` : `Last updated ${ts}`;
        })()}
      </MantineText>
      <div
        style={{
          overflowX: "auto",
          padding: "2px 2px",
        }}
      >
        <Group gap="xs" wrap="nowrap" align="center">
          {renderBucket(topHealth.warnings, 2, "warning")}
          {renderBucket(topHealth.infos, 2, "info")}
          {topHealth.neutral.map((chip, idx) =>
            renderHealthChip(chip, `neutral-${idx}`)
          )}
        </Group>
      </div>
      <ProductFindManager />
      <DebugDrawer
        opened={debugOpen}
        onClose={() => setDebugOpen(false)}
        title={`Debug – Product ${product.id}`}
        payload={debugFetcher.data as any}
        loading={debugFetcher.state !== "idle"}
      />
      <Form id="product-form" method="post">
        {/* Isolate global form init into a dedicated child to reduce HMR churn */}
        <GlobalFormInit form={editForm as any} onSave={saveUpdate} />
        <ProductDetailForm
          mode={"edit" as any}
          form={editForm as any}
          product={product}
          validation={validation}
          onRegisterMissingFocus={setFocusMissingRequired}
          requiredIndicatorMode={requiredIndicatorMode}
          hasMovements={hasMovements}
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
          {product.productLines.length > 0 && (
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
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {product.productLines.map((pl: any) => (
                  <Table.Tr key={pl.id}>
                    <Table.Td>{pl.id}</Table.Td>
                    <Table.Td>{pl.child?.sku || ""}</Table.Td>
                    <Table.Td>
                      {pl.child ? (
                        <Link to={`/products/${pl.child.id}`}>
                          {pl.child.name || pl.child.id}
                        </Link>
                      ) : (
                        pl.childId
                      )}
                    </Table.Td>
                    <Table.Td>{pl.activityUsed || ""}</Table.Td>
                    <Table.Td>{pl.child?.type || ""}</Table.Td>
                    <Table.Td>{pl.child?.supplier?.name || ""}</Table.Td>
                    <Table.Td>{pl.quantity}</Table.Td>
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
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => {
                            const rows: BatchRowLite[] =
                              filteredBatchRowsLite.map((r) => ({ ...r }));
                            setActiveBatch({ rows });
                            setAmendProductOpen(true);
                          }}
                        >
                          Amend All…
                        </Button>
                      </Group>
                    </Group>
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
                                  >
                                    <IconMenu2 size={16} />
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  <Menu.Item
                                    disabled={row.batch_id == null}
                                    onClick={() => {
                                      if (row.batch_id == null) return;
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
                                  <Menu.Item
                                    onClick={() => {
                                      setActiveBatch(row);
                                      setAmendBatchOpen(true);
                                    }}
                                  >
                                    Amend
                                  </Menu.Item>
                                  <Menu.Item
                                    onClick={() => {
                                      setActiveBatch(row);
                                      setTransferOpen(true);
                                    }}
                                  >
                                    Transfer
                                  </Menu.Item>
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
                          <Button
                            type="submit"
                            loading={batchEditBusy}
                            disabled={batchEditBusy}
                          >
                            Save
                          </Button>
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
                                  {ml.movement?.movementType || ""}
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
                                        <Menu.Item
                                          color="red"
                                          onClick={() => {
                                            if (!ml.movement?.id) return;
                                            setPendingDeleteMovementId(
                                              ml.movement.id
                                            );
                                            setMovementDeleteInput("");
                                          }}
                                          disabled={!ml.movement?.id}
                                        >
                                          Delete
                                        </Menu.Item>
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
                              <Table.Td>{mh.movementType || ""}</Table.Td>
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
                                      <Menu.Item
                                        color="red"
                                        onClick={() => {
                                          if (!mh.id) return;
                                          setPendingDeleteMovementId(
                                            mh.id as number
                                          );
                                          setMovementDeleteInput("");
                                        }}
                                        disabled={!mh.id}
                                      >
                                        Delete
                                      </Menu.Item>
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
                        Type: {detailMovement?.movementType || "—"}
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
                      <Button
                        color="red"
                        loading={movementActionFetcher.state !== "idle"}
                        disabled={
                          movementDeleteInput.replace(/\u2019/g, "'").trim() !==
                          movementDeletePhrase
                        }
                        onClick={() =>
                          handleDeleteMovement(pendingDeleteMovementId)
                        }
                      >
                        Delete
                      </Button>
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
          const fd = new FormData();
          fd.set("_intent", "product.addComponent");
          fd.set("childId", String(p.id));
          submit(fd, { method: "post" });
          setPickerOpen(false);
        }}
      />
    </Stack>
  );
}
