import { JOB_DATES_STATUS_FIELDS } from "~/constants/spec";
import type { FieldConfig } from "~/base/forms/fieldConfigShared";
import { f, g, mod, policy } from "~/base/forms/cfg";
import { AddressPickerField } from "~/components/addresses/AddressPickerField";
import { formatAddressLines } from "~/utils/addressFormat";
import { Group, Text, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
export { renderField } from "~/base/forms/fieldConfigShared";

const isLockedOnEdit = ({
  mode,
  ctx,
}: {
  mode: "edit" | "find" | "create";
  ctx?: any;
}) => mode === "edit" && ctx?.jobState && ctx.jobState !== "DRAFT";
const locked = ({ mode, ctx }: { mode: "edit" | "find" | "create"; ctx?: any }) =>
  isLockedOnEdit({ mode, ctx });
const lockWhenNotDraft = policy.lockWhenNotDraft(locked);
const isDraft = ({ ctx }: { ctx?: any }) => ctx?.jobState === "DRAFT";

export const jobDateStatusLeft: FieldConfig[] = [
  mod.hide("edit", "create")(f.select("status", "Status", "jobStatus")),
  lockWhenNotDraft(f.date("customerOrderDate", "Order Date")),
  lockWhenNotDraft(f.date("internalTargetDate", "Internal Target Date")),
  lockWhenNotDraft(f.date("customerTargetDate", "Customer Target Date")),
  lockWhenNotDraft(f.date("dropDeadDate", "Drop Dead Date")),
];

export const jobDateStatusRight: FieldConfig[] = [
  mod.hide("edit")(f.date("targetDate", "Target Date")),
  f.text("stockLocationId", "Stock Location", {
    render: ({ ctx }) => {
      const label = (ctx as any)?.stockLocationLabel || "—";
      return (
        <div>
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
          <Text size="sm">{label}</Text>
        </div>
      );
    },
    hiddenInModes: ["find"],
  }),
];

// Overview (ID + main fields; customer/company picker handled separately)
export const jobOverviewFields: FieldConfig[] = [
  f.select("companyId", "Customer", "customer", {
    readonlyWhen: ({ mode }) => mode === "edit",
  }),
  mod.hide("find")(
    lockWhenNotDraft(
      f.select("endCustomerContactId", "End Customer", "endCustomerContact")
    )
  ),
  {
    name: "shipToAddressId",
    render: ({ form, ctx, mode }) => {
      const addressById = (ctx as any)?.addressById as Map<number, any> | undefined;
      const options = ctx?.fieldOptions?.job_shipto_address ?? [];
      const shipToAddressId = form.watch("shipToAddressId") as number | null;
      const legacyLocation = (ctx as any)?.jobShipToLocation;
      const defaultAddress = (ctx as any)?.jobDefaultAddress;
      const hintLines: string[] = [];
      if (!shipToAddressId && defaultAddress) {
        const lines = formatAddressLines(defaultAddress);
        hintLines.push(
          `Default: ${lines.length ? lines.join(", ") : `Address ${defaultAddress.id}`}`
        );
      }
      if (!shipToAddressId && legacyLocation) {
        hintLines.push(
          `Legacy ship-to location: ${legacyLocation.name || `Location ${legacyLocation.id}`}`
        );
      }
      const hint = hintLines.length ? hintLines.join(" · ") : null;
      const previewAddress =
        shipToAddressId != null && addressById
          ? addressById.get(Number(shipToAddressId)) ?? null
          : null;
      return (
        <AddressPickerField
          label="Ship-To Address"
          value={shipToAddressId ?? null}
          options={options}
          previewAddress={previewAddress}
          hint={hint || undefined}
          onChange={(nextId) => form.setValue("shipToAddressId", nextId)}
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
  },
  lockWhenNotDraft(f.text("projectCode", "Project Code")),
  lockWhenNotDraft(f.text("name", "Name")),
  lockWhenNotDraft(f.select("jobType", "Job Type", "jobType")),
  lockWhenNotDraft(
    f.text("customerPoNum", "Customer PO #", {
      findOp: "equals",
      findPlaceholder: "equals...",
    })
  ),
  mod.hide("edit", "create")(f.text("endCustomerName", "End Customer")),
  mod.hide("edit")(
    f.textarea("statusWhiteboard", "Status Whiteboard", {
      props: { minRows: 2 },
    })
  ),
  mod.hide("create")(f.id("id", "ID", { findPlaceholder: "equals..." })),
];

// Find-only: child assemblies
export const assemblyFields: FieldConfig[] = [
  mod.hide("edit", "create")(f.text("assemblySku", "Assembly SKU")),
  mod.hide("edit", "create")(f.text("assemblyName", "Assembly Name")),
  mod.hide("edit", "create")(f.text("assemblyStatus", "Assembly Status")),
];

export const jobEditGroups = {
  left: [g.group("overview", jobOverviewFields)],
  right: [
    g.group("dates-left", jobDateStatusLeft, { visibleWhen: isDraft }),
    g.group("dates-right", jobDateStatusRight, { visibleWhen: isDraft }),
  ],
  rightColumns: g.columns(
    { fields: jobDateStatusLeft, visibleWhen: isDraft },
    { fields: jobDateStatusRight, visibleWhen: isDraft }
  ),
};

export function validateJobDateStatusConfig() {
  const fields = new Set(
    [...jobDateStatusLeft, ...jobDateStatusRight].map((f) => f.name)
  );
  for (const f of JOB_DATES_STATUS_FIELDS) {
    if (!fields.has(f)) {
      console.warn(
        `[jobDetailConfig] Missing spec field in date/status config: ${f}`
      );
    }
  }
}
