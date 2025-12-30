import { JOB_DATES_STATUS_FIELDS } from "~/constants/spec";
import type { FieldConfig, FormItem } from "~/base/forms/fieldConfigShared";
import { L } from "~/base/forms/layoutDsl";
import type { PageNode } from "~/base/forms/layoutTypes";
import { f, mod, policy, ui } from "~/base/forms/cfg";
import { AddressPickerField } from "~/components/addresses/AddressPickerField";
import { formatAddressLines } from "~/utils/addressFormat";
import { Group, Table, Text } from "@mantine/core";
import { Link } from "@remix-run/react";
import {
  ASSEMBLY_OPERATIONAL_STATUS_LABELS,
  deriveAssemblyOperationalStatus,
} from "~/modules/assembly/derived/assemblyOperationalStatus";
import { DisplayField } from "~/base/forms/components/DisplayField";
export { renderField } from "~/base/forms/fieldConfigShared";

const isLockedOnEdit = ({
  mode,
  ctx,
}: {
  mode: "edit" | "find" | "create";
  ctx?: any;
}) =>
  mode === "edit" &&
  ctx?.jobState &&
  ctx.jobState !== "DRAFT" &&
  !ctx?.allowEditInCalm;
const locked = ({
  mode,
  ctx,
}: {
  mode: "edit" | "find" | "create";
  ctx?: any;
}) => isLockedOnEdit({ mode, ctx });
const lockWhenNotDraft = policy.lockWhenNotDraft(locked);
const isDraft = ({ ctx }: { ctx?: any }) => ctx?.jobState === "DRAFT";
const surfaceUiMode = ({ ctx }: { ctx?: any }) =>
  ctx?.jobState === "DRAFT" ? "normal" : "quiet";
const surfaceAllowEdit = ({ ctx }: { ctx?: any }) => ctx?.jobState === "DRAFT";

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

const customerField = f.select("companyId", "Customer", "customer", {
  readonlyWhen: ({ mode }) => mode === "edit",
});
const stockLocationField = f.text("stockLocationId", "Stock Location", {
  render: ({ ctx }) => {
    const label = (ctx as any)?.stockLocationLabel || "—";
    return (
      <DisplayField
        label="Stock location"
        value={label}
        help="Derived from customer company depot; used for material consumption."
      />
    );
  },
  hiddenInModes: ["find"],
});
const endCustomerField = lockWhenNotDraft(
  f.select("endCustomerContactId", "End Customer", "endCustomerContact")
);
const shipToField: FieldConfig = {
  name: "shipToAddressId",
  label: "Ship To",
  render: ({ form, ctx, mode }) => {
    const addressById = (ctx as any)?.addressById as
      | Map<number, any>
      | undefined;
    const options = ctx?.fieldOptions?.job_shipto_address ?? [];
    const shipToAddressId = form.watch("shipToAddressId") as number | null;
    const legacyLocation = (ctx as any)?.jobShipToLocation;
    const defaultAddress = (ctx as any)?.jobDefaultAddress;
    const hintLines: string[] = [];
    if (!shipToAddressId && defaultAddress) {
      const lines = formatAddressLines(defaultAddress);
      hintLines.push(
        `Default: ${
          lines.length ? lines.join(", ") : `Address ${defaultAddress.id}`
        }`
      );
    }
    if (!shipToAddressId && legacyLocation) {
      hintLines.push(
        `Legacy ship-to location: ${
          legacyLocation.name || `Location ${legacyLocation.id}`
        }`
      );
    }
    const hint = hintLines.length ? hintLines.join(" · ") : null;
    const previewAddress =
      shipToAddressId != null && addressById
        ? addressById.get(Number(shipToAddressId)) ?? null
        : null;
    return (
      <AddressPickerField
        label="Ship To"
        value={shipToAddressId ?? null}
        options={options}
        previewAddress={previewAddress}
        hint={hint || undefined}
        onChange={(nextId) => {
          const opts = (ctx as any)?.markDirtyOnChange
            ? { shouldDirty: true, shouldTouch: true }
            : undefined;
          form.setValue("shipToAddressId", nextId, opts as any);
        }}
        disabled={isLockedOnEdit({ mode, ctx })}
        showOpenLink={false}
      />
    );
  },
  trailingAction: {
    kind: "openEntityModal",
    entity: "Address",
    tooltip: ({ ctx, value, label }) => {
      if (value == null || value === "") return undefined;
      const addressById = (ctx as any)?.addressById as
        | Map<number, any>
        | undefined;
      const addr = addressById?.get(Number(value)) ?? null;
      if (addr) {
        const lines = formatAddressLines(addr);
        if (lines.length) return lines.join(", ");
      }
      return label || `Address ${value}`;
    },
  },
  findOp: "equals",
  hiddenInModes: ["find"],
};
const customerOrderDateField = lockWhenNotDraft(
  f.date("customerOrderDate", "Order Date")
);
const internalTargetDateField = lockWhenNotDraft(
  f.date("internalTargetDate", "Internal")
);
const customerTargetDateField = lockWhenNotDraft(
  f.date("customerTargetDate", "Customer")
);
const dropDeadDateField = lockWhenNotDraft(f.date("dropDeadDate", "Drop Dead"));
const targetDateField = mod.hide("edit")(f.date("targetDate", "Target Date"));
const statusField = mod.hide(
  "edit",
  "create"
)(f.select("status", "Status", "jobStatus"));

