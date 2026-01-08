import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import {
  Link,
  Outlet,
  useActionData,
  useRouteLoaderData,
  useNavigation,
  useSubmit,
  Form,
  useSearchParams,
  useNavigate,
  useMatches,
  useFetcher,
} from "@remix-run/react";
import { notifications } from "@mantine/notifications";
import {
  Stack,
  Title,
  Group,
  Table,
  Text,
  Card,
  Grid,
  Divider,
  Button,
  Modal,
  Checkbox,
  TextInput,
  Switch,
  Badge,
  Tooltip,
  ActionIcon,
  Menu,
  Select,
  SegmentedControl,
  Textarea,
} from "@mantine/core";
import {
  HotkeyAwareModal,
  HotkeyAwareModalRoot,
} from "~/base/hotkeys/HotkeyAwareModal";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { BreadcrumbSet, useGlobalFormContext } from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { useInitGlobalFormContext } from "@aa/timber";
import { getVariantLabels } from "../../../utils/getVariantLabels";
import React from "react";
import {
  IconBan,
  IconBug,
  IconCopy,
  IconChevronDown,
  IconLink,
  IconMenu2,
  IconTrash,
} from "@tabler/icons-react";
import { useFind } from "../../../base/find/FindContext";
import { useRecordContext } from "../../../base/record/RecordContext";
import { JobFindManager } from "~/modules/job/findify/JobFindManager";
import { DebugDrawer } from "~/modules/debug/components/DebugDrawer";
import {
  FormStateDebugPanel,
  buildFormStateDebugData,
  buildFormStateDebugText,
} from "~/base/debug/FormStateDebugPanel";

import {
  normalizeAssemblyState,
} from "~/modules/job/stateUtils";
import {
  computeEffectiveOrderedBreakdown,
  computeOrderedTotal,
  sumBreakdownArrays,
} from "~/modules/job/quantityUtils";
import { getSavedIndexSearch } from "~/hooks/useNavLocation";
import { loadJobDetailVM } from "~/modules/job/services/jobDetailVM.server";
import { handleJobDetailAction } from "~/modules/job/services/jobDetailActions.server";
import { OverrideIndicator } from "~/components/OverrideIndicator";
import { formatAddressLines } from "~/utils/addressFormat";
import {
  ASSEMBLY_OPERATIONAL_STATUS_LABELS,
  deriveAssemblyHoldOverlay,
  deriveAssemblyOperationalStatus,
} from "~/modules/assembly/derived/assemblyOperationalStatus";
import { JobDetailForm } from "~/modules/job/forms/JobDetailForm";
import { buildEndCustomerOptions } from "~/modules/job/services/endCustomerOptions";
import { deriveInternalTargetDate } from "~/modules/job/services/jobTargetDefaults";
import { ProductStageIndicator } from "~/modules/product/components/ProductStageIndicator";

export const meta: MetaFunction = () => [{ title: "Job" }];

export async function loader({ params }: LoaderFunctionArgs) {
  return loadJobDetailVM({ params });
}

export async function action({ request, params }: ActionFunctionArgs) {
  return handleJobDetailAction({ request, params } as any);
}

