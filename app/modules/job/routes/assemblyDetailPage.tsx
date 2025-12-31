import React from "react";
import { DatePickerInput } from "@mantine/dates";
import { CloseButton, Select, TextInput } from "@mantine/core";
import { Link } from "@remix-run/react";
import type { PageNode } from "~/base/forms/layoutTypes";
import type { FieldConfig, FormItem, OverrideItem } from "~/base/forms/fieldConfigShared";
import { L } from "~/base/forms/layoutDsl";
import { ui } from "~/base/forms/cfg";
import { DisplayField } from "~/base/forms/components/DisplayField";

const isDraft = ({ ctx }: { ctx?: any }) => Boolean(ctx?.isLoudMode);

const pseudoInputStyles = (isOverridden: boolean) =>
  isOverridden
    ? undefined
    : {
        input: {
          backgroundColor: "var(--axis-pseudo-bg)",
          borderColor: "var(--axis-pseudo-bd)",
        },
      };

const renderClearButton = (onClear: () => void) => (
  <CloseButton
    size="sm"
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClear}
    styles={{ icon: { color: "var(--axis-override-x-fg)" } }}
  />
);

const assemblyNameField: FieldConfig = {
  name: "assemblyName",
  label: "Assembly",
  render: ({ ctx, mode }) => {
    const value = (ctx as any)?.state?.assemblyName ?? "";
    const canEdit = mode === "edit" && (ctx as any)?.allowEditInCalm !== false;
    if (!canEdit) {
      return <DisplayField label="Assembly" value={value || "—"} />;
    }
    return (
      <TextInput
        label="Assembly"
        mod="data-autosize"
        value={value}
        onChange={(event) =>
          (ctx as any)?.state?.setAssemblyName(event.currentTarget.value)
        }
      />
    );
  },
};

const assemblyTypeField: FieldConfig = {
  name: "assemblyType",
  label: "Type",
  render: ({ ctx, mode }) => {
    const value = (ctx as any)?.state?.assemblyType ?? "";
    const canEdit = mode === "edit" && (ctx as any)?.allowEditInCalm !== false;
    if (!canEdit) {
      return <DisplayField label="Type" value={value || "—"} />;
    }
    return (
      <Select
        label="Type"
        mod="data-autosize"
        data={(ctx as any)?.assemblyTypeOptions || []}
        value={value}
        onChange={(next) =>
          (ctx as any)?.state?.setAssemblyType(next || "")
        }
        clearable={false}
      />
    );
  },
};

const assemblyProductField: FieldConfig = {
  name: "assemblyProduct",
  label: "Product",
  render: ({ ctx }) => {
    const product = (ctx as any)?.productForAssembly;
    const assembly = (ctx as any)?.primaryAssembly;
    const productId = product?.id ?? assembly?.productId;
    const label = product?.name || (productId ? `Product ${productId}` : "—");
    return productId ? (
      <DisplayField
        label="Product"
        value={<Link to={`/products/${productId}`}>{label}</Link>}
      />
    ) : (
      <DisplayField label="Product" value={label} />
    );
  },
};

const jobIdField: FieldConfig = {
  name: "jobId",
  label: "Job ID",
  render: ({ ctx }) => {
    const jobId = (ctx as any)?.job?.id;
    return <DisplayField label="Job ID" value={jobId ?? "—"} />;
  },
};

const assemblyIdField: FieldConfig = {
  name: "assemblyId",
  label: "Assembly ID",
  render: ({ ctx }) => {
    const id = (ctx as any)?.primaryAssembly?.id;
    return <DisplayField label="Assembly ID" value={id ? `A${id}` : "—"} />;
  },
};

const promiseInternalTarget: OverrideItem = ui.override({
  label: "Internal target",
  getJobValue: ({ ctx }) => (ctx as any)?.overrideTargets?.internal?.jobValue ?? null,
  getOverrideValue: ({ ctx }) => (ctx as any)?.state?.internalOverride,
  setOverrideValue: ({ ctx }, value) =>
    (ctx as any)?.state?.setInternalOverride(value),
  formatDisplay: (value, { ctx }) => (ctx as any)?.formatDateLabel(value),
  renderInput: ({ value, onChange, isOverridden, onClear }) => (
    <DatePickerInput
      label="Internal target"
      mod="data-autosize"
      value={value instanceof Date ? value : value ? new Date(value) : null}
      onChange={(next) => onChange(next ?? null)}
      valueFormat="YYYY-MM-DD"
      clearable={false}
      styles={pseudoInputStyles(isOverridden)}
      rightSection={isOverridden ? renderClearButton(onClear) : undefined}
    />
  ),
});

