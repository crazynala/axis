import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import {
  useNavigation,
  Form,
  useLoaderData,
  useFetcher,
} from "@remix-run/react";
import {
  Button,
  Group,
  Stack,
  TextInput,
  Title,
  Card,
  SimpleGrid,
  Select,
  Text,
  Tooltip,
} from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { BreadcrumbSet } from "@aa/timber";
import { prisma } from "../../../utils/prisma.server";
import { DatePickerInput } from "@mantine/dates";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOptions } from "~/base/options/OptionsContext";
import {
  loadDefaultInternalTargetBufferDays,
  loadDefaultInternalTargetLeadDays,
  loadDefaultDropDeadEscalationBufferDays,
  resolveAssemblyTargets,
} from "~/modules/job/services/targetOverrides.server";
import {
  resolveJobSetupDefaults,
} from "~/modules/job/services/jobSetupDefaults";
import {
  buildProjectCodeFromIncrement,
  buildJobProjectCode,
  parseJobProjectCodeNumber,
} from "~/modules/job/services/jobProjectCode";
import { loadJobProjectCodePrefix } from "~/modules/job/services/jobProjectCode.server";
import { AddressPickerField } from "~/components/addresses/AddressPickerField";
import { formatAddressLines } from "~/utils/addressFormat";
import { IconInfoCircle } from "@tabler/icons-react";
import { assertAddressAllowedForShipment } from "~/utils/addressOwnership.server";
import { buildEndCustomerOptions } from "~/modules/job/services/endCustomerOptions";
import {
  deriveInternalTargetDate,
  normalizeOrderDate,
} from "~/modules/job/services/jobTargetDefaults";
import { getDefaultJobTypeValue } from "~/modules/job/services/jobTypeDefaults";

export const meta: MetaFunction = () => [{ title: "New Job" }];