export function JobDetailView() {
  const loaderData = useRouteLoaderData<typeof loader>(
    "modules/job/routes/jobs.$id"
  )!;
  const {
    job,
    productsById,
    customers,
    contacts,
    productChoices,
    groupsById,
    activityCounts,
    shipToAddresses,
    defaultLeadDays,
    internalTargetBufferDays,
    jobTargets,
    assemblyTargetsById,
  } = loaderData;
  const locations = loaderData?.locations ?? [];
  const actionData = useActionData<typeof action>() as any;
  const { setCurrentId } = useRecordContext();
  const matches = useMatches();
  const rootData = matches.find((m) => m.id === "root")?.data as
    | { userLevel?: string | null }
    | undefined;
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const deletePhrase = "THIS IS SO DANGEROUS. CALL ME CRAZY.";
  const hasAssemblyActivity = Object.values(activityCounts || {}).some(
    (n) => (n || 0) > 0
  );
  useEffect(() => {
    setCurrentId(job.id, "restore");
  }, [job.id, setCurrentId]);
  useEffect(() => {
    const code = sp.get("jobStateErr");
    if (!code) return;
    const messages: Record<string, { title: string; message: string }> = {
      JOB_CANCEL_BLOCKED: {
        title: "Unable to cancel job",
        message:
          "At least one assembly already has recorded activity, so the job cannot be canceled.",
      },
    };
    const meta =
      messages[code] ||
      ({
        title: "Job state update blocked",
        message: "The requested job state transition could not be applied.",
      } as const);
    notifications.show({ color: "red", ...meta });
    navigate(`/jobs/${job.id}`, { replace: true });
  }, [sp, navigate, job.id]);
  useEffect(() => {
    if (!actionData?.error) return;
    notifications.show({
      color: "red",
      title: "Unable to save job",
      message: String(actionData.error),
    });
  }, [actionData]);
  useEffect(() => {
    const groupErr = sp.get("asmGroupErr");
    if (!groupErr) return;
    const codes = groupErr
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const reasons: string[] = [];
    if (codes.includes("status")) {
      reasons.push("Selected assemblies must share the same status.");
    }
    if (codes.includes("activity")) {
      reasons.push("Assemblies with recorded activity cannot be grouped.");
    }
    if (codes.includes("missing")) {
      reasons.push("One or more assemblies could not be found.");
    }
    setGroupGuardMessage(
      [
        "Assemblies can only be grouped when they share the same state and have no activity.",
        reasons.join(" "),
      ]
        .join(" ")
        .trim()
    );
    navigate(`/jobs/${job.id}`, { replace: true });
  }, [sp, navigate, job.id]);
  useEffect(() => {
    const err = sp.get("deleteError");
    if (!err) return;
    const messages: Record<string, { title: string; message: string }> = {
      confirm: {
        title: "Delete job blocked",
        message: "Confirmation text did not match.",
      },
      activity: {
        title: "Delete job blocked",
        message: "Assemblies with recorded activity cannot be deleted.",
      },
    };
    const meta =
      messages[err] ||
      ({
        title: "Delete job blocked",
        message: "Unable to delete job.",
      } as const);
    notifications.show({ color: "red", ...meta });
    navigate(`/jobs/${job.id}`, { replace: true });
  }, [sp, navigate, job.id]);
  useEffect(() => {
    const err = sp.get("jobHoldErr");
    if (!err) return;
    notifications.show({
      color: "red",
      title: "Job hold update blocked",
      message:
        err === "reason_required"
          ? "Job hold requires a reason."
          : "Job hold update could not be applied.",
    });
    navigate(`/jobs/${job.id}`, { replace: true });
  }, [sp, navigate, job.id]);
  useEffect(() => {
    const err = sp.get("jobDateErr");
    if (!err) return;
    const message =
      err === "internal_after_customer"
        ? "Internal target date must be on or before customer target date."
        : "Job dates could not be saved.";
    notifications.show({
      color: "red",
      title: "Job date validation",
      message,
    });
    navigate(`/jobs/${job.id}`, { replace: true });
  }, [sp, navigate, job.id]);
  useEffect(() => {
    const err = sp.get("jobPrimaryErr");
    if (!err) return;
    notifications.show({
      color: "red",
      title: "Job state update blocked",
      message: "Invalid primary job state.",
    });
    navigate(`/jobs/${job.id}`, { replace: true });
  }, [sp, navigate, job.id]);
  useEffect(() => {
    const err = sp.get("jobCancelErr");
    if (!err) return;
    const messages: Record<string, { title: string; message: string }> = {
      reason_required: {
        title: "Job cancellation requires a reason",
        message: "Enter a reason before canceling the job.",
      },
      complete_blocked: {
        title: "Cannot cancel a complete job",
        message: "Reopen the job to Active before canceling.",
      },
    };
    const meta =
      messages[err] ||
      ({
        title: "Job cancellation blocked",
        message: "Unable to apply job cancellation.",
      } as const);
    notifications.show({ color: "red", ...meta });
    navigate(`/jobs/${job.id}`, { replace: true });
  }, [sp, navigate, job.id]);
  useEffect(() => {
    const err = sp.get("jobCompleteErr");
    if (!err) return;
    notifications.show({
      color: "red",
      title: "Job completion blocked",
      message:
        err === "incomplete"
          ? "All assemblies must be complete or fully canceled before completing the job."
          : "Unable to complete job.",
    });
    navigate(`/jobs/${job.id}`, { replace: true });
  }, [sp, navigate, job.id]);
  useEffect(() => {
    const err = sp.get("asmHoldErr");
    if (!err) return;
    notifications.show({
      color: "red",
      title: "Assembly hold update blocked",
      message: `Hold reason required for assemblies: ${err}`,
    });
    navigate(`/jobs/${job.id}`, { replace: true });
  }, [sp, navigate, job.id]);
  useEffect(() => {
    const err = sp.get("asmCancelErr");
    if (!err) return;
    const asmId = sp.get("asmCancelId");
    const prefix = asmId ? `Assembly ${asmId}: ` : "";
    const messages: Record<string, string> = {
      reason_required: "Cancellation requires a reason.",
      qty_invalid: "Canceled quantity exceeds ordered quantity.",
      qty_below_progress:
        "Canceled quantity would go below already finished/packed units.",
      override_required:
        "Cancellation goes below recorded progress and needs an override.",
      has_activity:
        "Assembly has production activity and cannot be fully canceled.",
    };
    notifications.show({
      color: "red",
      title: "Assembly cancellation blocked",
      message: `${prefix}${messages[err] || "Unable to cancel assembly."}`,
    });
    navigate(`/jobs/${job.id}`, { replace: true });
  }, [sp, navigate, job.id]);
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [qtyAsm, setQtyAsm] = useState<any>(null);
  const [qtyLabels, setQtyLabels] = useState<string[]>([]);
  const [orderedArr, setOrderedArr] = useState<number[]>([]);
  const [groupGuardMessage, setGroupGuardMessage] = useState<string | null>(
    null
  );
  // Cut modal state
  const [cutModalOpen, setCutModalOpen] = useState(false);
  const [cutAsm, setCutAsm] = useState<any>(null);
  const [cutArr, setCutArr] = useState<number[]>([]);
  const [cancelArr, setCancelArr] = useState<number[]>([]);
  const [cancelLabels, setCancelLabels] = useState<string[]>([]);
  const [jobCancelOpen, setJobCancelOpen] = useState(false);
  const [jobCancelReason, setJobCancelReason] = useState("");
  const [jobStateConfirmOpen, setJobStateConfirmOpen] = useState(false);
  const [pendingJobState, setPendingJobState] = useState<string | null>(null);
  const [asmCancelOpen, setAsmCancelOpen] = useState(false);
  const [asmCancelTarget, setAsmCancelTarget] = useState<any>(null);
  const [asmCancelReason, setAsmCancelReason] = useState("");
  const [asmCancelOverride, setAsmCancelOverride] = useState(false);
  const [asmCancelMode, setAsmCancelMode] = useState<"full" | "remaining">(
    "remaining"
  );
  const [asmCancelBaseline, setAsmCancelBaseline] = useState("ORDER");
  // Master table removed; navigation handled via RecordContext
  // Local edit form only
  const companyAddressFetcher = useFetcher();
  const contactAddressFetcher = useFetcher();
  const jobToDefaults = (j: any) => ({
    id: j.id,
    projectCode: j.projectCode || "",
    name: j.name || "",
    jobType: j.jobType || "",
    endCustomerContactId: (j.endCustomerContactId ?? "") as any,
    customerPoNum: j.customerPoNum || "",
    statusWhiteboard: j.statusWhiteboard || "",
    state: j.state || "DRAFT",
    jobCancelReason: j.cancelReason || "",
    jobCancelMode: "job_only",
    jobHoldOn: Boolean(j.jobHoldOn),
    jobHoldReason: j.jobHoldReason || "",
    jobHoldType: j.jobHoldType || "",
    // Normalize to empty string so form value matches defaults and isn't marked dirty
    companyId: (j.companyId ?? j.company?.id ?? "") as any,
    // Consolidated stock location (prefer new field; fallback to legacy locationInId)
    stockLocationId: (j.stockLocationId ?? j.locationInId ?? "") as any,
    shipToAddressId: (j.shipToAddressId ?? j.shipToAddress?.id ?? "") as any,
    customerOrderDate: j.customerOrderDate ? new Date(j.customerOrderDate) : null,
    internalTargetDate: jobTargets?.internal?.value
      ? new Date(jobTargets.internal.value as any)
      : null,
    customerTargetDate: jobTargets?.customer?.value
      ? new Date(jobTargets.customer.value as any)
      : null,
    targetDate: j.targetDate ? new Date(j.targetDate) : null,
    dropDeadDate: jobTargets?.dropDead?.value
      ? new Date(jobTargets.dropDead.value as any)
      : j.dropDeadDate
        ? new Date(j.dropDeadDate)
        : null,
    cutSubmissionDate: j.cutSubmissionDate ? new Date(j.cutSubmissionDate) : null,
    assemblyStatuses: Object.fromEntries(
      (j.assemblies || []).map((a: any) => [
        String(a.id),
        normalizeAssemblyState(a.status as string | null) ?? "DRAFT",
      ])
    ),
    assemblyManualHoldOn: Object.fromEntries(
      (j.assemblies || []).map((a: any) => [String(a.id), Boolean(a.manualHoldOn)])
    ),
    assemblyManualHoldReason: Object.fromEntries(
      (j.assemblies || []).map((a: any) => [
        String(a.id),
        String(a.manualHoldReason || ""),
      ])
    ),
    assemblyManualHoldType: Object.fromEntries(
      (j.assemblies || []).map((a: any) => [
        String(a.id),
        String(a.manualHoldType || ""),
      ])
    ),
    assemblyWhiteboards: Object.fromEntries(
      (j.assemblies || []).map((a: any) => [
        String(a.id),
        String(a.statusWhiteboard || ""),
      ])
    ),
    assemblyTypes: Object.fromEntries(
      (j.assemblies || []).map((a: any) => [
        String(a.id),
        String((a as any).assemblyType || "Prod"),
      ])
    ),
  });
  const formInstanceIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `job-edit-${crypto.randomUUID()}`
      : `job-edit-${Math.random().toString(36).slice(2, 10)}`
  );
  const jobForm = useForm<any>({
    defaultValues: jobToDefaults(job),
  });
  const formInstanceId = formInstanceIdRef.current;
  const { isDirty: globalIsDirty, formInstanceId: globalFormInstanceId } =
    useGlobalFormContext();
  const debugFetcher = useFetcher();
  const [debugOpen, setDebugOpen] = useState(false);
  const isDev =
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.DEV === true) ||
    (typeof process !== "undefined" && process.env.NODE_ENV !== "production");
  const isAdminUser =
    !rootData?.userLevel || rootData?.userLevel === "Admin";
  const canDebug = Boolean(isDev && isAdminUser);
  const { registerFindCallback } = useFind();
  const save = (values: any) => {
    const cancelReason = String(values.jobCancelReason || "").trim();
    if (values.state === "CANCELED" && !cancelReason) {
      notifications.show({
        color: "red",
        title: "Cancellation requires a reason",
        message: "Enter a cancellation reason before saving.",
      });
      return;
    }
    const holdReason = String(values.jobHoldReason || "").trim();
    if (values.jobHoldOn && !holdReason) {
      notifications.show({
        color: "red",
        title: "Job hold requires a reason",
        message: "Enter a reason before enabling a job hold.",
      });
      return;
    }
    const assemblyHoldOnMap =
      (values.assemblyManualHoldOn as Record<string, boolean> | undefined) || {};
    const assemblyHoldReasonMap =
      (values.assemblyManualHoldReason as Record<string, string> | undefined) ||
      {};
    const missingAssemblyHoldReasons = Object.entries(assemblyHoldOnMap).filter(
      ([id, on]) => on && !String(assemblyHoldReasonMap[id] || "").trim()
    );
    if (missingAssemblyHoldReasons.length) {
      notifications.show({
        color: "red",
        title: "Assembly hold requires a reason",
        message: `Add a hold reason for assemblies: ${missingAssemblyHoldReasons
          .map(([id]) => id)
          .join(", ")}`,
      });
      return;
    }
    const fd = new FormData();
    fd.set("_intent", "job.update");
    const simple = [
      "projectCode",
      "name",
      "jobType",
      "customerPoNum",
      "statusWhiteboard",
      "state",
      "jobCancelMode",
      "jobHoldType",
    ];
    simple.forEach((k) => {
      if (values[k] != null) fd.set(k, values[k]);
    });
    if (Object.prototype.hasOwnProperty.call(values, "jobHoldOn")) {
      fd.set("jobHoldOn", values.jobHoldOn ? "true" : "false");
    }
    if (Object.prototype.hasOwnProperty.call(values, "jobCancelReason")) {
      fd.set("jobCancelReason", cancelReason);
    }
    if (Object.prototype.hasOwnProperty.call(values, "jobHoldReason")) {
      fd.set("jobHoldReason", holdReason);
    }
    const dirtyFields = jobForm.formState.dirtyFields as Record<string, any>;
    if (
      Object.prototype.hasOwnProperty.call(values, "endCustomerContactId") &&
      (dirtyFields?.endCustomerContactId || values.endCustomerContactId)
    ) {
      const raw = values.endCustomerContactId;
      fd.set(
        "endCustomerContactId",
        raw === undefined || raw === null ? "" : String(raw)
      );
    }
    if (Object.prototype.hasOwnProperty.call(values, "shipToAddressId")) {
      const raw = values.shipToAddressId;
      fd.set(
        "shipToAddressId",
        raw === undefined || raw === null ? "" : String(raw)
      );
    }
    const toDateString = (v: any) => {
      if (!v) return "";
      if (v instanceof Date) {
        return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
      }
      if (typeof v === "string") {
        // Accept YYYY-MM-DD or ISO; send YYYY-MM-DD
        return v.length >= 10 ? v.slice(0, 10) : v;
      }
      return "";
    };
    const shouldSendDate = (field: string) => Boolean(dirtyFields?.[field]);
    [
      "customerOrderDate",
      "internalTargetDate",
      "customerTargetDate",
      "targetDate",
      "dropDeadDate",
      "cutSubmissionDate",
    ].forEach((df) => {
      if (
        Object.prototype.hasOwnProperty.call(values, df) &&
        shouldSendDate(df)
      ) {
        fd.set(df, toDateString(values[df]));
      }
    });
    if (values.assemblyStatuses) {
      fd.set("assemblyStatuses", JSON.stringify(values.assemblyStatuses || {}));
    }
    if (values.assemblyManualHoldOn) {
      fd.set(
        "assemblyManualHoldOn",
        JSON.stringify(values.assemblyManualHoldOn || {})
      );
    }
    if (values.assemblyManualHoldReason) {
      fd.set(
        "assemblyManualHoldReason",
        JSON.stringify(values.assemblyManualHoldReason || {})
      );
    }
    if (values.assemblyManualHoldType) {
      fd.set(
        "assemblyManualHoldType",
        JSON.stringify(values.assemblyManualHoldType || {})
      );
    }
    if (values.assemblyWhiteboards) {
      fd.set(
        "assemblyWhiteboards",
        JSON.stringify(values.assemblyWhiteboards || {})
      );
    }
    if (values.assemblyTypes) {
      fd.set("assemblyTypes", JSON.stringify(values.assemblyTypes || {}));
    }
    submit(fd, { method: "post" });
  };
  useInitGlobalFormContext(
    jobForm as any,
    save,
    () => {
      // Reset to current defaultValues (kept in sync on loader change)
      jobForm.reset();
      console.log("[jobs.$id] discard changes -> form reset to original", {
        id: job.id,
      });
    },
    { formInstanceId }
  );

  // When loader returns a new job (e.g., after save/redirect), refresh defaults and clear dirty
  useEffect(() => {
    const nextDefaults = jobToDefaults(job);
    // Update both values and defaultValues so form is not dirty after save/navigation
    jobForm.reset(nextDefaults, { keepDirty: false, keepDefaultValues: false });
  }, [job, jobForm]);

  // Dirty state transition logging
  useEffect(() => {
    const sub = jobForm.watch((_val, info) => {
      // no-op; watch ensures formState updates promptly
    });
    return () => sub.unsubscribe();
  }, [jobForm]);

  const dirtyRef = React.useRef(jobForm.formState.isDirty);

  useEffect(() => {
    if (jobForm.formState.isDirty !== dirtyRef.current) {
      dirtyRef.current = jobForm.formState.isDirty;
    }
  }, [jobForm.formState.isDirty, jobForm.formState.dirtyFields, job.id]);

  const [customerSearch, setCustomerSearch] = useState("");
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c: any) =>
      (c.name || "").toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);
  const customerById = useMemo(() => {
    const map = new Map<number, any>();
    (customers || []).forEach((c: any) => {
      if (c?.id != null) map.set(Number(c.id), c);
    });
    return map;
  }, [customers]);
  const [companyAddresses, setCompanyAddresses] = useState<any[]>(
    shipToAddresses || []
  );
  const [contactAddresses, setContactAddresses] = useState<any[]>([]);
  useEffect(() => {
    setCompanyAddresses(shipToAddresses || []);
  }, [shipToAddresses]);
  const stockLocationId = jobForm.watch("stockLocationId") as
    | number
    | string
    | null;
  const companyId = jobForm.watch("companyId") as number | string | null;
  const endCustomerContactId = jobForm.watch("endCustomerContactId") as
    | number
    | string
    | null;
  const contactOptions = useMemo(() => {
    const companyKey = companyId != null && companyId !== "" ? Number(companyId) : null;
    return buildEndCustomerOptions(contacts || [], companyKey);
  }, [contacts, companyId]);
  const stockLocationLabel = useMemo(() => {
    if (stockLocationId == null || stockLocationId === "") return "—";
    const locId = Number(stockLocationId);
    const match = (locations || []).find((loc) => Number(loc.id) === locId);
    return match?.name || `Location ${locId}`;
  }, [locations, stockLocationId]);
  const companyAddressOptions = useMemo(() => {
    return (companyAddresses || []).map((addr: any) => {
      const lines = formatAddressLines(addr);
      const base = lines[0] || `Address ${addr.id}`;
      const tail = lines.slice(1).join(", ");
      return {
        value: String(addr.id),
        label: tail ? `${base} — ${tail}` : base,
        group: "Customer addresses",
      };
    });
  }, [companyAddresses]);
  const contactAddressOptions = useMemo(() => {
    return (contactAddresses || []).map((addr: any) => {
      const lines = formatAddressLines(addr);
      const base = lines[0] || `Address ${addr.id}`;
      const tail = lines.slice(1).join(", ");
      return {
        value: String(addr.id),
        label: tail ? `${base} — ${tail}` : base,
        group: "End-customer addresses",
      };
    });
  }, [contactAddresses]);
  const shipToAddressOptions = useMemo(() => {
    return endCustomerContactId
      ? [...companyAddressOptions, ...contactAddressOptions]
      : [...companyAddressOptions];
  }, [companyAddressOptions, contactAddressOptions, endCustomerContactId]);
  const shipToAddressById = useMemo(() => {
    const map = new Map<number, any>();
    [...companyAddresses, ...contactAddresses].forEach((addr: any) => {
      if (addr?.id != null) map.set(Number(addr.id), addr);
    });
    return map;
  }, [companyAddresses, contactAddresses]);
  const companyDefaultAddress = useMemo(() => {
    if (companyId == null || companyId === "") return null;
    const company = customerById.get(Number(companyId));
    const defaultId = company?.defaultAddressId ?? null;
    if (!defaultId) return null;
    return shipToAddressById.get(Number(defaultId)) ?? null;
  }, [companyId, customerById, shipToAddressById]);
  const prevCompanyIdRef = useRef<number | null>(null);
  useEffect(() => {
    const nextCompanyId =
      companyId != null && companyId !== "" ? Number(companyId) : null;
    if (!nextCompanyId) {
      prevCompanyIdRef.current = null;
      return;
    }
    if (prevCompanyIdRef.current === nextCompanyId) return;
    prevCompanyIdRef.current = nextCompanyId;
    if (companyAddressFetcher.state === "idle") {
      companyAddressFetcher.load(
        `/api/company-addresses?companyId=${nextCompanyId}`
      );
    }
  }, [companyId, companyAddressFetcher]);
  useEffect(() => {
    const data = companyAddressFetcher.data as { addresses?: any[] } | undefined;
    if (data?.addresses) {
      setCompanyAddresses(data.addresses);
    }
  }, [companyAddressFetcher.data]);
  const prevContactIdRef = useRef<number | null>(null);
  useEffect(() => {
    const nextContactId =
      endCustomerContactId != null && endCustomerContactId !== ""
        ? Number(endCustomerContactId)
        : null;
    if (prevContactIdRef.current === nextContactId) return;
    prevContactIdRef.current = nextContactId;
    if (!nextContactId) {
      setContactAddresses([]);
      return;
    }
    if (contactAddressFetcher.state === "idle") {
      contactAddressFetcher.load(
        `/api/contact-addresses?contactId=${nextContactId}`
      );
    }
  }, [endCustomerContactId, contactAddressFetcher]);
  useEffect(() => {
    if (!endCustomerContactId || contactAddresses.length) return;
    const nextContactId = Number(endCustomerContactId);
    if (!Number.isFinite(nextContactId)) return;
    if (contactAddressFetcher.state === "idle") {
      contactAddressFetcher.load(
        `/api/contact-addresses?contactId=${nextContactId}`
      );
    }
  }, [endCustomerContactId, contactAddresses.length, contactAddressFetcher]);
  useEffect(() => {
    const data = contactAddressFetcher.data as { addresses?: any[] } | undefined;
    if (data?.addresses) {
      setContactAddresses(data.addresses);
    }
  }, [contactAddressFetcher.data]);
  const toDateInputValue = (value: any) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "string") {
      const parsed = new Date(value);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    return null;
  };
  const formatDateLabel = (value: Date | string | null | undefined) => {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  const buildOverrideTooltip = (
    label: string,
    effective: Date | string | null | undefined,
    jobValue: Date | string | null | undefined
  ) => {
    const effectiveLabel = formatDateLabel(effective);
    const jobLabel = formatDateLabel(jobValue);
    return `Pinned (${label}). Effective: ${effectiveLabel} · Job: ${jobLabel}`;
  };
  const jobInternalDate = toDateInputValue(jobForm.watch("internalTargetDate"));
  const jobCustomerDate = toDateInputValue(jobForm.watch("customerTargetDate"));
  const dirtyFields = jobForm.formState.dirtyFields as Record<string, any>;
  const jobDateError =
    jobInternalDate && jobCustomerDate && jobInternalDate > jobCustomerDate
      ? "Internal target date must be on or before customer target date."
      : null;
  const [productSearch, setProductSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState(true);
  const [assemblyOnly, setAssemblyOnly] = useState(true);
  const [hoverGroupId, setHoverGroupId] = useState<number | null>(null);
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return productChoices;
    return productChoices.filter((p: any) =>
      ((p.sku || "") + " " + (p.name || "")).toLowerCase().includes(q)
    );
  }, [productChoices, productSearch]);
  const assembliesById = useMemo(() => {
    const map = new Map<number, any>();
    (job.assemblies || []).forEach((asm: any) => {
      if (asm?.id != null) map.set(Number(asm.id), asm);
    });
    return map;
  }, [job.assemblies]);
  const assemblyManualHoldOnMap =
    (jobForm.watch("assemblyManualHoldOn") as Record<string, boolean | undefined>) ||
    {};
  const assemblyManualHoldReasonMap =
    (jobForm.watch("assemblyManualHoldReason") as Record<string, string | undefined>) ||
    {};
  const assemblyManualHoldTypeMap =
    (jobForm.watch("assemblyManualHoldType") as Record<string, string | undefined>) ||
    {};
  const openAssemblyCancel = useCallback(
    (assembly: any, mode: "full" | "remaining") => {
      const ordered = Array.isArray(assembly.qtyOrderedBreakdown)
        ? (assembly.qtyOrderedBreakdown as number[])
        : [];
      const existingCanceled = Array.isArray(
        (assembly as any).c_canceled_Breakdown
      )
        ? ((assembly as any).c_canceled_Breakdown as number[])
        : [];
      const effectiveOrdered = computeEffectiveOrderedBreakdown({
        orderedBySize: ordered,
        canceledBySize: existingCanceled,
      }).effective;
      const cut = Array.isArray((assembly as any).c_qtyCut_Breakdown)
        ? ((assembly as any).c_qtyCut_Breakdown as number[])
        : [];
      const sew = Array.isArray((assembly as any).c_qtySew_Breakdown)
        ? ((assembly as any).c_qtySew_Breakdown as number[])
        : [];
      const finish = Array.isArray((assembly as any).c_qtyFinish_Breakdown)
        ? ((assembly as any).c_qtyFinish_Breakdown as number[])
        : [];
      const pack = Array.isArray((assembly as any).c_qtyPack_Breakdown)
        ? ((assembly as any).c_qtyPack_Breakdown as number[])
        : [];
      const hasPack = pack.some((n) => Number(n) > 0);
      const hasFinish = finish.some((n) => Number(n) > 0);
      const hasSew = sew.some((n) => Number(n) > 0);
      const hasCut = cut.some((n) => Number(n) > 0);
      const baselineLabel = hasPack
        ? "PACK"
        : hasFinish
        ? "FINISH"
        : hasSew
        ? "SEW"
        : hasCut
        ? "CUT"
        : "ORDER";
      const baselineArr = hasPack
        ? pack
        : hasFinish
        ? finish
        : hasSew
        ? sew
        : hasCut
        ? cut
        : [];
      const defaultCancel =
        mode === "full"
          ? effectiveOrdered
          : effectiveOrdered.map((val, idx) =>
              Math.max(0, Number(val || 0) - (Number(baselineArr[idx] || 0) || 0))
            );
      const labels = (assembly.product?.variantSet?.variants ||
        assembly.variantSet?.variants ||
        []) as string[];
      const trimmedLabels = getVariantLabels(
        labels,
        (assembly as any).c_numVariants
      );
      const lastNonZero = Math.max(
        ...defaultCancel.map((n, idx) => (Number(n) > 0 ? idx : -1)),
        ...effectiveOrdered.map((n, idx) => (Number(n) > 0 ? idx : -1))
      );
      const effectiveLen = Math.max(trimmedLabels.length, lastNonZero + 1, 1);
      const colLabels = Array.from({ length: effectiveLen }, (_, idx) => {
        return trimmedLabels[idx] || `Variant ${idx + 1}`;
      });
      setAsmCancelTarget(assembly);
      setCancelArr(
        Array.from({ length: effectiveLen }, (_, idx) => defaultCancel[idx] || 0)
      );
      setCancelLabels(colLabels);
      setAsmCancelReason("");
      setAsmCancelOverride(false);
      setAsmCancelMode(mode);
      setAsmCancelBaseline(baselineLabel);
      setAsmCancelOpen(true);
    },
    []
  );

  useEffect(() => {
    if (!qtyAsm) return;
    const labels: string[] = Array.isArray(qtyAsm.labels) ? qtyAsm.labels : [];
    const cols = getVariantLabels(labels, qtyAsm.c_numVariants as any);
    setQtyLabels(cols);
    const orderedRaw: number[] = Array.isArray(qtyAsm.qtyOrderedBreakdown)
      ? qtyAsm.qtyOrderedBreakdown
      : [];
    const initial = Array.from(
      { length: cols.length },
      (_, i) => orderedRaw[i] || 0
    );
    setOrderedArr(initial);
  }, [qtyAsm]);

  // Prev/Next keyboard hotkeys handled globally in RecordProvider

  // Find modal handled via JobFindManager now

  // Selection for grouping
  const [selectedAsmIds, setSelectedAsmIds] = useState<number[]>([]);
  const toggleSelected = useCallback((id: number, on?: boolean) => {
    setSelectedAsmIds((prev) => {
      const has = prev.includes(id);
      if (on === true || (!has && on === undefined)) return [...prev, id];
      if (on === false || (has && on === undefined))
        return prev.filter((x) => x !== id);
      return prev;
    });
  }, []);
  const handleGroupSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      if (selectedAsmIds.length < 2) return;
      const statuses = new Set<string>();
      const idsWithActivity: number[] = [];
      const missing: number[] = [];
      for (const asmId of selectedAsmIds) {
        const asm = assembliesById.get(asmId);
        if (!asm) {
          missing.push(asmId);
          continue;
        }
        const normalized =
          normalizeAssemblyState(asm.status as string | null) ?? "DRAFT";
        statuses.add(normalized);
        if ((activityCounts?.[asmId] || 0) > 0) {
          idsWithActivity.push(asmId);
        }
      }
      const issues: string[] = [];
      if (statuses.size > 1) {
        const label = Array.from(statuses).join(", ");
        issues.push(`Selected assemblies are in different states (${label}).`);
      }
      if (idsWithActivity.length > 0) {
        issues.push(
          `Assemblies ${idsWithActivity.join(", ")} have recorded activity.`
        );
      }
      if (missing.length > 0) {
        issues.push(`Assemblies ${missing.join(", ")} could not be found.`);
      }
      if (issues.length > 0) {
        event.preventDefault();
        setGroupGuardMessage(
          [
            "Assemblies can only be grouped when they share the same state and have no activity.",
            issues.join(" "),
          ]
            .join(" ")
            .trim()
        );
      }
    },
    [selectedAsmIds, assembliesById, activityCounts]
  );

  const jobWhiteboardValue = jobForm.watch("statusWhiteboard") ?? "";
  const jobStateValue =
    (jobForm.watch("state") as string | undefined) ||
    ((job as any)?.state ?? "DRAFT");
  const jobHoldOn = Boolean(
    jobForm.watch("jobHoldOn") ?? (job as any)?.jobHoldOn
  );
  const jobHoldReason =
    (jobForm.watch("jobHoldReason") as string | undefined) ||
    ((job as any)?.jobHoldReason ?? "");
  const jobHoldType =
    (jobForm.watch("jobHoldType") as string | undefined) ||
    ((job as any)?.jobHoldType ?? "");
  const jobHoldSegmentValue = jobHoldOn
    ? jobHoldType === "CLIENT"
      ? "CLIENT"
      : "INTERNAL"
    : "OFF";

  const openEntityModal = useCallback(
    ({ entity, id }: { entity: string; id: string | number }) => {
      if (id == null || id === "") return;
      if (entity === "Address") {
        navigate(`/addresses/${id}`);
      }
    },
    [navigate]
  );

  const jobFieldCtx = useMemo(
    () => ({
      jobState: jobStateValue,
      stockLocationLabel,
      addressById: shipToAddressById,
      jobShipToLocation: job?.shipToLocation ?? null,
      jobDefaultAddress: companyDefaultAddress,
      jobDateError,
      job,
      productsById,
      assemblyTargetsById,
      openEntityModal,
      fieldOptions: {
        endCustomerContact: contactOptions,
        job_shipto_address: shipToAddressOptions,
      },
    }),
    [
      jobStateValue,
      stockLocationLabel,
      shipToAddressById,
      job?.shipToLocation,
      companyDefaultAddress,
      openEntityModal,
      contactOptions,
      shipToAddressOptions,
      jobDateError,
      job,
      productsById,
      assemblyTargetsById,
    ]
  );

  const jobOrderDate = jobForm.watch("customerOrderDate") as Date | null;
  const jobCustomerTargetDate = jobForm.watch("customerTargetDate") as
    | Date
    | null;
  useEffect(() => {
    if (jobStateValue !== "DRAFT") return;
    const dirty = jobForm.formState.dirtyFields as Record<string, any>;
    if (dirty?.internalTargetDate) return;
    const derived = deriveInternalTargetDate({
      baseDate: jobOrderDate,
      customerTargetDate: jobCustomerTargetDate,
      defaultLeadDays,
      bufferDays: internalTargetBufferDays,
      now: new Date(),
    });
    if (!derived) return;
    const current = jobForm.getValues("internalTargetDate") as Date | null;
    const sameDay =
      current && derived
        ? current.toISOString().slice(0, 10) === derived.toISOString().slice(0, 10)
        : false;
    if (!sameDay) {
      jobForm.setValue("internalTargetDate", derived, {
        shouldDirty: false,
        shouldTouch: false,
      });
    }
  }, [
    jobStateValue,
    jobOrderDate,
    jobCustomerTargetDate,
    defaultLeadDays,
    internalTargetBufferDays,
    jobForm,
  ]);

  const jobHoldDisabled =
    jobStateValue === "COMPLETE" || jobStateValue === "CANCELED";
  const holdSegmentOptions = [
    { value: "OFF", label: "Off" },
    { value: "CLIENT", label: "Client hold" },
    { value: "INTERNAL", label: "Internal hold" },
  ];
  const jobStateOptions = [
    { label: "Draft", value: "DRAFT" },
    { label: "New", value: "NEW" },
    { label: "Active", value: "ACTIVE" },
    { label: "Complete", value: "COMPLETE" },
    { label: "Canceled", value: "CANCELED" },
  ];
  const jobStateLabels = Object.fromEntries(
    jobStateOptions.map((opt) => [opt.value, opt.label])
  ) as Record<string, string>;
  const jobStateLabel = jobStateLabels[jobStateValue] || jobStateValue;
  const legacyJobStatusLabel = job.status || "—";
  const stateTransitionMeta: Record<
    string,
    { title: string; text: string; confirmLabel: string }
  > = {
    "DRAFT->NEW": {
      title: "Move job to New?",
      text: "This signals setup is complete and shifts the detail view into execution mode.",
      confirmLabel: "Move to New",
    },
    "NEW->ACTIVE": {
      title: "Start job?",
      text: "This begins execution and marks the job as active.",
      confirmLabel: "Start job",
    },
    "ACTIVE->COMPLETE": {
      title: "Complete job?",
      text: "Completing a job should only happen once assemblies are done.",
      confirmLabel: "Mark complete",
    },
  };
  const transitionKey = (from: string, to: string) => `${from}->${to}`;
  const requiresStateConfirm = (from: string, to: string) =>
    Boolean(stateTransitionMeta[transitionKey(from, to)]);
  const pendingStateMeta =
    pendingJobState && jobStateValue
      ? stateTransitionMeta[transitionKey(jobStateValue, pendingJobState)]
      : null;
  const stickyRailStyle = {
    position: "sticky" as const,
    left: 0,
    background: "var(--mantine-color-body)",
    zIndex: 2,
  };
  const stickyAssemblyStyle = {
    position: "sticky" as const,
    left: 25,
    background: "var(--mantine-color-body)",
    zIndex: 1,
  };
  const asmCancelOrderedBySize = Array.isArray(
    asmCancelTarget?.qtyOrderedBreakdown
  )
    ? (asmCancelTarget.qtyOrderedBreakdown as number[])
    : [];
  const asmCancelExistingCanceled = Array.isArray(
    (asmCancelTarget as any)?.c_canceled_Breakdown
  )
    ? ((asmCancelTarget as any).c_canceled_Breakdown as number[])
    : [];
  const asmCancelOrderedTotal = computeOrderedTotal(asmCancelOrderedBySize);
  const asmCancelPackBySize = Array.isArray((asmCancelTarget as any)?.c_qtyPack_Breakdown)
    ? ((asmCancelTarget as any).c_qtyPack_Breakdown as number[])
    : [];
  const asmCancelFinishBySize = Array.isArray((asmCancelTarget as any)?.c_qtyFinish_Breakdown)
    ? ((asmCancelTarget as any).c_qtyFinish_Breakdown as number[])
    : [];
  const asmCancelCutBySize = Array.isArray((asmCancelTarget as any)?.c_qtyCut_Breakdown)
    ? ((asmCancelTarget as any).c_qtyCut_Breakdown as number[])
    : [];
  const asmCancelSewBySize = Array.isArray((asmCancelTarget as any)?.c_qtySew_Breakdown)
    ? ((asmCancelTarget as any).c_qtySew_Breakdown as number[])
    : [];
  const asmCancelCombinedCanceled = sumBreakdownArrays([
    asmCancelExistingCanceled,
    cancelArr,
  ]);
  const asmCancelComputed = computeEffectiveOrderedBreakdown({
    orderedBySize: asmCancelOrderedBySize,
    canceledBySize: asmCancelCombinedCanceled,
  });
  const asmCancelNewTotal = cancelArr.reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );
  const asmCancelEffectiveOrdered = asmCancelComputed.total;
  const asmCancelHardBlock = asmCancelComputed.effective.some(
    (val, idx) =>
      val < (Number(asmCancelPackBySize[idx] ?? 0) || 0) ||
      val < (Number(asmCancelFinishBySize[idx] ?? 0) || 0)
  );
  const asmCancelSoftBlock = asmCancelComputed.effective.some(
    (val, idx) =>
      val <
      Math.max(
        Number(asmCancelCutBySize[idx] ?? 0) || 0,
        Number(asmCancelSewBySize[idx] ?? 0) || 0
      )
  );
  const applyJobCancel = (mode: "job_only" | "cancel_remaining") => {
    const reason = jobCancelReason.trim();
    jobForm.setValue("jobCancelReason", reason, {
      shouldDirty: true,
      shouldTouch: true,
    });
    jobForm.setValue("jobCancelMode", mode, {
      shouldDirty: true,
      shouldTouch: true,
    });
    jobForm.setValue("state", "CANCELED", {
      shouldDirty: true,
      shouldTouch: true,
    });
    setJobCancelOpen(false);
  };
  const requestJobStateChange = (nextState: string) => {
    if (!nextState || nextState === jobStateValue) return;
    if (nextState === "CANCELED") {
      setJobCancelReason(String(jobForm.getValues("jobCancelReason") || ""));
      setJobCancelOpen(true);
      return;
    }
    if (requiresStateConfirm(jobStateValue, nextState)) {
      setPendingJobState(nextState);
      setJobStateConfirmOpen(true);
      return;
    }
    jobForm.setValue("state", nextState, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };
  const confirmJobStateChange = () => {
    if (!pendingJobState) return;
    jobForm.setValue("state", pendingJobState, {
      shouldDirty: true,
      shouldTouch: true,
    });
    setPendingJobState(null);
    setJobStateConfirmOpen(false);
  };

  // returnUrl no longer used (find handled externally)
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
        {(() => {
          const appendHref = useFindHrefAppender();
          const saved = getSavedIndexSearch("/jobs");
          const hrefJobs = saved ? `/jobs${saved}` : appendHref("/jobs");
          return (
            <BreadcrumbSet
              breadcrumbs={[
                { label: "Jobs", href: hrefJobs },
                { label: String(job.id), href: appendHref(`/jobs/${job.id}`) },
              ]}
            />
          );
        })()}
        <Group gap="sm" align="center" wrap="wrap">
          <Text size="xs" c="dimmed">
            Legacy: {legacyJobStatusLabel}
          </Text>
          <Stack gap={4}>
            <Menu position="bottom-start" withArrow>
              <Menu.Target>
                <Button
                  variant="light"
                  rightSection={<IconChevronDown size={16} />}
                >
                  {jobStateLabel}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {jobStateOptions.map((opt) => (
                  <Menu.Item
                    key={opt.value}
                    disabled={opt.value === jobStateValue}
                    onClick={() => requestJobStateChange(opt.value)}
                  >
                    {opt.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </Stack>
          <Stack gap={4}>
            <SegmentedControl
              data={holdSegmentOptions}
              value={jobHoldSegmentValue}
              disabled={jobHoldDisabled}
              onChange={(value) => {
                if (value === "OFF") {
                  jobForm.setValue("jobHoldOn", false, {
                    shouldDirty: true,
                    shouldTouch: true,
                  });
                  jobForm.setValue("jobHoldReason", "", {
                    shouldDirty: true,
                    shouldTouch: true,
                  });
                  jobForm.setValue("jobHoldType", "", {
                    shouldDirty: true,
                    shouldTouch: true,
                  });
                  return;
                }
                jobForm.setValue("jobHoldOn", true, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
                jobForm.setValue("jobHoldType", value, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
              size="xs"
            />
            {jobHoldSegmentValue !== "OFF" ? (
              <Textarea
                placeholder="Hold reason"
                value={jobHoldReason}
                onChange={(e) =>
                  jobForm.setValue("jobHoldReason", e.currentTarget.value, {
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
                size="xs"
                autosize
                minRows={2}
              />
            ) : null}
          </Stack>
          <TextInput
            placeholder="Whiteboard"
            aria-label="Job status whiteboard"
            value={jobWhiteboardValue}
            onChange={(e) =>
              jobForm.setValue("statusWhiteboard", e.currentTarget.value, {
                shouldDirty: true,
                shouldTouch: true,
              })
            }
            style={{ minWidth: 220 }}
          />
          <Menu position="bottom-end" withArrow>
            <Menu.Target>
              <ActionIcon variant="subtle" size="sm" aria-label="Job actions">
                <IconMenu2 size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                component={Link}
                to="/jobs/new"
                leftSection={<IconCopy size={14} />}
              >
                New Job
              </Menu.Item>
              <Menu.Item
                leftSection={<IconCopy size={14} />}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("_intent", "job.duplicate");
                  submit(fd, { method: "post" });
                }}
              >
                Duplicate Job
              </Menu.Item>
              {canDebug ? (
                <Menu.Item
                  leftSection={<IconBug size={14} />}
                  onClick={() => {
                    setDebugOpen(true);
                  }}
                >
                  Debug
                </Menu.Item>
              ) : null}
              <Menu.Item
                leftSection={<IconTrash size={14} />}
                color="red"
                disabled={hasAssemblyActivity}
                title={
                  hasAssemblyActivity
                    ? "Cannot delete: assemblies have recorded activity"
                    : undefined
                }
                onClick={() => setDeleteOpen(true)}
              >
                Delete Job
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <JobDetailForm
        mode="edit"
        form={jobForm as any}
        job={job}
        openCustomerModal={() => setCustomerModalOpen(true)}
        fieldCtx={jobFieldCtx}
        onSave={(values) => save(values)}
      />


      {canDebug
        ? (() => {
            const debugDefaults = jobToDefaults(job);
            const dirtySources = {
              rhf: {
                isDirty: jobForm.formState.isDirty,
                dirtyFieldsCount: Object.keys(
                  jobForm.formState.dirtyFields || {}
                ).length,
                touchedFieldsCount: Object.keys(
                  jobForm.formState.touchedFields || {}
                ).length,
                submitCount: jobForm.formState.submitCount,
                formInstanceId,
              },
              global: {
                isDirty: globalIsDirty,
                formInstanceId: globalFormInstanceId,
              },
              computed: {
                headerIsDirty: globalIsDirty,
              },
            };
            const formInstances = {
              globalFormInstanceId,
              jobFormInstanceId: formInstanceId,
            };
            const globalIdMissing = !globalFormInstanceId;
            const assertions = {
              globalMatchesEdit: globalIdMissing
                ? null
                : Boolean(
                    formInstanceId &&
                      globalFormInstanceId === formInstanceId
                  ),
              globalIdMissing,
            };
            const debugData = buildFormStateDebugData({
              formId: `job-${job.id}`,
              formState: jobForm.formState,
              values: jobForm.getValues(),
              builderDefaults: debugDefaults,
              rhfDefaults: jobForm.control?._defaultValues ?? null,
              rhfValues: jobForm.control?._formValues ?? null,
              control: jobForm.control,
            });
            const debugText = buildFormStateDebugText(debugData, true, {
              dirtySources,
              formInstances,
              assertions,
            });
            return (
              <DebugDrawer
                opened={debugOpen}
                onClose={() => setDebugOpen(false)}
                title={`Debug – Job ${job.id}`}
                payload={debugFetcher.data as any}
                loading={debugFetcher.state !== "idle"}
                formStateCopyText={debugText}
                formStatePanel={
                  <FormProvider {...jobForm}>
                    <FormStateDebugPanel
                      formId={`job-${job.id}`}
                      getDefaultValues={() => debugDefaults}
                      collapseLong
                      dirtySources={dirtySources}
                      formInstances={formInstances}
                      assertions={assertions}
                    />
                  </FormProvider>
                }
              />
            );
          })()
        : null}

      <JobFindManager jobSample={job} />

      {true && (
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Group justify="space-between" align="center">
              <Title order={4}>Assemblies</Title>
              <Button
                variant="light"
                onClick={() => {
                  setCustomerFilter(true);
                  setAssemblyOnly(true);
                  setProductModalOpen(true);
                }}
                disabled={jobForm.formState.isDirty}
              >
                Add Assembly
              </Button>
            </Group>
          </Card.Section>
          <Divider my="xs" />
          <Group justify="space-between" mb="xs">
            {selectedAsmIds?.length > 0 ? (
              <Text c="dimmed">Selected: {selectedAsmIds.length}</Text>
            ) : (
              <span> </span>
            )}
            <Group gap="xs">
              <Form method="post" onSubmit={handleGroupSubmit}>
                <input type="hidden" name="_intent" value="assembly.group" />
                <input
                  type="hidden"
                  name="assemblyIds"
                  value={selectedAsmIds.join(",")}
                />
                <Button
                  type="submit"
                  variant="default"
                  disabled={selectedAsmIds.length < 2}
                >
                  Group
                </Button>
              </Form>
            </Group>
          </Group>
          <div style={{ overflowX: "auto" }}>
            <Table
              // withTableBorder
              withRowBorders
              withColumnBorders
              highlightOnHover
              className="asm-rail-table"
            >
              <Table.Thead>
              <Table.Tr>
                <Table.Th
                  className="asm-rail-cell"
                  style={{ width: 25, ...stickyRailStyle }}
                />
                <Table.Th style={stickyAssemblyStyle}>Assembly</Table.Th>
                <Table.Th># Ordered</Table.Th>
                <Table.Th>Cut</Table.Th>
                <Table.Th>Made</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Holds / Blockers</Table.Th>
                <Table.Th>Internal Target</Table.Th>
                <Table.Th style={{ width: 40 }}></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(() => {
                const rows = (job.assemblies || []) as any[];
                // Build a map of groupId -> member id list for deep-linking and grouping
                const groupMembers = new Map<number, number[]>();
                const rowById = new Map<number, any>();
                for (const r of rows) {
                  rowById.set(Number(r.id), r);
                  const gid = r?.assemblyGroupId ?? null;
                  if (gid != null) {
                    const arr = groupMembers.get(gid) || [];
                    arr.push(Number(r.id));
                    groupMembers.set(gid, arr);
                  }
                }
                // Sort member lists for stable, canonical URLs
                for (const [gid, arr] of groupMembers.entries()) {
                  arr.sort((a, b) => a - b);
                  groupMembers.set(gid, arr);
                }
                // Build final ordered list: sort by id, but when hitting a grouped id, emit the whole group
                const sortedIds = Array.from(rowById.keys()).sort(
                  (a, b) => a - b
                );
                const visited = new Set<number>();
                const finalRows: any[] = [];
                for (const id of sortedIds) {
                  if (visited.has(id)) continue;
                  const r = rowById.get(id);
                  const gid = r?.assemblyGroupId ?? null;
                  if (gid == null) {
                    finalRows.push(r);
                    visited.add(id);
                  } else {
                    const members = groupMembers.get(gid) || [id];
                    for (const mid of members) {
                      if (visited.has(mid)) continue;
                      const mr = rowById.get(mid);
                      if (mr) {
                        finalRows.push(mr);
                        visited.add(mid);
                      }
                    }
                  }
                }
                const getPos = (
                  idx: number
                ): "first" | "middle" | "last" | "solo" | null => {
                  const cur = finalRows[idx];
                  const gid = cur?.assemblyGroupId ?? null;
                  if (!gid) return null;
                  const prevSame =
                    idx > 0 &&
                    (finalRows[idx - 1]?.assemblyGroupId ?? null) === gid;
                  const nextSame =
                    idx < finalRows.length - 1 &&
                    (finalRows[idx + 1]?.assemblyGroupId ?? null) === gid;
                  if (!prevSame && !nextSame) return "solo";
                  if (!prevSame && nextSame) return "first";
                  if (prevSame && nextSame) return "middle";
                  return "last";
                };
                return finalRows.map((a: any, idx: number) => {
                  const p = a.productId
                    ? (productsById as any)[a.productId]
                    : null;
                  const pos = getPos(idx);
                  const canDelete = (activityCounts?.[a.id] || 0) === 0;
                  const groupMemberList =
                    typeof a.assemblyGroupId === "number"
                      ? groupMembers.get(a.assemblyGroupId)
                      : null;
                  const memberIds =
                    groupMemberList && groupMemberList.length > 0
                      ? groupMemberList
                      : [a.id];
                  const isGroupedRow = memberIds.length > 1;
                  const isGroupLeader = isGroupedRow && pos === "first";
                  const manualHoldOn = Boolean(
                    assemblyManualHoldOnMap[String(a.id)] ?? a.manualHoldOn
                  );
                  const manualHoldReason =
                    assemblyManualHoldReasonMap[String(a.id)] ??
                    a.manualHoldReason ??
                    "";
                  const manualHoldType =
                    assemblyManualHoldTypeMap[String(a.id)] ??
                    a.manualHoldType ??
                    "";
                  const holdOverlay = deriveAssemblyHoldOverlay({
                    jobHoldOn,
                    jobHoldType,
                    jobHoldReason,
                    manualHoldOn,
                    manualHoldType,
                    manualHoldReason,
                  });
                  const isHovered =
                    isGroupedRow &&
                    hoverGroupId != null &&
                    hoverGroupId === a.assemblyGroupId;
                  const orderedBySize = Array.isArray(a.qtyOrderedBreakdown)
                    ? (a.qtyOrderedBreakdown as number[])
                    : [];
                  const canceledBySize = Array.isArray(
                    (a as any).c_canceled_Breakdown
                  )
                    ? ((a as any).c_canceled_Breakdown as number[])
                    : [];
                  const { effective, canceled, total } =
                    computeEffectiveOrderedBreakdown({
                      orderedBySize,
                      canceledBySize,
                    });
                  const orderedTotal = computeOrderedTotal(orderedBySize);
                  const canceledQty = canceled.reduce(
                    (sum, value) => sum + (Number(value) || 0),
                    0
                  );
                  const effectiveOrdered = total;
                  const hasProductionActivity =
                    Number((a as any).c_qtyCut ?? 0) > 0 ||
                    Number((a as any).c_qtySew ?? 0) > 0 ||
                    Number((a as any).c_qtyFinish ?? 0) > 0 ||
                    Number((a as any).c_qtyPack ?? 0) > 0;
                  const targets = assemblyTargetsById?.[a.id];
                  const internalTarget = targets?.internal;
                  const derivedStatus = deriveAssemblyOperationalStatus({
                    orderedBySize: a.qtyOrderedBreakdown,
                    canceledBySize: (a as any).c_canceled_Breakdown,
                    qtyCut: (a as any).c_qtyCut,
                    qtySew: (a as any).c_qtySew,
                    qtyFinish: (a as any).c_qtyFinish,
                    qtyPack: (a as any).c_qtyPack,
                  });
                  const rowClassName =
                    [
                      isGroupedRow ? "asm-row-group" : "",
                      isHovered ? "is-group-hovered" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                      .trim() || undefined;
                  return (
                    <Table.Tr
                      key={a.id}
                      className={rowClassName}
                      onMouseEnter={() =>
                        setHoverGroupId(a.assemblyGroupId ?? null)
                      }
                      onMouseLeave={() => setHoverGroupId(null)}
                    >
                      <Table.Td
                        align="center"
                        className={`asm-rail-cell ${pos ? "is-in-group" : ""} ${
                          pos === "first" ? "is-first" : ""
                        } ${pos === "last" ? "is-last" : ""}`}
                        style={stickyRailStyle}
                      >
                        {pos === "first" ? (
                          <Tooltip label="Linked group">
                            <ActionIcon
                              variant="transparent"
                              color="gray"
                              size="xs"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <IconLink size={16} />
                            </ActionIcon>
                          </Tooltip>
                        ) : (
                          pos === null && (
                            <input
                              type="checkbox"
                              checked={selectedAsmIds.includes(a.id)}
                              onChange={(e) =>
                                toggleSelected(a.id, e.currentTarget.checked)
                              }
                            />
                          )
                        )}
                      </Table.Td>

                      <Table.Td style={stickyAssemblyStyle}>
                        <Stack gap={2}>
                          <Link
                            to={
                              a.assemblyGroupId
                                ? `assembly/${(
                                    groupMembers.get(a.assemblyGroupId) || [a.id]
                                  ).join(",")}`
                                : `assembly/${a.id}`
                            }
                          >
                            {a.name || p?.name || `Assembly ${a.id}`}
                          </Link>
                          <Text size="xs" c="dimmed">
                            {p?.sku ? `SKU ${p.sku}` : `Assembly ${a.id}`}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm">{effectiveOrdered}</Text>
                          {canceledQty > 0 ? (
                            <Text size="xs" c="dimmed">
                              Canceled {canceledQty}/{orderedTotal}
                            </Text>
                          ) : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{derivedStatus.cutQty}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{derivedStatus.makeQty}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {ASSEMBLY_OPERATIONAL_STATUS_LABELS[derivedStatus.status]}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {holdOverlay.hasHold ? (
                          <Group gap="xs" wrap="wrap">
                            {holdOverlay.labels.map((hold, index) => (
                              <Tooltip
                                key={`${a.id}-hold-${index}`}
                                label={hold.reason || undefined}
                                disabled={!hold.reason}
                              >
                                <Badge size="xs" color="orange" variant="light">
                                  {hold.label}
                                </Badge>
                              </Tooltip>
                            ))}
                          </Group>
                        ) : (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <Text size="sm">
                            {formatDateLabel(internalTarget?.value)}
                          </Text>
                          <OverrideIndicator
                            isOverridden={internalTarget?.source === "OVERRIDE"}
                            tooltip={buildOverrideTooltip(
                              "internal target",
                              internalTarget?.value,
                              internalTarget?.jobValue
                            )}
                          />
                        </Group>
                      </Table.Td>
                      <Table.Td align="center">
                        <AssemblyRowMenu
                          assembly={a}
                          disabled={jobForm.formState.isDirty}
                          canDelete={canDelete}
                          submit={submit}
                          onCancelRemaining={() =>
                            openAssemblyCancel(a, "remaining")
                          }
                          onCancelAssembly={() => openAssemblyCancel(a, "full")}
                          hasProductionActivity={hasProductionActivity}
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                });
              })()}
              </Table.Tbody>
            </Table>
          </div>
        </Card>
      )}

      {/* Customer Picker Modal */}
      <HotkeyAwareModalRoot
        opened={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        centered
      >
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header>
            <Stack>
              <Text>Select Customer</Text>
              <TextInput
                placeholder="Search customers..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.currentTarget.value)}
              />
            </Stack>
          </Modal.Header>
          <Modal.Body>
            {filteredCustomers.map((c: any) => (
              <Group
                key={c.id}
                py={6}
                onClick={() => {
                  jobForm.setValue("companyId", c.id as any);
                  setCustomerModalOpen(false);
                }}
                style={{ cursor: "pointer" }}
              >
                <Text>{c.name}</Text>
              </Group>
            ))}
          </Modal.Body>
        </Modal.Content>
      </HotkeyAwareModalRoot>

      {/* Product Picker Modal for new Assembly */}
      <HotkeyAwareModal
        opened={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title="Add Assembly from Product"
        size="xl"
        centered
      >
        <Stack>
          <Group align="flex-end" justify="space-between">
            <TextInput
              placeholder="Search products..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.currentTarget.value)}
              w={320}
            />
            <Group>
              <Switch
                label="Customer"
                checked={customerFilter}
                onChange={(e) => setCustomerFilter(e.currentTarget.checked)}
              />
              <Switch
                label="Assembly"
                checked={assemblyOnly}
                onChange={(e) => setAssemblyOnly(e.currentTarget.checked)}
              />
            </Group>
          </Group>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {filteredProducts
              .filter(
                (p: any) =>
                  !customerFilter ||
                  (jobForm.watch("companyId")
                    ? p.customerId === jobForm.watch("companyId")
                    : true)
              )
              .filter(
                (p: any) => !assemblyOnly || (p._count?.productLines ?? 0) > 0
              )
              .map((p: any) => (
                <Group
                  key={p.id}
                  py={6}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("_intent", "assembly.createFromProduct");
                    fd.set("productId", String(p.id));
                    submit(fd, { method: "post" });
                    setProductModalOpen(false);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <Text w={60}>{p.id}</Text>
                  <Text w={160}>{p.sku}</Text>
                  <Group gap={6} style={{ flex: 1 }} wrap="nowrap">
                    <Text>{p.name}</Text>
                    <ProductStageIndicator stage={p.productStage} />
                  </Group>
                </Group>
              ))}
          </div>
        </Stack>
      </HotkeyAwareModal>

      {/* Edit Ordered Breakdown Modal */}
      <HotkeyAwareModal
        opened={qtyModalOpen}
        onClose={() => {
          setQtyModalOpen(false);
          setQtyAsm(null);
        }}
        title="Edit Ordered Quantities"
        size="auto"
        centered
      >
        {qtyAsm && (
          <form
            method="post"
            onSubmit={() => {
              setQtyModalOpen(false);
            }}
          >
            <input
              type="hidden"
              name="_intent"
              value="assembly.updateOrderedBreakdown"
            />
            <input type="hidden" name="assemblyId" value={qtyAsm.id} />
            <input
              type="hidden"
              name="orderedArr"
              value={JSON.stringify(orderedArr)}
            />
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  {Array.from({ length: orderedArr.length }, (_, i) => (
                    <Table.Th key={`h-${i}`} ta="center">
                      {qtyLabels[i] || `#${i + 1}`}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  {Array.from({ length: orderedArr.length }, (_, i) => (
                    <Table.Td key={`c-${i}`}>
                      <TextInput
                        w="60px"
                        styles={{ input: { textAlign: "center" } }}
                        type="number"
                        value={orderedArr[i]}
                        onChange={(e) => {
                          const v =
                            e.currentTarget.value === ""
                              ? 0
                              : Number(e.currentTarget.value);
                          setOrderedArr((prev) =>
                            prev.map((x, idx) =>
                              idx === i ? (Number.isFinite(v) ? v | 0 : 0) : x
                            )
                          );
                        }}
                      />
                    </Table.Td>
                  ))}
                </Table.Tr>
              </Table.Tbody>
            </Table>
            <Group justify="end" mt="md">
              <Button type="submit" variant="filled">
                Save
              </Button>
            </Group>
          </form>
        )}
      </HotkeyAwareModal>

      {/* Edit Cut Breakdown Modal */}
      <HotkeyAwareModal
        opened={cutModalOpen}
        onClose={() => {
          setCutModalOpen(false);
          setCutAsm(null);
        }}
        title="Edit Cut Quantities"
        size="auto"
        centered
      >
        {cutAsm && (
          <form
            method="post"
            onSubmit={() => {
              setCutModalOpen(false);
            }}
          >
            <input
              type="hidden"
              name="_intent"
              value="assembly.updateCutBreakdown"
            />
            <input type="hidden" name="assemblyId" value={cutAsm.id} />
            <input type="hidden" name="cutArr" value={JSON.stringify(cutArr)} />
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  {Array.from({ length: cutArr.length }, (_, i) => (
                    <Table.Th key={`ch-${i}`} ta="center">
                      {cutAsm.labels?.[i] || `#${i + 1}`}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  {Array.from({ length: cutArr.length }, (_, i) => (
                    <Table.Td key={`cc-${i}`}>
                      <TextInput
                        w="60px"
                        styles={{ input: { textAlign: "center" } }}
                        type="number"
                        value={cutArr[i]}
                        onChange={(e) => {
                          const v =
                            e.currentTarget.value === ""
                              ? 0
                              : Number(e.currentTarget.value);
                          setCutArr((prev) =>
                            prev.map((x, idx) =>
                              idx === i ? (Number.isFinite(v) ? v | 0 : 0) : x
                            )
                          );
                        }}
                      />
                    </Table.Td>
                  ))}
                </Table.Tr>
              </Table.Tbody>
            </Table>
            <Group justify="end" mt="md">
              <Button type="submit" variant="filled">
                Save
              </Button>
            </Group>
          </form>
        )}
      </HotkeyAwareModal>

      <HotkeyAwareModal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Job"
        centered
      >
        <Stack gap="sm">
          <Text c="red">
            Deleting a job will remove its assemblies and costings. Assemblies
            with activity cannot be deleted.
          </Text>
          <TextInput
            label={`Type "${deletePhrase}" to confirm`}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.currentTarget.value)}
            disabled={hasAssemblyActivity}
          />
          {hasAssemblyActivity ? (
            <Text size="sm" c="dimmed">
              Assemblies with recorded activity are present. Clear activity
              before deleting.
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={
                hasAssemblyActivity || deleteConfirm.trim() !== deletePhrase
              }
              onClick={() => {
                const fd = new FormData();
                fd.set("_intent", "job.delete");
                fd.set("confirm", deleteConfirm.trim());
                submit(fd, { method: "post" });
              }}
            >
              Delete Job
            </Button>
          </Group>
        </Stack>
      </HotkeyAwareModal>

      <HotkeyAwareModal
        opened={jobStateConfirmOpen}
        onClose={() => {
          setJobStateConfirmOpen(false);
          setPendingJobState(null);
        }}
        title={pendingStateMeta?.title || "Change job state"}
        centered
      >
        <Stack gap="sm">
          <Text size="sm">
            {pendingStateMeta?.text ||
              "Confirm the job state change before continuing."}
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setJobStateConfirmOpen(false);
                setPendingJobState(null);
              }}
            >
              Back
            </Button>
            <Button onClick={confirmJobStateChange}>
              {pendingStateMeta?.confirmLabel || "Confirm"}
            </Button>
          </Group>
        </Stack>
      </HotkeyAwareModal>

      <HotkeyAwareModal
        opened={jobCancelOpen}
        onClose={() => setJobCancelOpen(false)}
        title="Cancel Job"
        centered
      >
        <Stack>
          <Text size="sm">
            Canceling a job stops pursuit of remaining work but preserves all
            history (POs, receipts, activities).
          </Text>
          <Textarea
            label="Cancellation reason"
            placeholder="Why is this job being canceled?"
            value={jobCancelReason}
            onChange={(e) => setJobCancelReason(e.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Group justify="space-between" mt="sm">
            <Button variant="default" onClick={() => setJobCancelOpen(false)}>
              Keep job active
            </Button>
            <Group gap="xs">
              <Button
                variant="default"
                disabled={!jobCancelReason.trim()}
                onClick={() => applyJobCancel("job_only")}
              >
                Cancel job only
              </Button>
              <Button
                color="red"
                disabled={!jobCancelReason.trim()}
                onClick={() => applyJobCancel("cancel_remaining")}
              >
                Cancel job + remaining units
              </Button>
            </Group>
          </Group>
        </Stack>
      </HotkeyAwareModal>

      <HotkeyAwareModal
        opened={asmCancelOpen}
        onClose={() => setAsmCancelOpen(false)}
        title={
          asmCancelTarget
            ? asmCancelMode === "full"
              ? `Cancel assembly - A${asmCancelTarget.id}`
              : `Cancel remaining units - A${asmCancelTarget.id}`
            : asmCancelMode === "full"
            ? "Cancel assembly"
            : "Cancel remaining units"
        }
        centered
        size="xl"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Ordered: {asmCancelOrderedTotal} | Effective: {asmCancelEffectiveOrdered} |
            Canceled: {asmCancelComputed.canceled.reduce((t, v) => t + (Number(v) || 0), 0)}
          </Text>
          {asmCancelMode === "remaining" ? (
            <Text size="xs" c="dimmed">
              Defaulting to remaining based on {asmCancelBaseline} totals.
            </Text>
          ) : null}
          {cancelLabels.length ? (
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  {cancelLabels.map((label, i) => (
                    <Table.Th key={`c-h-${i}`} ta="center">
                      {label || `#${i + 1}`}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  {cancelLabels.map((_label, i) => (
                    <Table.Td key={`c-c-${i}`}>
                      <TextInput
                        w="60px"
                        styles={{ input: { textAlign: "center" } }}
                        type="number"
                        value={cancelArr[i] ?? 0}
                        onChange={(e) => {
                          const v =
                            e.currentTarget.value === ""
                              ? 0
                              : Number(e.currentTarget.value);
                          setCancelArr((prev) =>
                            prev.map((x, idx) =>
                              idx === i ? (Number.isFinite(v) ? v | 0 : 0) : x
                            )
                          );
                        }}
                      />
                    </Table.Td>
                  ))}
                </Table.Tr>
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">
              No size breakdown available for this assembly.
            </Text>
          )}
          <Textarea
            label="Reason"
            placeholder={
              asmCancelMode === "full"
                ? "Why is this assembly being canceled?"
                : "Why are the remaining units being canceled?"
            }
            value={asmCancelReason}
            onChange={(e) => setAsmCancelReason(e.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Text size="sm">
            Effective ordered after cancel: {asmCancelEffectiveOrdered}
          </Text>
          {asmCancelHardBlock ? (
            <Text size="sm" c="red">
              Cancellation cannot reduce below finished/packed quantities.
            </Text>
          ) : asmCancelSoftBlock ? (
            <Checkbox
              label="Override: allow cancel below recorded cut/sew progress"
              checked={asmCancelOverride}
              onChange={(e) => setAsmCancelOverride(e.currentTarget.checked)}
            />
          ) : null}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setAsmCancelOpen(false)}>
              Close
            </Button>
          <Button
              color="red"
              disabled={
                asmCancelHardBlock ||
                (asmCancelSoftBlock && !asmCancelOverride) ||
                (asmCancelNewTotal > 0 && !asmCancelReason.trim())
              }
              onClick={() => {
                if (!asmCancelTarget) return;
                const fd = new FormData();
                fd.set("_intent", "assembly.cancel");
                fd.set("assemblyId", String(asmCancelTarget.id));
                fd.set("canceledBySize", JSON.stringify(cancelArr));
                fd.set("cancelReason", asmCancelReason.trim());
                fd.set("cancelMode", asmCancelMode);
                if (asmCancelOverride) fd.set("override", "true");
                fd.set("returnTo", `/jobs/${job.id}`);
                submit(fd, { method: "post" });
                setAsmCancelOpen(false);
              }}
            >
              Apply cancellation
            </Button>
          </Group>
        </Stack>
      </HotkeyAwareModal>

      <HotkeyAwareModal
        opened={Boolean(groupGuardMessage)}
        onClose={() => setGroupGuardMessage(null)}
        title="Cannot Group Assemblies"
        size="sm"
        centered
      >
        <Stack>
          <Text>
            {groupGuardMessage ||
              "Assemblies must share the same state and have no activity before grouping."}
          </Text>
          <Group justify="flex-end" mt="sm">
            <Button onClick={() => setGroupGuardMessage(null)}>OK</Button>
          </Group>
        </Stack>
      </HotkeyAwareModal>
    </Stack>
  );
}

export default function JobDetailLayout() {
  return <Outlet />;
}

function AssemblyRowMenu({
  assembly,
  disabled,
  canDelete,
  submit,
  onCancelRemaining,
  onCancelAssembly,
  hasProductionActivity,
}: any) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  return (
    <>
      <Menu position="bottom-end" withArrow>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            size="sm"
            disabled={disabled}
            title={
              disabled
                ? "Assembly actions are disabled while edits are pending"
                : "Assembly actions"
            }
          >
            <IconMenu2 size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconCopy size={14} />}
            disabled={disabled}
            onClick={() => {
              const fd = new FormData();
              fd.set("_intent", "assembly.duplicate");
              fd.set("assemblyId", String(assembly.id));
              submit(fd, { method: "post" });
            }}
          >
            Duplicate
          </Menu.Item>
          {!hasProductionActivity ? (
            <Menu.Item
              leftSection={<IconBan size={14} />}
              disabled={disabled}
              onClick={() => onCancelAssembly?.()}
            >
              Cancel assembly...
            </Menu.Item>
          ) : null}
          {hasProductionActivity ? (
            <Menu.Item
              leftSection={<IconBan size={14} />}
              disabled={disabled}
              onClick={() => onCancelRemaining?.()}
            >
              Cancel remaining units...
            </Menu.Item>
          ) : null}
          <Menu.Item
            leftSection={<IconTrash size={14} />}
            disabled={!canDelete}
            onClick={() => setConfirmOpen(true)}
            color={canDelete ? "red" : undefined}
            title={
              canDelete
                ? undefined
                : "Assemblies with recorded activity cannot be deleted"
            }
          >
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <HotkeyAwareModal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        centered
        title={`Delete Assembly ${assembly.id}?`}
        size="sm"
      >
        <Stack>
          <Text>
            This will permanently remove the assembly. Only allowed because it
            has no activity records.
          </Text>
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                const fd = new FormData();
                fd.set("_intent", "assembly.delete");
                fd.set("assemblyId", String(assembly.id));
                submit(fd, { method: "post" });
                setConfirmOpen(false);
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </HotkeyAwareModal>
    </>
  );
}