const promiseCustomerTarget: OverrideItem = ui.override({
  label: "Customer target",
  getJobValue: ({ ctx }) => (ctx as any)?.overrideTargets?.customer?.jobValue ?? null,
  getOverrideValue: ({ ctx }) => (ctx as any)?.state?.customerOverride,
  setOverrideValue: ({ ctx }, value) =>
    (ctx as any)?.state?.setCustomerOverride(value),
  formatDisplay: (value, { ctx }) => (ctx as any)?.formatDateLabel(value),
  renderInput: ({ value, onChange, isOverridden, onClear }) => (
    <DatePickerInput
      label="Customer target"
      mod="data-autosize"
      value={value instanceof Date ? value : value ? new Date(value) : null}
      onChange={(next) => onChange(next ?? null)}
      valueFormat="YYYY-MM-DD"
      clearable={false}
      styles={pseudoInputStyles(isOverridden)}
      rightSection={isOverridden ? renderClearButton(onClear) : undefined}
    />
  ),
});

const promiseDropDead: OverrideItem = ui.override({
  label: "Drop-dead",
  getJobValue: ({ ctx }) => (ctx as any)?.overrideTargets?.dropDead?.jobValue ?? null,
  getOverrideValue: ({ ctx }) => (ctx as any)?.state?.dropDeadOverride,
  setOverrideValue: ({ ctx }, value) =>
    (ctx as any)?.state?.setDropDeadOverride(value),
  formatDisplay: (value, { ctx }) => (ctx as any)?.formatDateLabel(value),
  renderInput: ({ value, onChange, isOverridden, onClear }) => (
    <DatePickerInput
      label="Drop-dead"
      mod="data-autosize"
      value={value instanceof Date ? value : value ? new Date(value) : null}
      onChange={(next) => onChange(next ?? null)}
      valueFormat="YYYY-MM-DD"
      clearable={false}
      styles={pseudoInputStyles(isOverridden)}
      rightSection={isOverridden ? renderClearButton(onClear) : undefined}
    />
  ),
});

const promiseShipTo: OverrideItem = ui.override({
  label: "Ship-to",
  getJobValue: ({ ctx }) =>
    (ctx as any)?.overrideTargets?.shipToAddress?.jobValue ?? null,
  getOverrideValue: ({ ctx }) => (ctx as any)?.state?.shipToAddressOverrideId,
  setOverrideValue: ({ ctx }, value) =>
    (ctx as any)?.state?.setShipToAddressOverrideId(value),
  formatDisplay: (value, { ctx }) =>
    (ctx as any)?.formatAddressLabel(value) || "—",
  renderInput: ({ value, onChange, isOverridden, onClear }) => (
    <Select
      label="Ship-to"
      mod="data-autosize"
      data={(ctx as any)?.shipToAddressOptions || []}
      value={value != null ? String(value) : null}
      onChange={(next) => {
        if (!next) {
          onChange(null);
          return;
        }
        const parsed = Number(next);
        onChange(Number.isFinite(parsed) ? parsed : null);
      }}
      clearable={false}
      styles={pseudoInputStyles(isOverridden)}
      rightSection={isOverridden ? renderClearButton(onClear) : undefined}
      placeholder={(ctx as any)?.shipToHint ? String((ctx as any)?.shipToHint) : undefined}
    />
  ),
});

const assemblyOverviewItems: FormItem[] = [
  assemblyNameField,
  assemblyTypeField,
  ui.spacer("xs"),
  assemblyProductField,
  jobIdField,
  assemblyIdField,
];

const assemblyPromiseItems: FormItem[] = [
  promiseInternalTarget,
  promiseCustomerTarget,
  promiseDropDead,
  promiseShipTo,
];

export const assemblyDetailPage: PageNode = L.page(
  { gutter: "md" },
  L.col(
    { span: { base: 12, md: 6 } },
    L.card(
      {
        key: "assembly",
        drawerTitle: "Edit assembly",
        drawerItems: assemblyOverviewItems,
        editableInlineWhen: isDraft,
        surfaceUiMode: ({ ctx }) => (ctx?.isLoudMode ? "normal" : "quiet"),
        drawerUiMode: "normal",
        surfaceAllowEdit: ({ ctx }) => Boolean(ctx?.isLoudMode),
        drawerAllowEdit: true,
        isDirtyWhen: ({ ctx }) => Boolean(ctx?.dirty?.assembly),
        onSave: ({ ctx }) => ctx?.actions?.saveAssembly?.(),
        onCancel: ({ ctx }) => ctx?.actions?.resetAssembly?.(),
      },
      ...assemblyOverviewItems
    )
  ),
  L.col(
    { span: { base: 12, md: 6 } },
    L.card(
      {
        key: "promises",
        drawerTitle: "Edit promises",
        drawerItems: assemblyPromiseItems,
        editableInlineWhen: isDraft,
        surfaceUiMode: ({ ctx }) => (ctx?.isLoudMode ? "normal" : "quiet"),
        drawerUiMode: "normal",
        surfaceAllowEdit: ({ ctx }) => Boolean(ctx?.isLoudMode),
        drawerAllowEdit: true,
        isDirtyWhen: ({ ctx }) => Boolean(ctx?.dirty?.promises),
        onSave: ({ ctx }) => ctx?.actions?.savePromises?.(),
        onCancel: ({ ctx }) => ctx?.actions?.resetPromises?.(),
      },
      ...assemblyPromiseItems
    )
  )
);
