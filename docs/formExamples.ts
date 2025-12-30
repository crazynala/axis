/**
 * examples/formExamples.ts
 *
 * Purpose:
 * - Demonstrate the declarative form config DSL + layout primitives.
 * - This file is meant to be read by humans as a reference.
 *
 * Assumptions:
 * - You’ve added FormItem support to RenderGroup (FieldConfig | ui.header/divider/spacer/row).
 * - You’ve added ui helpers in cfg.ts: ui.header, ui.divider, ui.spacer, ui.row.
 * - You already have f/mod/policy builders (f.text, f.date, f.select, mod.hide, etc.).
 *
 * Notes:
 * - Use this as a copy/paste cookbook for new modules.
 * - Keep examples small and focused.
 */

import type { FieldConfig, FieldMode } from "~/base/forms/fieldConfigShared";
import type { FormItem } from "~/base/forms/formItems"; // or wherever you define the union
import { f, mod, policy, ui } from "~/base/forms/cfg";

const lockedOnEdit = ({ mode, ctx }: { mode: FieldMode; ctx?: any }) =>
  mode === "edit" && ctx?.state !== "DRAFT";

const lockWhenNotDraft = policy.lockWhenNotDraft(lockedOnEdit);

/**
 * EXAMPLE 1: Quiet header label
 * - Use when you want a subtle “section title” without a full card header.
 */
export const EXAMPLE_Header: FormItem[] = [
  ui.header("Targets", { tone: "dimmed", size: "xs" }),
  lockWhenNotDraft(f.date("internalTargetDate", "Internal target")),
  lockWhenNotDraft(f.date("customerTargetDate", "Customer target")),
];

/**
 * EXAMPLE 2: Quiet divider line
 * - Use to visually separate clusters of fields without adding a “header”.
 */
export const EXAMPLE_Divider: FormItem[] = [
  f.text("name", "Name"),
  ui.divider(),
  f.text("projectCode", "Project code"),
];

/**
 * EXAMPLE 3: Spacer (half field height)
 * - Use for subtle breathing room between related rows.
 * - Size is intentionally small (“xs”) so it doesn’t bloat density.
 */
export const EXAMPLE_Spacer: FormItem[] = [
  f.text("customerPoNum", "Customer PO #", { findOp: "equals" }),
  ui.spacer("xs"), // <-- quiet vertical gap
  f.text("notes", "Notes", { widget: "textarea" as any }),
];

/**
 * EXAMPLE 4: Two fields in a row (50/50)
 * - Use to pair related fields without extra headers.
 * - This replaces inlineWithNext for clarity when you explicitly want a row.
 */
export const EXAMPLE_Row_50_50: FormItem[] = [
  ui.row(
    f.select("companyId", "Customer", "customer", {
      readonlyWhen: ({ mode }) => mode === "edit", // customer immutable after create
    }),
    f.text("stockLocationLabel", "Stock location", {
      widget: "computed" as any,
      compute: ({ ctx }) => ctx?.stockLocationLabel ?? "—",
    })
  ),
];

/**
 * EXAMPLE 5: Two fields in a row with custom weights (30/70)
 * - Useful when one field tends to be long and needs more space.
 */
export const EXAMPLE_Row_30_70: FormItem[] = [
  ui.row(
    f.text("shortCode", "Short code", { findOp: "equals" }),
    f.text("companyName", "Company name"),
    [0.3, 0.7] // <-- custom weights
  ),
];

/**
 * EXAMPLE 6: Draft-only visibility for setup fields
 * - Demonstrates policy-driven visibility without forking the form.
 */
export const EXAMPLE_DraftOnly: FormItem[] = [
  ui.header("Setup (Draft only)"),
  // Show only when ctx.state === "DRAFT"
  mod.visible(({ ctx }) => ctx?.state === "DRAFT")(
    f.select("jobType", "Job type", "jobType")
  ),
  mod.visible(({ ctx }) => ctx?.state === "DRAFT")(
    f.date("customerOrderDate", "Order date")
  ),
];

/**
 * EXAMPLE 7: Hide fields by mode (Find vs Edit/Create)
 * - Keeps Findify and edit screens aligned while allowing mode-specific fields.
 */
export const EXAMPLE_HiddenInModes: FormItem[] = [
  mod.hide("edit", "create")(f.text("status", "Status")), // find-only
  mod.hide("find")(f.text("internalNotes", "Internal notes")), // edit/create only
];

/**
 * EXAMPLE 8: Trailing action (open entity modal)
 * - Shows the pattern: select an entity id + click external action button to open/edit.
 * - Tooltip uses the selected label by default.
 */
export const EXAMPLE_TrailingAction: FormItem[] = [
  f.select("shipToAddressId", "Ship-to", "job_shipto_address", {
    findOp: "equals",
    trailingAction: {
      kind: "openEntityModal",
      entity: "Address",
      // Optional tooltip override:
      tooltip: ({ ctx, value, label }) => {
        const byId = ctx?.addressById as Map<number, any> | undefined;
        const addr = value != null ? byId?.get(Number(value)) : null;
        return addr?.formatted ?? label ?? (value ? `Address ${value}` : "");
      },
    },
  }),
];

/**
 * EXAMPLE 9: Combine primitives into a realistic “mini form”
 * - This is a recommended template for operational “setup” screens:
 *   1) identity fields
 *   2) quiet divider
 *   3) dates cluster with quiet header + row for paired dates
 *   4) drop-dead date on its own line
 */
export const EXAMPLE_MiniForm: FormItem[] = [
  // Identity
  f.text("name", "Name"),
  f.text("projectCode", "Project code"),
  ui.divider(),

  // Dates / Targets cluster
  ui.header("Targets"),
  ui.row(
    lockWhenNotDraft(f.date("internalTargetDate", "Internal target")),
    lockWhenNotDraft(f.date("customerTargetDate", "Customer target"))
  ),
  ui.spacer("xs"),
  lockWhenNotDraft(f.date("dropDeadDate", "Drop-dead date")),
];

/**
 * If you want to wire this to a demo page:
 * - In a route, import one of these arrays and pass it to <RenderGroup items={EXAMPLE_MiniForm} ... />
 */