const jobDateStatusItems: FormItem[] = [
  ui.row(statusField, targetDateField),
  customerOrderDateField,
  lockWhenNotDraft(
    f.text("customerPoNum", "Customer PO #", {
      findOp: "equals",
      findPlaceholder: "equals...",
    })
  ),
  ui.labelDivider("TARGET DATES", "above_target_dates"),
  internalTargetDateField,
  customerTargetDateField,
  dropDeadDateField,
];

// Overview (ID + main fields; customer/company picker handled separately)
export const jobOverviewFields: FormItem[] = [
  ui.row(customerField, stockLocationField),
  mod.hide("find")(endCustomerField),
  ui.spacer("xs"),
  ui.row(
    lockWhenNotDraft(f.text("projectCode", "Project Code")),
    lockWhenNotDraft(f.select("jobType", "Job Type", "jobType"))
  ),
  lockWhenNotDraft(f.text("name", "Name")),

  mod.hide("edit", "create")(f.text("endCustomerName", "End Customer")),
  mod.hide("edit")(
    f.textarea("statusWhiteboard", "Status Whiteboard", {
      props: { minRows: 2 },
    })
  ),
  ui.spacer("xs"),
  shipToField,
  // mod.hide("create")(f.id("id", "ID", { findPlaceholder: "equals..." })),
  {
    name: "jobIdInline",
    label: "ID",
    render: ({ ctx }) => {
      const id = (ctx as any)?.job?.id;
      if (!id) return null;
      return (
        <Group justify="flex-end" style={{ position: "relative", top: "8px" }}>
          <Text size="xs" c="dimmed">
            ID: {id}
          </Text>
        </Group>
      );
    },
    visibleWhen: ({ ctx }) => Boolean((ctx as any)?.job?.id),
  },
];

// Find-only: child assemblies
export const assemblyFields: FieldConfig[] = [
  mod.hide("edit", "create")(f.text("assemblySku", "Assembly SKU")),
  mod.hide("edit", "create")(f.text("assemblyName", "Assembly Name")),
  mod.hide("edit", "create")(f.text("assemblyStatus", "Assembly Status")),
];

