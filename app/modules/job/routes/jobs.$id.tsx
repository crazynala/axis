import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  Outlet,
  useRouteLoaderData,
  useNavigation,
  useSubmit,
  Form,
  useSearchParams,
  useNavigate,
} from "@remix-run/react";
import { notifications } from "@mantine/notifications";
import {
  Stack,
  Title,
  Group,
  Table,
  Text,
  Card,
  SimpleGrid,
  Grid,
  Divider,
  Button,
  Modal,
  TextInput,
  Switch,
  Badge,
  Tooltip,
  ActionIcon,
  Menu,
  NativeSelect,
} from "@mantine/core";
import {
  HotkeyAwareModal,
  HotkeyAwareModalRoot,
} from "~/base/hotkeys/HotkeyAwareModal";
import { DatePickerInput } from "@mantine/dates"; // still used elsewhere if any
import { useEffect, useMemo, useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { BreadcrumbSet } from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { useInitGlobalFormContext } from "@aa/timber";
// useJobFindify removed (modal-based find standard)
import { prisma } from "../../../utils/prisma.server";
import { createAssemblyFromProductAndSeedCostings } from "~/modules/job/services/assemblyFromProduct.server";
import { duplicateAssembly } from "~/modules/job/services/duplicateAssembly.server";
// Legacy jobSearchSchema/buildWhere replaced by config-driven builder
import { buildWhereFromConfig } from "../../../utils/buildWhereFromConfig.server";
import { getVariantLabels } from "../../../utils/getVariantLabels";
import React from "react";
import { IconCopy, IconLink, IconMenu2, IconTrash } from "@tabler/icons-react";
import { useFind } from "../../../base/find/FindContext";
import { useRecordContext } from "../../../base/record/RecordContext";
import { JobDetailForm } from "~/modules/job/forms/JobDetailForm";
import * as jobDetail from "~/modules/job/forms/jobDetail";
import { JobFindManager } from "~/modules/job/findify/JobFindManager";
import {
  applyJobStateTransition,
  JobStateError,
  syncJobStateFromAssemblies,
} from "~/modules/job/services/JobStateService";
import {
  normalizeAssemblyState,
  normalizeJobState,
} from "~/modules/job/stateUtils";
import { getSavedIndexSearch } from "~/hooks/useNavLocation";
import { StateChangeButton } from "~/base/state/StateChangeButton";
import { assemblyStateConfig, jobStateConfig } from "~/base/state/configs";

export const meta: MetaFunction = () => [{ title: "Job" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) return redirect("/jobs");
  const job = await prisma.job.findUnique({
    where: { id },
    include: { assemblies: true, company: true, assemblyGroups: true },
  });
  if (!job) return redirect("/jobs");
  // Activity counts per assembly (for delete gating)
  const asmIds = (job.assemblies || [])
    .map((a: any) => a.id)
    .filter((n: any) => Number.isFinite(Number(n)));
  let activityCounts: Record<number, number> = {};
  if (asmIds.length) {
    const rows = await prisma.assemblyActivity.groupBy({
      by: ["assemblyId"],
      where: { assemblyId: { in: asmIds } },
      _count: { assemblyId: true },
    });
    for (const r of rows) {
      const asmId = Number(r.assemblyId) || 0;
      if (!asmId) continue;
      activityCounts[asmId] = r._count.assemblyId;
    }
  }
  // Gather product details for assemblies
  const productIds = Array.from(
    new Set((job.assemblies || []).map((a: any) => a.productId).filter(Boolean))
  ) as number[];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          sku: true,
          name: true,
          variantSet: { select: { name: true, id: true, variants: true } },
        },
      })
    : [];
  const productsById: Record<number, any> = Object.fromEntries(
    products.map((p: any) => [p.id, p])
  );
  const assemblyTypes = await prisma.valueList.findMany({
    where: { type: "AssemblyType" },
    select: { label: true },
    orderBy: { label: "asc" },
  });
  const customers = await prisma.company.findMany({
    where: { isCustomer: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
  const productChoices = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      customerId: true,
      _count: { select: { productLines: true } },
      variantSet: { select: { id: true, variants: true } },
    },
    orderBy: { id: "asc" },
    take: 1000,
  });
  const groupsById: Record<number, any> = Object.fromEntries(
    (job.assemblyGroups || []).map((g: any) => [g.id, g])
  );

  console.log("[jobs.$id] Loader assemblies data", {
    jobId: id,
    assembliesCount: (job.assemblies || []).length,
    assemblies: (job.assemblies || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      c_qtyOrdered: a.c_qtyOrdered,
      c_qtyCut: a.c_qtyCut,
      hasComputedFields: !!(
        a.c_qtyOrdered !== undefined || a.c_qtyCut !== undefined
      ),
    })),
  });

  return json({
    job,
    productsById,
    assemblyTypes,
    customers,
    productChoices,
    groupsById,
    activityCounts,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  if (!id) return redirect("/jobs");
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent === "find") {
    const raw: Record<string, any> = {};
    for (const [k, v] of form.entries()) {
      if (k.startsWith("_")) continue;
      if (k === "find") continue;
      raw[k] = v === "" ? null : v;
    }
    // Build where from config fields that have findOp metadata
    const searchFields: any[] = [
      ...((jobDetail as any).jobOverviewFields || []),
      ...((jobDetail as any).jobDateStatusLeft || []),
      ...((jobDetail as any).jobDateStatusRight || []),
    ];
    // buildWhereFromConfig(values, configs)
    const where = buildWhereFromConfig(raw as any, searchFields as any);
    const first = await prisma.job.findFirst({
      where,
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const sp = new URLSearchParams();
    sp.set("find", "1");
    const returnParam = form.get("return");
    if (returnParam) sp.set("return", String(returnParam));
    const push = (k: string, v: any) => {
      if (v === undefined || v === null || v === "") return;
      sp.set(k, String(v));
    };
    push("id", raw.id);
    push("projectCode", raw.projectCode);
    push("name", raw.name);
    push("status", raw.status);
    push("jobType", raw.jobType);
    push("endCustomerName", raw.endCustomerName);
    push("companyId", raw.companyId);
    const qs = sp.toString();
    if (first?.id != null) return redirect(`/jobs/${first.id}?${qs}`);
    return redirect(`/jobs?${qs}`);
  }
  if (intent === "job.update") {
    const data: any = {};
    const fields = [
      "projectCode",
      "name",
      "jobType",
      "endCustomerName",
      "customerPoNum",
      "statusWhiteboard",
    ];
    for (const f of fields)
      if (form.has(f)) data[f] = (form.get(f) as string) || null;
    let nextStatus: string | null = null;
    if (form.has("status")) {
      const rawStatus = String(form.get("status") ?? "").trim();
      nextStatus = rawStatus ? rawStatus : null;
    }
    if (form.has("companyId")) {
      const raw = String(form.get("companyId") ?? "");
      if (raw === "") {
        data.companyId = null;
      } else {
        const cid = Number(raw);
        data.companyId = Number.isFinite(cid) ? cid : null;
        // If a customer is being set, adopt its stock location when available
        if (Number.isFinite(cid)) {
          const company = await prisma.company.findUnique({
            where: { id: cid },
            select: { stockLocationId: true },
          });
          const locId = company?.stockLocationId ?? null;
          if (locId != null) data.stockLocationId = locId;
        }
      }
    }
    // Honor explicit stockLocationId from form (allows clear or override)
    if (form.has("stockLocationId")) {
      const raw = String(form.get("stockLocationId") ?? "");
      if (raw === "") data.stockLocationId = null;
      else {
        const lid = Number(raw);
        data.stockLocationId = Number.isFinite(lid) ? lid : null;
      }
    }
    const dateFields = [
      "customerOrderDate",
      "targetDate",
      "dropDeadDate",
      "cutSubmissionDate",
    ];
    for (const df of dateFields)
      if (form.has(df)) {
        const v = form.get(df) as string;
        data[df] = v ? new Date(v) : null;
      }
    const assemblyStatusMap = new Map<number, string>();
    if (form.has("assemblyStatuses")) {
      const rawStatuses = String(form.get("assemblyStatuses") || "{}");
      try {
        const obj = JSON.parse(rawStatuses);
        if (obj && typeof obj === "object") {
          for (const [key, val] of Object.entries(obj)) {
            const asmId = Number(key);
            if (!Number.isFinite(asmId)) continue;
            const normalized = normalizeAssemblyState(
              typeof val === "string" ? val : String(val ?? "")
            );
            if (!normalized) continue;
            assemblyStatusMap.set(asmId, normalized);
          }
        }
      } catch {}
    }
    const assemblyWhiteboardMap = new Map<number, string>();
    if (form.has("assemblyWhiteboards")) {
      const rawNotes = String(form.get("assemblyWhiteboards") || "{}");
      try {
        const obj = JSON.parse(rawNotes);
        if (obj && typeof obj === "object") {
          for (const [key, val] of Object.entries(obj)) {
            const asmId = Number(key);
            if (!Number.isFinite(asmId)) continue;
            assemblyWhiteboardMap.set(
              asmId,
              typeof val === "string" ? val : String(val ?? "")
            );
          }
        }
      } catch {}
    }
    const assemblyTypeMap = new Map<number, string>();
    if (form.has("assemblyTypes")) {
      const rawTypes = String(form.get("assemblyTypes") || "{}");
      try {
        const obj = JSON.parse(rawTypes);
        if (obj && typeof obj === "object") {
          for (const [key, val] of Object.entries(obj)) {
            const asmId = Number(key);
            if (!Number.isFinite(asmId)) continue;
            const v = typeof val === "string" ? val : String(val ?? "");
            assemblyTypeMap.set(asmId, v || "Prod");
          }
        }
      } catch {}
    }
    try {
      if (Object.keys(data).length) {
        await prisma.job.update({ where: { id }, data });
      }
      if (nextStatus) {
        await applyJobStateTransition(prisma, id, nextStatus);
      }
      if (assemblyStatusMap.size || assemblyWhiteboardMap.size || assemblyTypeMap.size) {
        const asmIds = Array.from(
          new Set([
            ...assemblyStatusMap.keys(),
            ...assemblyWhiteboardMap.keys(),
            ...assemblyTypeMap.keys(),
          ])
        );
        const assemblies = await prisma.assembly.findMany({
          where: { id: { in: asmIds }, jobId: id },
          select: { id: true, status: true, statusWhiteboard: true, assemblyType: true },
        });
        let statusUpdates = 0;
        const updates = assemblies
          .map((asm) => {
            const data: Record<string, any> = {};
            const nextStatus = assemblyStatusMap.get(asm.id);
            const currentStatus = normalizeAssemblyState(
              asm.status as string | null
            );
            if (nextStatus && nextStatus !== currentStatus) {
              data.status = nextStatus;
              statusUpdates += 1;
            }
            if (assemblyWhiteboardMap.has(asm.id)) {
              const rawNote = assemblyWhiteboardMap.get(asm.id) ?? "";
              const nextNote = rawNote === "" ? null : rawNote;
              const currentNote = (asm.statusWhiteboard || null) as
                | string
                | null;
              if (nextNote !== currentNote) {
                data.statusWhiteboard = nextNote;
              }
            }
            if (assemblyTypeMap.has(asm.id)) {
              const nextType = assemblyTypeMap.get(asm.id) || "Prod";
              if (nextType !== (asm.assemblyType || "Prod")) {
                data.assemblyType = nextType;
              }
            }
            if (Object.keys(data).length) {
              return { id: asm.id, data };
            }
            return null;
          })
          .filter(Boolean) as Array<{ id: number; data: Record<string, any> }>;
        for (const update of updates) {
          await prisma.assembly.update({
            where: { id: update.id },
            data: update.data,
          });
        }
        if (statusUpdates > 0 && !nextStatus) {
          await syncJobStateFromAssemblies(prisma, id);
        }
      }
    } catch (err) {
      if (err instanceof JobStateError) {
        return redirect(`/jobs/${id}?jobStateErr=${err.code}`);
      }
      throw err;
    }
    return redirect(`/jobs/${id}`);
  }
  if (intent === "assembly.createFromProduct") {
    const productId = Number(form.get("productId"));
    if (Number.isFinite(productId)) {
      const assemblyId = await createAssemblyFromProductAndSeedCostings(
        id,
        productId
      );
      console.log("[jobs.$id] Created assembly", { assemblyId, jobId: id });
    }
    return redirect(`/jobs/${id}`);
  }
  if (intent === "assembly.updateOrderedBreakdown") {
    const assemblyId = Number(form.get("assemblyId"));
    const arrStr = String(form.get("orderedArr") || "");
    try {
      const arr = JSON.parse(arrStr);
      if (Array.isArray(arr)) {
        const ints = arr.map((n: any) =>
          Number.isFinite(Number(n)) ? Number(n) | 0 : 0
        );
        await prisma.assembly.update({
          where: { id: assemblyId },
          data: { qtyOrderedBreakdown: ints as any },
        });
      }
    } catch {}
    return redirect(`/jobs/${id}`);
  }
  if (intent === "assembly.group") {
    const idsStr = String(form.get("assemblyIds") || "");
    const name = (form.get("groupName") as string) || null;
    const ids = idsStr
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (ids.length >= 2) {
      const assemblies = await prisma.assembly.findMany({
        where: { id: { in: ids }, jobId: id },
        select: { id: true, status: true },
      });
      const normalizedStatuses = new Set(
        assemblies.map((asm) => {
          return normalizeAssemblyState(asm.status as string | null) || "DRAFT";
        })
      );
      const activityRows = await prisma.assemblyActivity.groupBy({
        by: ["assemblyId"],
        where: { assemblyId: { in: ids } },
        _count: { assemblyId: true },
      });
      const issueCodes: string[] = [];
      if (assemblies.length !== ids.length) issueCodes.push("missing");
      if (normalizedStatuses.size > 1) issueCodes.push("status");
      if (activityRows.length > 0) issueCodes.push("activity");
      if (issueCodes.length > 0) {
        const search = new URLSearchParams();
        search.set("asmGroupErr", issueCodes.join(","));
        return redirect(`/jobs/${id}?${search.toString()}`);
      }
      // Create group and assign assemblies. Ensure they belong to this job.
      const created = await prisma.assemblyGroup.create({
        data: { jobId: id, name: name || undefined },
      });
      await prisma.assembly.updateMany({
        where: { id: { in: ids }, jobId: id },
        data: { assemblyGroupId: created.id },
      });
    }
    return redirect(`/jobs/${id}`);
  }
  if (intent === "assembly.duplicate") {
    const asmId = Number(form.get("assemblyId"));
    if (Number.isFinite(asmId)) {
      const newAsmId = await duplicateAssembly(prisma, id, asmId);
      if (newAsmId) {
        console.log("[jobs.$id] Duplicated assembly", {
          jobId: id,
          sourceAssemblyId: asmId,
          newAssemblyId: newAsmId,
        });
      }
    }
    return redirect(`/jobs/${id}`);
  }
  if (intent === "assembly.ungroupOne") {
    const asmId = Number(form.get("assemblyId"));
    if (Number.isFinite(asmId)) {
      // Clear group for this assembly
      await prisma.assembly.update({
        where: { id: asmId },
        data: { assemblyGroupId: null },
      });
    }
    return redirect(`/jobs/${id}`);
  }
  if (intent === "assembly.delete") {
    const asmId = Number(form.get("assemblyId"));
    if (Number.isFinite(asmId)) {
      // Block if any activities exist
      const actCount = await prisma.assemblyActivity.count({
        where: { assemblyId: asmId },
      });
      if (actCount > 0) {
        return redirect(`/jobs/${id}?asmDeleteErr=hasActivity&asmId=${asmId}`);
      }
      // Capture group cleanup before deletion
      const asm = await prisma.assembly.findUnique({
        where: { id: asmId },
        select: { assemblyGroupId: true },
      });
      await prisma.assembly.delete({ where: { id: asmId } });
      if (asm?.assemblyGroupId) {
        const remaining = await prisma.assembly.count({
          where: { assemblyGroupId: asm.assemblyGroupId },
        });
        if (remaining < 2) {
          // Ungroup remaining (if 1) and remove group record
          await prisma.assembly.updateMany({
            where: { assemblyGroupId: asm.assemblyGroupId },
            data: { assemblyGroupId: null },
          });
          await prisma.assemblyGroup.delete({
            where: { id: asm.assemblyGroupId },
          });
        }
      }
    }
    return redirect(`/jobs/${id}`);
  }
  if (intent === "assembly.state") {
    const asmId = Number(form.get("assemblyId"));
    if (Number.isFinite(asmId)) {
      const statusValue = normalizeAssemblyState(
        String(form.get("status") ?? "").trim()
      );
      const data: any = {};
      if (statusValue) data.status = statusValue;
      if (form.has("statusWhiteboard")) {
        const note = String(form.get("statusWhiteboard") ?? "");
        data.statusWhiteboard = note || null;
      }
      if (Object.keys(data).length) {
        await prisma.assembly.update({ where: { id: asmId }, data });
        await syncJobStateFromAssemblies(prisma, id);
      }
    }
    return redirect(`/jobs/${id}`);
  }
  return redirect(`/jobs/${id}`);
}

export function JobDetailView() {
  const {
    job,
    productsById,
    assemblyTypes,
    customers,
    productChoices,
    groupsById,
    activityCounts,
  } = useRouteLoaderData<typeof loader>("modules/job/routes/jobs.$id")!;
  const { setCurrentId } = useRecordContext();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    setCurrentId(job.id);
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
  const nav = useNavigation();
  const submit = useSubmit();
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
  // Master table removed; navigation handled via RecordContext
  // Local edit form only
  const jobToDefaults = (j: any) => ({
    id: j.id,
    projectCode: j.projectCode || "",
    name: j.name || "",
    status: j.status || "",
    jobType: j.jobType || "",
    endCustomerName: j.endCustomerName || "",
    customerPoNum: j.customerPoNum || "",
    statusWhiteboard: j.statusWhiteboard || "",
    // Normalize to empty string so form value matches defaults and isn't marked dirty
    companyId: (j.companyId ?? j.company?.id ?? "") as any,
    // Consolidated stock location (prefer new field; fallback to legacy locationInId)
    stockLocationId: (j.stockLocationId ?? j.locationInId ?? "") as any,
    customerOrderDate: j.customerOrderDate?.slice?.(0, 10) || "",
    targetDate: j.targetDate?.slice?.(0, 10) || "",
    dropDeadDate: j.dropDeadDate?.slice?.(0, 10) || "",
    cutSubmissionDate: j.cutSubmissionDate?.slice?.(0, 10) || "",
    assemblyStatuses: Object.fromEntries(
      (j.assemblies || []).map((a: any) => [
        String(a.id),
        normalizeAssemblyState(a.status as string | null) ?? "DRAFT",
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
  const jobForm = useForm<any>({
    defaultValues: jobToDefaults(job),
  });
  const { registerFindCallback } = useFind();
  const save = (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "job.update");
    const simple = [
      "projectCode",
      "name",
      "status",
      "jobType",
      "endCustomerName",
      "customerPoNum",
      "statusWhiteboard",
    ];
    simple.forEach((k) => {
      if (values[k] != null) fd.set(k, values[k]);
    });
    // Always include companyId so clearing (empty string) propagates to the server
    if (Object.prototype.hasOwnProperty.call(values, "companyId")) {
      const raw = values.companyId;
      fd.set("companyId", raw === undefined || raw === null ? "" : String(raw));
    }
    // Always include stockLocationId so clearing propagates
    if (Object.prototype.hasOwnProperty.call(values, "stockLocationId")) {
      const raw = values.stockLocationId;
      fd.set(
        "stockLocationId",
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
    [
      "customerOrderDate",
      "targetDate",
      "dropDeadDate",
      "cutSubmissionDate",
    ].forEach((df) => {
      if (Object.prototype.hasOwnProperty.call(values, df)) {
        fd.set(df, toDateString(values[df]));
      }
    });
    if (values.assemblyStatuses) {
      fd.set("assemblyStatuses", JSON.stringify(values.assemblyStatuses || {}));
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
  useInitGlobalFormContext(jobForm as any, save, () => {
    // Reset to current defaultValues (kept in sync on loader change)
    jobForm.reset();
    console.log("[jobs.$id] discard changes -> form reset to original", {
      id: job.id,
    });
  });

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
  const assemblyStatusMap =
    (jobForm.watch("assemblyStatuses") as Record<string, string | undefined>) ||
    {};
  const assemblyWhiteboardMap =
    (jobForm.watch("assemblyWhiteboards") as Record<
      string,
      string | undefined
    >) || {};
  const assemblyTypeMap =
    (jobForm.watch("assemblyTypes") as Record<string, string | undefined>) ||
    {};
  const assemblyTypeOptions = (assemblyTypes || []).map((t) => ({
    value: t.label || "",
    label: t.label || "",
  }));
  const handleAssemblyStatusChange = useCallback(
    (asmIds: number | number[], next: string | null) => {
      if (!next) return;
      const targets = Array.isArray(asmIds) ? asmIds : [asmIds];
      targets.forEach((asmId) => {
        jobForm.setValue(`assemblyStatuses.${asmId}` as any, next, {
          shouldDirty: true,
          shouldTouch: true,
        });
      });
    },
    [jobForm]
  );
  const handleAssemblyWhiteboardChange = useCallback(
    (asmIds: number | number[], next: string) => {
      const targets = Array.isArray(asmIds) ? asmIds : [asmIds];
      targets.forEach((asmId) => {
        jobForm.setValue(`assemblyWhiteboards.${asmId}` as any, next, {
          shouldDirty: true,
          shouldTouch: true,
        });
      });
    },
    [jobForm]
  );
  const getAssemblyStatusValue = (asmId: number) => {
    const raw =
      assemblyStatusMap[String(asmId)] ??
      (assembliesById.get(asmId)?.status as string | null);
    return normalizeAssemblyState(raw ?? null) ?? "DRAFT";
  };
  const getGroupStatusValue = (asmIds: number[]) => {
    const values = asmIds.map(getAssemblyStatusValue);
    return { value: values[0], mixed: values.some((v) => v !== values[0]) };
  };
  const getMergedWhiteboardValue = (asmIds: number[]) => {
    const seen = new Set<string>();
    const merged: string[] = [];
    asmIds.forEach((asmId) => {
      const rawValue =
        assemblyWhiteboardMap[String(asmId)] ??
        (assembliesById.get(asmId)?.statusWhiteboard as string | null) ??
        "";
      const key = rawValue.trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(rawValue);
      }
    });
    return merged.join(" | ");
  };

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

  const jobStatusValue =
    normalizeJobState(jobForm.watch("status") ?? job.status) ?? "DRAFT";
  const jobWhiteboardValue = jobForm.watch("statusWhiteboard") ?? "";

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
        <Group gap="sm" align="center">
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
          <StateChangeButton
            value={jobStatusValue}
            defaultValue={jobStatusValue}
            onChange={(v) =>
              jobForm.setValue("status", v, {
                shouldDirty: true,
                shouldTouch: true,
              })
            }
            config={jobStateConfig}
          />
        </Group>
      </Group>

      <div>
        <JobDetailForm
          mode="edit"
          form={jobForm as any}
          job={job}
          openCustomerModal={() => setCustomerModalOpen(true)}
        />
      </div>

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
          <Table
            // withTableBorder
            withRowBorders
            withColumnBorders
            highlightOnHover
            className="asm-rail-table"
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="asm-rail-cell" style={{ width: 25 }} />
                <Table.Th style={{ width: 60, textAlign: "center" }}>
                  ID
                </Table.Th>
                <Table.Th>Product SKU</Table.Th>
                <Table.Th>Assembly Name</Table.Th>
                <Table.Th>Assembly Type</Table.Th>
                <Table.Th>Variant Set</Table.Th>
                <Table.Th># Ordered</Table.Th>
                <Table.Th>Cut</Table.Th>
                <Table.Th>Make</Table.Th>
                <Table.Th>Pack</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Whiteboard</Table.Th>
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
                  const singleWhiteboardValue =
                    assemblyWhiteboardMap[String(a.id)] ??
                    (a.statusWhiteboard || "");
                  const statusSummary = isGroupedRow
                    ? getGroupStatusValue(memberIds)
                    : { value: getAssemblyStatusValue(a.id), mixed: false };
                  const whiteboardSummary = isGroupedRow
                    ? getMergedWhiteboardValue(memberIds)
                    : singleWhiteboardValue;
                  const isHovered =
                    isGroupedRow &&
                    hoverGroupId != null &&
                    hoverGroupId === a.assemblyGroupId;
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

                      <Table.Td align="center">
                        {a.assemblyGroupId ? (
                          <Link
                            to={`assembly/${(
                              groupMembers.get(a.assemblyGroupId) || [a.id]
                            ).join(",")}`}
                          >
                            {a.id}
                          </Link>
                        ) : (
                          <Link to={`assembly/${a.id}`}>{a.id}</Link>
                        )}
                      </Table.Td>
                      <Table.Td>{p?.sku || ""}</Table.Td>
                      <Table.Td>{a.name || p?.name || ""}</Table.Td>
                      <Table.Td>
                        <NativeSelect
                          data={assemblyTypeOptions}
                          value={
                            assemblyTypeMap[String(a.id)] ??
                            (a as any).assemblyType ??
                            "Prod"
                          }
                          onChange={(e) =>
                            jobForm.setValue(
                              `assemblyTypes.${a.id}` as any,
                              e.currentTarget.value,
                              { shouldDirty: true, shouldTouch: true }
                            )
                          }
                          size="xs"
                        />
                      </Table.Td>
                      <Table.Td>{p?.variantSet?.name || ""}</Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => {
                            const labels = (p?.variantSet?.variants ||
                              []) as string[];
                            setQtyAsm({ ...a, labels });
                            setQtyModalOpen(true);
                          }}
                        >
                          {(a as any).c_qtyOrdered ?? 0}
                        </Button>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => {
                            const labels = (p?.variantSet?.variants ||
                              []) as string[];
                            const cols = getVariantLabels(
                              labels,
                              p?.variantSet?.variants?.length as any
                            );
                            const current = Array.isArray(a.qtyCutBreakdown)
                              ? a.qtyCutBreakdown
                              : [];
                            const initial = Array.from(
                              { length: cols.length },
                              (_, i) => current[i] || 0
                            );
                            setCutAsm({ ...a, labels: cols });
                            setCutArr(initial);
                            setCutModalOpen(true);
                          }}
                        >
                          {(a as any).c_qtyCut ?? 0}
                        </Button>
                      </Table.Td>
                      <Table.Td>{(a as any).c_qtyMake ?? ""}</Table.Td>
                      <Table.Td>{(a as any).c_qtyPack ?? ""}</Table.Td>
                      <Table.Td>
                        {(!isGroupedRow || isGroupLeader) && (
                          <StateChangeButton
                            value={statusSummary.value}
                            defaultValue={statusSummary.value}
                            onChange={(value) =>
                              handleAssemblyStatusChange(
                                isGroupedRow ? memberIds : a.id,
                                value as string
                              )
                            }
                            disabled={busy}
                            config={assemblyStateConfig}
                          />
                        )}
                      </Table.Td>
                      <Table.Td>
                        {(!isGroupedRow || isGroupLeader) && (
                          <TextInput
                            size="xs"
                            placeholder="Whiteboard"
                            value={whiteboardSummary}
                            onChange={(e) =>
                              handleAssemblyWhiteboardChange(
                                isGroupedRow ? memberIds : a.id,
                                e.currentTarget.value
                              )
                            }
                          />
                        )}
                      </Table.Td>
                      <Table.Td align="center">
                        <AssemblyRowMenu
                          assembly={a}
                          disabled={jobForm.formState.isDirty}
                          canDelete={canDelete}
                          submit={submit}
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                });
              })()}
            </Table.Tbody>
          </Table>
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
                  <Text style={{ flex: 1 }}>{p.name}</Text>
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

function AssemblyRowMenu({ assembly, disabled, canDelete, submit }: any) {
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