export async function loader() {
  const [
    customers,
    contacts,
    locations,
    defaultLeadDays,
    internalTargetBufferDays,
    dropDeadEscalationBufferDays,
    jobProjectCodePrefix,
  ] = await Promise.all([
    prisma.company.findMany({
      where: { isCustomer: true },
      select: {
        id: true,
        name: true,
        defaultAddressId: true,
        stockLocationId: true,
        shortCode: true,
        projectCodeNextNumber: true,
      },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.contact.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyId: true,
        defaultAddressId: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: 5000,
    }),
    prisma.location.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    loadDefaultInternalTargetLeadDays(prisma),
    loadDefaultInternalTargetBufferDays(prisma),
    loadDefaultDropDeadEscalationBufferDays(prisma),
    loadJobProjectCodePrefix(prisma),
  ]);
  return json({
    customers,
    contacts,
    locations,
    defaultLeadDays,
    internalTargetBufferDays,
    dropDeadEscalationBufferDays,
    jobProjectCodePrefix,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const parseNumber = (value: FormDataEntryValue | null) => {
    const raw = value == null ? "" : String(value).trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const parseDate = (value: FormDataEntryValue | null) => {
    const raw = value == null ? "" : String(value).trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  };
  const companyId = parseNumber(form.get("companyId"));
  const endCustomerContactId = parseNumber(form.get("endCustomerContactId"));
  const projectCodeRaw = String(form.get("projectCode") ?? "").trim();
  const projectCode = projectCodeRaw || null;
  const jobProjectCodePrefix = await loadJobProjectCodePrefix(prisma);
  let endCustomerName: string | null = null;
  const payload: any = {
    projectCode,
    name: (form.get("name") as string) || null,
    jobType: (form.get("jobType") as string) || null,
    endCustomerContactId,
    companyId,
  };
  payload.customerOrderDate = parseDate(form.get("customerOrderDate"));
  payload.internalTargetDate = parseDate(form.get("internalTargetDate"));
  payload.customerTargetDate = parseDate(form.get("customerTargetDate"));
  payload.dropDeadDate = parseDate(form.get("dropDeadDate"));
  payload.cutSubmissionDate = parseDate(form.get("cutSubmissionDate"));
  payload.customerOrderDate = normalizeOrderDate(payload.customerOrderDate);
  if (endCustomerContactId != null) {
    const contact = await prisma.contact.findUnique({
      where: { id: endCustomerContactId },
      select: { companyId: true, firstName: true, lastName: true },
    });
    if (!contact) {
      return json({ error: "End-customer contact not found." }, { status: 400 });
    }
    if (companyId != null && contact.companyId !== companyId) {
      return json(
        { error: "End-customer contact must belong to the selected company." },
        { status: 400 }
      );
    }
    const name = [contact.firstName, contact.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    endCustomerName = name || null;
  }
  let companyDefaults: {
    defaultAddressId: number | null;
    stockLocationId: number | null;
    shortCode: string | null;
  } | null = null;
  const shipToAddressId = parseNumber(form.get("shipToAddressId"));
  if (companyId != null) {
    companyDefaults = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        defaultAddressId: true,
        stockLocationId: true,
        shortCode: true,
      },
    });
    if (companyDefaults) {
      const defaults = resolveJobSetupDefaults({ company: companyDefaults });
      payload.stockLocationId = defaults.stockLocationId;
      if (defaults.shipToAddressId != null) {
        payload.shipToAddressId = defaults.shipToAddressId;
      }
    }
  }
  if (shipToAddressId != null) {
    const allowed = await assertAddressAllowedForShipment(
      shipToAddressId,
      companyId,
      endCustomerContactId
    );
    if (!allowed) {
      return json(
        { error: "Ship-to address must belong to the company or contact." },
        { status: 400 }
      );
    }
    payload.shipToAddressId = shipToAddressId;
  }
  const [defaultLeadDays, bufferDays, escalationBufferDays] = await Promise.all([
    loadDefaultInternalTargetLeadDays(prisma),
    loadDefaultInternalTargetBufferDays(prisma),
    loadDefaultDropDeadEscalationBufferDays(prisma),
  ]);
  const now = new Date();
  const resolved = resolveAssemblyTargets({
    job: {
      createdAt: now,
      customerOrderDate: payload.customerOrderDate ?? null,
      internalTargetDate: payload.internalTargetDate ?? null,
      customerTargetDate: payload.customerTargetDate ?? null,
      dropDeadDate: payload.dropDeadDate ?? null,
      shipToLocation: null,
      shipToAddress: null,
    },
    assembly: null,
    defaultLeadDays,
    bufferDays,
    escalationBufferDays,
    now,
  });
  if (!payload.internalTargetDate) {
    payload.internalTargetDate = resolved.internal.value ?? null;
  }
  if (!payload.dropDeadDate) {
    payload.dropDeadDate = resolved.dropDead.value ?? null;
  }
  console.log("[jobs.new] action: creating job", {
    projectCode: payload.projectCode,
    name: payload.name,
    jobType: payload.jobType,
    hasDates: {
      internalTargetDate: !!payload.internalTargetDate,
      customerTargetDate: !!payload.customerTargetDate,
      dropDeadDate: !!payload.dropDeadDate,
    },
  });
  payload.endCustomerName = endCustomerName;
  payload.jobType = payload.jobType || "Production";
  const created = await prisma.$transaction(async (tx) => {
    if (companyId != null) {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { shortCode: true, projectCodeNextNumber: true },
      });
      if (!payload.projectCode && company?.shortCode) {
        const updated = await tx.company.update({
          where: { id: companyId },
          data: { projectCodeNextNumber: { increment: 1 } },
          select: { projectCodeNextNumber: true, shortCode: true },
        });
        const assigned = buildProjectCodeFromIncrement({
          shortCode: updated.shortCode,
          prefix: jobProjectCodePrefix,
          nextNumberAfterIncrement: updated.projectCodeNextNumber,
        });
        if (assigned) payload.projectCode = assigned;
      } else if (payload.projectCode && company?.shortCode) {
        const parsed = parseJobProjectCodeNumber({
          code: payload.projectCode,
          shortCode: company.shortCode,
          prefix: jobProjectCodePrefix,
        });
        if (parsed != null) {
          const currentNext =
            Number(company.projectCodeNextNumber ?? 1) || 1;
          const nextNumber = Math.max(currentNext, parsed + 1);
          if (nextNumber !== currentNext) {
            await tx.company.update({
              where: { id: companyId },
              data: { projectCodeNextNumber: nextNumber },
            });
          }
        }
      }
    }
    return tx.job.create({ data: payload });
  });
  console.log("[jobs.new] created job", { id: created.id });
  return redirect(`/jobs/${created.id}`);
}