const assemblyImpactField: FieldConfig = {
  name: "assemblyImpact",
  label: "Assembly impact",
  widget: "computed",
  compute: ({ ctx }) => {
    const job = (ctx as any)?.job;
    const productsById = (ctx as any)?.productsById || {};
    const assemblyTargetsById = (ctx as any)?.assemblyTargetsById || {};
    const assemblies = (job?.assemblies || []) as any[];
    return (
      <div style={{ overflowX: "auto" }}>
        <Table withRowBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Assembly</Table.Th>
              <Table.Th>Internal target</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {assemblies.map((assembly) => {
              const product = assembly.productId
                ? productsById[assembly.productId]
                : null;
              const targets = assemblyTargetsById?.[assembly.id];
              const internalTarget = targets?.internal;
              const derived = deriveAssemblyOperationalStatus({
                orderedBySize: assembly.qtyOrderedBreakdown,
                canceledBySize: (assembly as any).c_canceled_Breakdown,
                qtyCut: (assembly as any).c_qtyCut,
                qtySew: (assembly as any).c_qtySew,
                qtyFinish: (assembly as any).c_qtyFinish,
                qtyPack: (assembly as any).c_qtyPack,
              });
              return (
                <Table.Tr key={`impact-${assembly.id}`}>
                  <Table.Td>
                    <Link to={`assembly/${assembly.id}`}>
                      {assembly.name ||
                        product?.name ||
                        `Assembly ${assembly.id}`}
                    </Link>
                  </Table.Td>
                  <Table.Td>{formatDateLabel(internalTarget?.value)}</Table.Td>
                  <Table.Td>
                    {ASSEMBLY_OPERATIONAL_STATUS_LABELS[derived.status]}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>
    );
  },
};

const jobDateErrorField: FieldConfig = {
  name: "jobDateError",
  label: "",
  render: ({ ctx }) => {
    const error = (ctx as any)?.jobDateError;
    if (!error) return null;
    return (
      <Text size="sm" c="red">
        {error}
      </Text>
    );
  },
  visibleWhen: ({ ctx }) => Boolean((ctx as any)?.jobDateError),
};

export const jobTargetsDrawerItems: FormItem[] = [
  ui.header("Targets", { tone: "dimmed", size: "xs" }),
  ui.row(internalTargetDateField, customerTargetDateField),
  dropDeadDateField,
  jobDateErrorField,
  ui.spacer("sm"),
  ui.header("Delivery", { tone: "dimmed", size: "xs" }),
  shipToField,
  stockLocationField,
  ui.divider(),
  assemblyImpactField,
];

export const jobFields = {
  overview: jobOverviewFields,
  dateStatus: jobDateStatusItems,
  targetsDrawer: jobTargetsDrawerItems,
  assembly: assemblyFields,
};

export const jobDetailPage: PageNode = L.page(
  { gutter: "md" },
  L.col(
    { span: { base: 12, md: 7 } },
    L.card(
      {
        key: "overview",
        drawerTitle: "Edit job setup",
        drawerItems: jobFields.overview,
        editableInlineWhen: isDraft,
        surfaceUiMode,
        surfaceAllowEdit,
        drawerUiMode: "normal",
        drawerAllowEdit: true,
      },
      ...jobFields.overview
    )
  ),
  L.col(
    { span: { base: 12, md: 5 } },
    L.card(
      {
        key: "targets",
        drawerTitle: "Targets & Delivery",
        drawerItems: jobFields.targetsDrawer,
        editableInlineWhen: isDraft,
        surfaceUiMode,
        surfaceAllowEdit,
        drawerUiMode: "normal",
        drawerAllowEdit: true,
      },
      ...jobFields.dateStatus
    )
  )
);

function getFieldNames(items: FormItem[]) {
  const names: string[] = [];
  for (const item of items) {
    if ((item as any)?.kind === "row") {
      names.push(item.items[0].name, item.items[1].name);
      continue;
    }
    if ((item as any)?.kind) continue;
    names.push((item as FieldConfig).name);
  }
  return names;
}

export function validateJobDateStatusConfig() {
  const fields = new Set([
    ...getFieldNames(jobDateStatusLeft),
    ...getFieldNames(jobDateStatusRight),
  ]);
  for (const f of JOB_DATES_STATUS_FIELDS) {
    if (!fields.has(f)) {
      console.warn(
        `[jobDetailConfig] Missing spec field in date/status config: ${f}`
      );
    }
  }
}