export default function NewJobRoute() {
  const {
    customers,
    contacts,
    locations,
    defaultLeadDays,
    internalTargetBufferDays,
    jobProjectCodePrefix,
  } = useLoaderData<typeof loader>();
  const options = useOptions();
  const jobTypeOptions = options?.jobTypeOptions ?? [];
  const defaultJobType = useMemo(
    () => getDefaultJobTypeValue(jobTypeOptions),
    [jobTypeOptions]
  );
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const form = useForm({
    defaultValues: {
      projectCode: "",
      name: "",
      jobType: defaultJobType,
      endCustomerContactId: "",
      customerOrderDate: new Date(),
      internalTargetDate: null as Date | null,
      customerTargetDate: null as Date | null,
      dropDeadDate: null as Date | null,
      cutSubmissionDate: null as Date | null,
      companyId: "",
      shipToAddressId: "",
      stockLocationId: "",
    },
  });
  const customerOptions = useMemo(() => {
    return (customers || [])
      .map((c: any) => {
        const value = c?.id != null ? String(c.id) : "";
        if (!value) return null;
        const label = String(c?.name || value).trim() || value;
        return { value, label };
      })
      .filter(Boolean) as { value: string; label: string }[];
  }, [customers]);
  const customerById = useMemo(() => {
    const map = new Map<number, any>();
    (customers || []).forEach((c: any) => {
      if (c?.id != null) map.set(Number(c.id), c);
    });
    return map;
  }, [customers]);
  const [companyAddresses, setCompanyAddresses] = useState<any[]>([]);
  const [contactAddresses, setContactAddresses] = useState<any[]>([]);
  const companyAddressFetcher = useFetcher();
  const contactAddressFetcher = useFetcher();
  const companyId = form.watch("companyId") as string | number | null;
  const endCustomerContactId = form.watch("endCustomerContactId") as
    | string
    | number
    | null;
  const contactOptions = useMemo(() => {
    const cid = companyId != null && companyId !== "" ? Number(companyId) : null;
    return buildEndCustomerOptions(contacts || [], cid);
  }, [contacts, companyId]);
  const companyAddressOptions = useMemo(() => {
    return (companyAddresses || [])
      .map((addr: any) => {
        if (!addr || addr.id == null) return null;
        const value = String(addr.id);
        if (!value) return null;
      const lines = formatAddressLines(addr);
      const base = lines[0] || `Address ${addr.id}`;
      const tail = lines.slice(1).join(", ");
        return {
          value,
          label: tail ? `${base} — ${tail}` : base,
          group: "Customer addresses",
        };
      })
      .filter(Boolean) as { value: string; label: string; group?: string }[];
  }, [companyAddresses]);
  const contactAddressOptions = useMemo(() => {
    return (contactAddresses || [])
      .map((addr: any) => {
        if (!addr || addr.id == null) return null;
        const value = String(addr.id);
        if (!value) return null;
      const lines = formatAddressLines(addr);
      const base = lines[0] || `Address ${addr.id}`;
      const tail = lines.slice(1).join(", ");
        return {
          value,
          label: tail ? `${base} — ${tail}` : base,
          group: "End-customer addresses",
        };
      })
      .filter(Boolean) as { value: string; label: string; group?: string }[];
  }, [contactAddresses]);
  const shipToAddressOptions = useMemo(() => {
    return endCustomerContactId
      ? [...companyAddressOptions, ...contactAddressOptions]
      : [...companyAddressOptions];
  }, [companyAddressOptions, contactAddressOptions, endCustomerContactId]);
  const addressById = useMemo(() => {
    const map = new Map<number, any>();
    [...companyAddresses, ...contactAddresses].forEach((addr: any) => {
      if (addr?.id != null) map.set(Number(addr.id), addr);
    });
    return map;
  }, [companyAddresses, contactAddresses]);
  const shipToAddressId = form.watch("shipToAddressId") as
    | string
    | number
    | null;
  const shipToPreviewAddress =
    shipToAddressId != null && shipToAddressId !== ""
      ? addressById.get(Number(shipToAddressId)) ?? null
      : null;
  const companyDefaultAddress = useMemo(() => {
    const cid = companyId != null && companyId !== "" ? Number(companyId) : null;
    if (!cid) return null;
    const company = customerById.get(cid);
    const defaultId = company?.defaultAddressId ?? null;
    if (!defaultId) return null;
    return addressById.get(Number(defaultId)) ?? null;
  }, [addressById, companyId, customerById]);
  const stockLocationId = form.watch("stockLocationId") as
    | string
    | number
    | null;
  const stockLocationLabel = useMemo(() => {
    if (stockLocationId == null || stockLocationId === "") return "—";
    const locId = Number(stockLocationId);
    const match = (locations || []).find((loc) => Number(loc.id) === locId);
    return match?.name || `Location ${locId}`;
  }, [locations, stockLocationId]);
  const prevCompanyIdRef = useRef<number | null>(
    companyId != null && companyId !== "" ? Number(companyId) : null
  );
  useEffect(() => {
    const nextCompanyId =
      companyId != null && companyId !== "" ? Number(companyId) : null;
    if (prevCompanyIdRef.current === nextCompanyId) return;
    prevCompanyIdRef.current = nextCompanyId;
    if (!nextCompanyId) {
      form.setValue("endCustomerContactId", "");
      form.setValue("shipToAddressId", "");
      form.setValue("stockLocationId", "");
      return;
    }
    const selected = customerById.get(nextCompanyId);
    const nextStockLocationId =
      selected?.stockLocationId != null ? selected.stockLocationId : 1;
    const nextShipToAddressId =
      selected?.defaultAddressId != null ? selected.defaultAddressId : "";
    form.setValue("stockLocationId", String(nextStockLocationId));
    form.setValue("shipToAddressId", String(nextShipToAddressId));
    form.setValue("endCustomerContactId", "");
    const currentProjectCode = String(form.getValues("projectCode") || "").trim();
    if (!currentProjectCode && selected?.shortCode) {
      const nextNumber =
        Number(selected?.projectCodeNextNumber ?? 1) || 1;
      const nextCode = buildJobProjectCode({
        shortCode: selected.shortCode,
        prefix: jobProjectCodePrefix,
        nextNumber,
      });
      if (nextCode) form.setValue("projectCode", nextCode);
    }
    if (companyAddressFetcher.state === "idle") {
      companyAddressFetcher.load(
        `/api/company-addresses?companyId=${nextCompanyId}`
      );
    }
  }, [companyId, companyAddressFetcher, customerById, form, jobProjectCodePrefix]);
  useEffect(() => {
    const data = companyAddressFetcher.data as { addresses?: any[] } | undefined;
    if (data?.addresses) setCompanyAddresses(data.addresses);
  }, [companyAddressFetcher.data]);
  useEffect(() => {
    const contactId =
      endCustomerContactId != null && endCustomerContactId !== ""
        ? Number(endCustomerContactId)
        : null;
    if (!contactId) {
      setContactAddresses([]);
      return;
    }
    if (contactAddressFetcher.state === "idle") {
      contactAddressFetcher.load(
        `/api/contact-addresses?contactId=${contactId}`
      );
    }
  }, [contactAddressFetcher, endCustomerContactId]);
  useEffect(() => {
    const data = contactAddressFetcher.data as { addresses?: any[] } | undefined;
    if (data?.addresses) setContactAddresses(data.addresses);
  }, [contactAddressFetcher.data]);
  const customerTargetDate = form.watch("customerTargetDate") as Date | null;
  const orderDate = form.watch("customerOrderDate") as Date | null;
  useEffect(() => {
    const dirty = form.formState.dirtyFields as Record<string, any>;
    if (dirty?.internalTargetDate) return;
    const derived = deriveInternalTargetDate({
      baseDate: orderDate,
      customerTargetDate,
      defaultLeadDays,
      bufferDays: internalTargetBufferDays,
      now: new Date(),
    });
    if (!derived) return;
    const current = form.getValues("internalTargetDate") as Date | null;
    const sameDay =
      current && derived
        ? current.toISOString().slice(0, 10) === derived.toISOString().slice(0, 10)
        : false;
    if (!sameDay) {
      form.setValue("internalTargetDate", derived, {
        shouldDirty: false,
        shouldTouch: false,
      });
    }
  }, [
    customerTargetDate,
    orderDate,
    defaultLeadDays,
    internalTargetBufferDays,
    form,
  ]);
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>New Job</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Jobs", href: "/jobs" },
            { label: "New", href: "#" },
          ]}
        />
      </Group>
      <Form method="post">
        <SimpleGrid cols={2} spacing="md">
          <Card withBorder padding="md">
            <Stack gap={8}>
              <Controller
                control={form.control}
                name="companyId"
                render={({ field }) => (
                  <Select
                    label="Customer"
                    data={customerOptions}
                    searchable
                    clearable
                    nothingFoundMessage="No matches"
                    value={field.value || null}
                    onChange={(value) => field.onChange(value ?? "")}
                    name="companyId"
                  />
                )}
              />
              <Controller
                control={form.control}
                name="endCustomerContactId"
                render={({ field }) => (
                  <Select
                    label="End customer"
                    data={contactOptions}
                    searchable
                    clearable
                    nothingFoundMessage="No contacts"
                    value={field.value || null}
                    onChange={(value) => field.onChange(value ?? "")}
                    name="endCustomerContactId"
                  />
                )}
              />
              <AddressPickerField
                label="Ship to"
                value={
                  shipToAddressId != null && shipToAddressId !== ""
                    ? Number(shipToAddressId)
                    : null
                }
                options={shipToAddressOptions}
                previewAddress={shipToPreviewAddress}
                hint={
                  companyDefaultAddress
                    ? `Default: ${formatAddressLines(companyDefaultAddress).join(
                        ", "
                      )}`
                    : undefined
                }
                onChange={(nextId) =>
                  form.setValue(
                    "shipToAddressId",
                    nextId != null ? String(nextId) : ""
                  )
                }
              />
              <input
                type="hidden"
                name="shipToAddressId"
                value={shipToAddressId ?? ""}
              />
              <input
                type="hidden"
                name="stockLocationId"
                value={stockLocationId ?? ""}
              />
              <Stack gap={4}>
                <Group gap="xs">
                  <Text size="xs" c="dimmed">
                    Stock location
                  </Text>
                  <Tooltip
                    label="Derived from customer company depot; used for material consumption."
                    withArrow
                  >
                    <span>
                      <IconInfoCircle size={14} />
                    </span>
                  </Tooltip>
                </Group>
                <Text size="sm">{stockLocationLabel}</Text>
              </Stack>
              <TextInput
                label="Project Code"
                {...form.register("projectCode")}
              />
              <TextInput label="Name" {...form.register("name")} />
              <Controller
                control={form.control}
                name="jobType"
                render={({ field }) => (
                  <Select
                    label="Job type"
                    data={jobTypeOptions}
                    searchable
                    clearable
                    nothingFoundMessage="No job types"
                    value={field.value || null}
                    onChange={(value) => field.onChange(value ?? "")}
                    name="jobType"
                  />
                )}
              />
            </Stack>
          </Card>
          <Card withBorder padding="md">
            <Stack gap="sm">
              <DatePickerInput
                label="Order date"
                value={form.watch("customerOrderDate") as Date | null}
                onChange={(v) =>
                  form.setValue(
                    "customerOrderDate",
                    v ? (v as unknown as Date) : null
                  )
                }
                valueFormat="YYYY-MM-DD"
                clearable
                name="customerOrderDate"
              />
              <DatePickerInput
                label="Internal target date"
                value={form.watch("internalTargetDate")}
                onChange={(v) =>
                  form.setValue(
                    "internalTargetDate",
                    v ? (v as unknown as Date) : null
                  )
                }
                valueFormat="YYYY-MM-DD"
                clearable
                name="internalTargetDate"
              />
              <DatePickerInput
                label="Customer target date"
                value={form.watch("customerTargetDate")}
                onChange={(v) =>
                  form.setValue(
                    "customerTargetDate",
                    v ? (v as unknown as Date) : null
                  )
                }
                valueFormat="YYYY-MM-DD"
                clearable
                name="customerTargetDate"
              />
              <DatePickerInput
                label="Drop-dead date"
                value={form.watch("dropDeadDate")}
                onChange={(v) =>
                  form.setValue(
                    "dropDeadDate",
                    v ? (v as unknown as Date) : null
                  )
                }
                valueFormat="YYYY-MM-DD"
                clearable
                name="dropDeadDate"
              />
            </Stack>
          </Card>
        </SimpleGrid>
        <Group justify="end" mt="md">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Create Job"}
          </Button>
        </Group>
      </Form>
    </Stack>
  );
}
