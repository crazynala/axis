import React from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { DatePickerInput } from "@mantine/dates";
import {
  TextInput,
  Group,
  SegmentedControl,
  Checkbox,
  Indicator,
  Input,
  CloseButton,
  Combobox,
  useCombobox,
  Divider,
  Text,
  Tooltip,
} from "@mantine/core";
import { useOptions } from "../options/OptionsContext";
import { IconEditCircle } from "@tabler/icons-react";
import { IconCircle, IconCircleFilled } from "@tabler/icons-react";
import { buildCommonInputProps } from "./fieldRequired";
import { getSelectOptions } from "./fieldOptions";
import { resolveFieldState } from "./fieldState";
import { renderTrailingActionWrapper } from "./fieldTrailingAction";
import { DisplayField } from "./components/DisplayField";

export type FieldMode = "edit" | "find" | "create";

export type TrailingActionArgs = {
  form: UseFormReturn<any>;
  mode: FieldMode;
  field: FieldConfig;
  ctx?: RenderContext;
  value: any;
  label: string;
};

export type TrailingActionConfig = {
  kind: "openEntityModal";
  entity: string;
  tooltip?: (args: TrailingActionArgs) => React.ReactNode;
  disabledWhen?: (args: TrailingActionArgs) => boolean;
  getId?: (args: TrailingActionArgs) => string | number | null;
};

export type FieldConfig = {
  name: string;
  label: string;
  widget?:
    | "text"
    | "select"
    | "idStatic"
    | "triBool"
    | "numberRange"
    | "date"
    | "computed"
    | "defaultOverride";
  // optional semantic type hint (e.g., "date") used for defaults
  type?: string;
  findOp?: "contains" | "equals" | "range" | string;
  hiddenInModes?: FieldMode[];
  editable?: boolean;
  readOnly?: boolean;
  readOnlyIf?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
  }) => boolean;
  readonlyWhen?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
  }) => boolean;
  disabledWhen?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
  }) => boolean;
  findPlaceholder?: string;
  options?: { value: string; label: string }[];
  optionsKey?: string; // maps to ctx.fieldOptions[key]
  allOptionsKey?: string; // optional fallback pool to use when no options are found in optionsKey (or when filtered list is empty)
  rangeFields?: { min?: string; max?: string };
  // computed (display-only) widget props
  deps?: string[]; // names to watch to refresh computed output (RenderGroup already watches all; this can be used for clarity)
  compute?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
    values: any;
  }) => React.ReactNode;
  // defaultOverride widget props
  overrideName?: string; // the editable field name that will be submitted
  defaultName?: string; // fallback: read this field's value when override empty
  computeDefault?: (values: any, ctx?: RenderContext) => any; // or compute default from values
  format?: (v: any) => React.ReactNode; // optional formatter for display
  // Treat certain values as "empty" for override presence (e.g., 0 for percentages)
  overrideIsEmpty?: (value: any, ctx?: RenderContext) => boolean;
  // When editing defaultOverride, optionally transform between stored value and input value
  overrideAdapter?: {
    toInput: (value: any, ctx?: RenderContext) => any;
    fromInput: (input: any, ctx?: RenderContext) => any;
  };
  sticky?: boolean; // if true (default), show override input by default when value present
  inputType?: string; // input type for override editor (e.g., number)
  placeholder?: string;
  // Optional predicate to conditionally display this field
  showIf?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
  }) => boolean;
  // For select fields: allow creating new options from search
  allowCreate?: boolean;
  // For select fields: async creator for new options
  createOption?: (
    input: string,
    ctx?: RenderContext
  ) => Promise<{ value: string; label: string } | null>;
  visibleWhen?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
  }) => boolean;
  // Layout: render this field inline with the next visible field on the same row
  inlineWithNext?: boolean;
  // Layout: flex grow/basis for inline items (defaults to 1)
  flex?: number;
  render?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
  }) => React.ReactNode;
  // Optional rightSection content for inputs (ActionIcon, etc.)
  rightSection?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
  }) => React.ReactNode;
  // Optional trailing action rendered outside the input control
  trailingAction?: TrailingActionConfig;
};

export type DividerItem = {
  kind: "divider";
  key?: string;
};

export type LabelDividerItem = {
  kind: "labelDivider";
  label: string;
  key?: string;
};

export type SpacerItem = {
  kind: "spacer";
  size?: "xs" | "sm" | "md";
  key?: string;
};

export type HeaderItem = {
  kind: "header";
  label: string;
  tone?: "dimmed" | "normal";
  size?: "xs" | "sm";
  key?: string;
};

export type RowItem = {
  kind: "row";
  items: [FieldConfig, FieldConfig];
  weights?: [number, number];
  key?: string;
};

export type OverrideItem = {
  kind: "override";
  key?: string;
  label: string;
  getJobValue: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    ctx?: RenderContext;
  }) => any;
  getOverrideValue: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    ctx?: RenderContext;
  }) => any;
  setOverrideValue: (
    args: { form: UseFormReturn<any>; mode: FieldMode; ctx?: RenderContext },
    nextValue: any
  ) => void;
  formatDisplay?: (
    value: any,
    args: { form: UseFormReturn<any>; mode: FieldMode; ctx?: RenderContext }
  ) => React.ReactNode;
  renderInput: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    ctx?: RenderContext;
    value: any;
    onChange: (nextValue: any) => void;
    isOverridden: boolean;
    onClear: () => void;
  }) => React.ReactNode;
};

export type FormItem =
  | FieldConfig
  | DividerItem
  | LabelDividerItem
  | SpacerItem
  | HeaderItem
  | RowItem
  | OverrideItem;

export type RenderContext = {
  fieldOptions?: Record<string, { value: string; label: string }[]>;
  options?: any; // full OptionsData if available
  openCustomerModal?: () => void;
  openEntityModal?: (args: { entity: string; id: string | number }) => void;
  uiMode?: "normal" | "quiet";
  emptyDisplay?: string;
  [key: string]: any;
};

function formatEmptyValue(value: any, ctx?: RenderContext) {
  if (value == null) return ctx?.emptyDisplay ?? "—";
  if (typeof value === "string" && value.trim() === "") {
    return ctx?.emptyDisplay ?? "—";
  }
  return value;
}

function OverrideSourceIcon({ isOverridden }: { isOverridden: boolean }) {
  return (
    <Tooltip
      label={isOverridden ? "Overridden on Assembly" : "From Job"}
      withArrow
    >
      <span>
        {isOverridden ? (
          <IconCircleFilled size={12} color="var(--axis-override-icon-fg-active)" />
        ) : (
          <IconCircle size={12} color="var(--axis-override-icon-fg)" />
        )}
      </span>
    </Tooltip>
  );
}

export function ReadOnlyDisplayInput({
  common,
  value,
  ctx,
}: {
  common: any;
  value: any;
  ctx?: RenderContext;
}) {
  const display = formatEmptyValue(value, ctx);
  const isQuiet = ctx?.uiMode === "quiet" && !common?.error;
  if (isQuiet) {
    return (
      <TextInput
        {...common}
        variant="unstyled"
        readOnly
        value={display != null ? String(display) : ""}
      />
    );
  }
  return (
    <TextInput
      {...common}
      readOnly
      value={display != null ? String(display) : ""}
    />
  );
}

// Hoisted renderer for defaultOverride to avoid remounting on each parent render
function DefaultOverrideRenderer({
  form,
  field,
  mode,
  ctx,
}: {
  form: UseFormReturn<any>;
  field: FieldConfig;
  mode: FieldMode;
  ctx?: RenderContext;
}) {
  // console.log("!! default overrride render:", field.name, ctx);
  const common: any = { label: field.label, mod: "data-autosize" };
  const curOverrideName = field.overrideName as string | undefined;
  const sticky = field.sticky ?? true;
  const format = field.format || ((v: any) => (v != null ? String(v) : ""));
  const inputType = field.inputType ?? "number";
  const placeholder = field.placeholder ?? "Enter override";
  const overrideVal = curOverrideName
    ? (form.watch(curOverrideName as any) as any)
    : undefined;
  const computeDefaultVal = React.useCallback(() => {
    if (field.computeDefault) {
      // console.log("!! compute default for", field.name, ctx);
      return field.computeDefault(form.getValues(), ctx);
    }
    if (field.defaultName) return (form.getValues() as any)[field.defaultName];
    return undefined;
  }, [field, form, ctx]);
  const defaultVal = computeDefaultVal();
  // console.log("!! default value", defaultVal);
  const hasOverride = React.useMemo(() => {
    const isEmpty = field.overrideIsEmpty
      ? field.overrideIsEmpty(overrideVal, ctx)
      : overrideVal == null || String(overrideVal) === "";
    return !isEmpty;
  }, [overrideVal, field, ctx]);
  const [editing, setEditing] = React.useState<boolean>(
    sticky ? !!hasOverride : false
  );
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const registered = React.useMemo(() => {
    return curOverrideName ? form.register(curOverrideName as any) : undefined;
  }, [form, curOverrideName]);
  React.useEffect(() => {
    // Keep the input open while editing even if the value becomes empty.
    // Only auto-open when not editing and an override exists.
    if (sticky && !editing) setEditing(!!hasOverride);
  }, [sticky, hasOverride, editing]);
  React.useEffect(() => {
    if (editing && inputRef.current) {
      try {
        inputRef.current.focus();
        // Select existing value to allow immediate typing-over
        inputRef.current.select?.();
      } catch {}
    }
  }, [editing]);
  const show = hasOverride ? overrideVal : defaultVal;
  return !editing ? (
    <TextInput
      variant="unstyled"
      readOnly
      {...common}
      value={format(show) as any}
      onClick={() => setEditing(true)}
      rightSection={<IconEditCircle size={16} />}
      styles={{
        input: { paddingLeft: "11px" },
      }}
    />
  ) : (
    <Input.Wrapper {...common}>
      <Indicator color="red" position="middle-start">
        {curOverrideName ? (
          <Controller
            control={form.control}
            name={curOverrideName as any}
            render={({ field: f }) => {
              const adapter = field.overrideAdapter;
              const inputValue = adapter
                ? adapter.toInput(f.value, ctx)
                : f.value ?? "";
              return (
                <TextInput
                  type={inputType as any}
                  placeholder={placeholder}
                  autoFocus
                  value={inputValue as any}
                  onChange={(e) => {
                    const raw = (e.target as HTMLInputElement).value;
                    const parsed = field.overrideAdapter
                      ? field.overrideAdapter.fromInput(raw, ctx)
                      : raw;
                    f.onChange(parsed as any);
                  }}
                  onBlur={(e) => {
                    f.onBlur();
                    const cur = form.getValues()[curOverrideName as any];
                    const empty = cur == null || String(cur) === "";
                    if (empty) setEditing(false);
                  }}
                  ref={(el) => {
                    inputRef.current = el as any;
                    const rf = f.ref as any;
                    if (typeof rf === "function") rf(el);
                    else if (rf && "current" in rf) rf.current = el;
                  }}
                  rightSection={
                    <CloseButton
                      size="sm"
                      onClick={() => {
                        form.setValue(curOverrideName as any, null, {
                          shouldDirty: true,
                        });
                        setEditing(false);
                      }}
                    />
                  }
                />
              );
            }}
          />
        ) : (
          <TextInput
            type={inputType as any}
            placeholder={placeholder}
            autoFocus
            ref={(el) => {
              inputRef.current = el as any;
            }}
            rightSection={
              <CloseButton
                size="sm"
                onClick={() => {
                  setEditing(false);
                }}
              />
            }
          />
        )}
      </Indicator>
    </Input.Wrapper>
  );
}

export function renderField(
  form: UseFormReturn<any>,
  field: FieldConfig,
  mode: FieldMode,
  ctx?: RenderContext
) {
  if (field.hiddenInModes && field.hiddenInModes.includes(mode)) return null;
  if (field.visibleWhen && !field.visibleWhen({ form, mode, field, ctx })) {
    return null;
  }
  if (field.showIf && !field.showIf({ form, mode, field, ctx })) {
    return null;
  }
  const widget = field.widget || (field.type === "date" ? "date" : "text");
  const common: any = buildCommonInputProps(field, ctx);
  const { resolvedReadOnly, resolvedDisabled } = resolveFieldState({
    form,
    field,
    mode,
    ctx,
  });
  const emptyDisplay = ctx?.emptyDisplay ?? "—";

  const renderControl = () => {
    if (field.render) return field.render({ form, mode, field, ctx });
    switch (widget) {
      case "computed": {
        const values = form.getValues();
        const out = field.compute
          ? field.compute({ form, mode, field, ctx, values })
          : null;
        // Render as read-only text input when scalar; else render a simple block
        if (typeof out === "string" || typeof out === "number" || out == null) {
          return (
            <TextInput
              {...common}
              readOnly
              value={out != null ? String(out) : ""}
            />
          );
        }
        return (
          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>{field.label}</div>
            <div>{out}</div>
          </div>
        );
      }
      case "defaultOverride": {
        return (
          <DefaultOverrideRenderer
            form={form}
            field={field}
            mode={mode}
            ctx={ctx}
          />
        );
      }
      case "idStatic": {
        if (mode === "find") {
          return (
            <TextInput
              {...common}
              placeholder={field.findPlaceholder || "equals..."}
              {...form.register(field.name as any)}
            />
          );
        }
        const v =
          form.watch(field.name as any) ??
          (form.getValues() as any)?.[field.name];
        return <ReadOnlyDisplayInput common={common} value={v} ctx={ctx} />;
      }
      case "date": {
        if (mode === "find") {
          return (
            <TextInput
              {...common}
              placeholder={field.findPlaceholder || "yyyy-mm-dd"}
              {...form.register(field.name as any)}
            />
          );
        }
        const isSameDay = (a: Date, b: Date) =>
          a.getFullYear() === b.getFullYear() &&
          a.getMonth() === b.getMonth() &&
          a.getDate() === b.getDate();
        const dayRenderer = (dateInput: any) => {
          const today = new Date();
          const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
          const valid = d instanceof Date && !isNaN(d.getTime());
          const isToday = valid && isSameDay(d, today);
          const label = valid
            ? d.getDate()
            : typeof dateInput === "number"
            ? dateInput
            : "";
          return (
            <Indicator size={6} color="red" offset={-5} disabled={!isToday}>
              <div>{label}</div>
            </Indicator>
          );
        };
        if (resolvedReadOnly && ctx?.uiMode === "quiet" && !common.error) {
          const value =
            form.watch(field.name as any) ??
            (form.getValues() as any)?.[field.name];
          const date =
            value instanceof Date ? value : value ? new Date(value) : null;
          const formatted =
            date && !isNaN(date.getTime())
              ? date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : emptyDisplay;
          return (
            <ReadOnlyDisplayInput common={common} value={formatted} ctx={ctx} />
          );
        }
        // Use Controller to wire value/onChange so RHF can track dirty/touched reliably
        return (
          <Controller
            control={form.control}
            name={field.name as any}
            render={({ field: f }) => {
              const v: any = f.value;
              const value: Date | null = v
                ? v instanceof Date
                  ? v
                  : new Date(v)
                : null;
              return (
                <DatePickerInput
                  {...common}
                  value={value}
                  onChange={(d) => {
                    // Forward as-is; RHF will compute dirty vs defaultValue
                    f.onChange(d as any);
                  }}
                  onBlur={f.onBlur}
                  ref={f.ref as any}
                  clearable
                  renderDay={dayRenderer}
                  disabled={resolvedReadOnly || resolvedDisabled}
                />
              );
            }}
          />
        );
      }
      case "select": {
        const { primary, fallback } = getSelectOptions(field, ctx) as any;
        return (
          <Controller
            control={form.control}
            name={field.name as any}
            render={({ field: f }) => {
              const unaccentText = (s: string) =>
                (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              const cur = f.value;
              const coerceToNumber =
                typeof cur === "number" || /Id$/.test(field.name);
              const valueStr = cur == null || cur === "" ? null : String(cur);
              const [createdOptions, setCreatedOptions] = React.useState<
                { value: string; label: string }[]
              >([]);
              const [createError, setCreateError] = React.useState<string | null>(
                null
              );
              const allForLookup = React.useMemo(
                () => [
                  ...(primary || []),
                  ...(fallback || []),
                  ...createdOptions,
                ],
                [primary, fallback, createdOptions]
              );
              const selectedLabel = React.useMemo(() => {
                if (valueStr == null) return "";
                const hit = allForLookup.find((o) => o.value === valueStr);
                return hit?.label || valueStr;
              }, [valueStr, allForLookup]);

              const combobox = useCombobox({
                onDropdownClose: () => combobox.resetSelectedOption(),
              });
              const [search, setSearch] = React.useState<string>("");
              const clickedByMouseRef = React.useRef(false);
              const wasFocusedRef = React.useRef(false);

              const baseList =
                primary && primary.length ? primary : fallback || [];

              const filter = (list: { value: string; label: string }[]) => {
                if (!search) return list;
                const q = unaccentText(search).toLowerCase();
                return list.filter((o) =>
                  unaccentText(String(o.label || ""))
                    .toLowerCase()
                    .includes(q)
                );
              };
              const filteredPrimary = filter(primary || []);
              const filteredFallback = filter(fallback || []);
              const visible =
                primary && primary.length && filteredPrimary.length > 0
                  ? filteredPrimary
                  : filteredFallback.length > 0
                  ? filteredFallback
                  : filter(baseList);
              const showCreate =
                field.allowCreate &&
                mode !== "find" &&
                search.trim().length > 0 &&
                !allForLookup.some(
                  (opt) =>
                    String(opt.label).toLowerCase() ===
                      search.trim().toLowerCase() ||
                    String(opt.value).toLowerCase() ===
                      search.trim().toLowerCase()
                );

              const setFormValue = (v: string | null) => {
                const out = coerceToNumber
                  ? v != null && v !== ""
                    ? Number(v)
                    : null
                  : v ?? null;
                f.onChange(out);
              };

              if (resolvedReadOnly) {
                const displayValue =
                  selectedLabel || (ctx?.emptyDisplay ?? "—");
                return (
                  <>
                    <input
                      type="hidden"
                      name={field.name}
                      value={valueStr ?? ""}
                      aria-hidden
                    />
                    <ReadOnlyDisplayInput
                      common={common}
                      value={displayValue}
                      ctx={ctx}
                    />
                  </>
                );
              }

              return (
                <>
                  <input
                    type="hidden"
                    name={field.name}
                    value={valueStr ?? ""}
                    aria-hidden
                  />
                  <Combobox
                    store={combobox}
                    withinPortal
                    onOptionSubmit={async (val) => {
                      let shouldClose = true;
                      if (val === "__EMPTY__") {
                        setFormValue(mode === "find" ? "" : null);
                        setSearch("");
                      } else if (val === "__CREATE__") {
                        if (!field.createOption) return;
                        try {
                          const created = await field.createOption(
                            search.trim(),
                            ctx
                          );
                          if (!created?.value) {
                            setCreateError("Unable to create option.");
                            shouldClose = false;
                            return;
                          }
                          setCreateError(null);
                          form.clearErrors(field.name as any);
                          setCreatedOptions((prev) => [...prev, created]);
                          setFormValue(created.value);
                          setSearch(created.label || search.trim());
                        } catch (err) {
                          const message =
                            err instanceof Error ? err.message : "Create failed.";
                          setCreateError(message);
                          form.setError(field.name as any, {
                            type: "manual",
                            message,
                          });
                          shouldClose = false;
                          return;
                        }
                      } else {
                        setCreateError(null);
                        form.clearErrors(field.name as any);
                        setFormValue(val);
                        const picked = allForLookup.find(
                          (o) => o.value === val
                        );
                        setSearch(picked?.label || "");
                      }
                      if (shouldClose) {
                        combobox.closeDropdown();
                      }
                    }}
                  >
                    <Combobox.Target>
                      <TextInput
                        {...common}
                        error={
                          createError ||
                          (form.formState.errors as any)?.[field.name]?.message ||
                          common.error
                        }
                        value={
                          combobox.dropdownOpened || createError
                            ? search
                            : selectedLabel
                        }
                        onMouseDown={(event) => {
                          clickedByMouseRef.current = true;
                          if (wasFocusedRef.current) {
                            combobox.openDropdown();
                            combobox.updateSelectedOptionIndex();
                          }
                          event.currentTarget.select();
                        }}
                        onFocus={(event) => {
                          setSearch(selectedLabel);
                          wasFocusedRef.current = true;
                          if (clickedByMouseRef.current) {
                            combobox.openDropdown();
                            combobox.updateSelectedOptionIndex();
                          } else {
                            combobox.closeDropdown();
                          }
                          clickedByMouseRef.current = false;
                        }}
                        onChange={(event) => {
                          setSearch(event.currentTarget.value);
                          setCreateError(null);
                          form.clearErrors(field.name as any);
                          combobox.openDropdown();
                          combobox.updateSelectedOptionIndex();
                        }}
                        onBlur={(e) => {
                          if (wasFocusedRef.current) {
                            f.onBlur();
                          }
                          combobox.closeDropdown();
                          clickedByMouseRef.current = false;
                          wasFocusedRef.current = false;
                        }}
                        rightSection={
                          valueStr != null ||
                          (mode === "find" && (f.value ?? "") !== "") ? (
                            <CloseButton
                              size="sm"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setFormValue(mode === "find" ? "" : null);
                                setSearch("");
                              }}
                            />
                          ) : undefined
                        }
                        placeholder={
                          mode === "find"
                            ? field.findPlaceholder || "any"
                            : undefined
                        }
                        ref={f.ref as any}
                        disabled={resolvedDisabled}
                      />
                    </Combobox.Target>
                    <Combobox.Dropdown>
                      <div
                        style={{
                          maxHeight: 260,
                          overflowY: "auto",
                          overscrollBehavior: "contain",
                        }}
                        onWheel={(e) => {
                          // prevent page scroll while interacting with dropdown
                          e.stopPropagation();
                        }}
                      >
                        <Combobox.Options>
                          {mode === "find" && (
                            <Combobox.Option value="__EMPTY__">
                              (Any)
                            </Combobox.Option>
                          )}
                          {showCreate && (
                            <Combobox.Option value="__CREATE__">
                              Create "{search.trim()}"
                            </Combobox.Option>
                          )}
                          {visible.map((o) => (
                            <Combobox.Option key={o.value} value={o.value}>
                              {o.label}
                            </Combobox.Option>
                          ))}
                          {visible.length === 0 && (
                            <Combobox.Empty>Nothing found</Combobox.Empty>
                          )}
                        </Combobox.Options>
                      </div>
                    </Combobox.Dropdown>
                  </Combobox>
                </>
              );
            }}
          />
        );
      }
      case "triBool": {
        const value = form.watch(field.name as any);
        if (mode === "find") {
          return (
            <SegmentedControl
              fullWidth
              data={[
                { label: `${field.label}: Any`, value: "" },
                { label: "Yes", value: "true" },
                { label: "No", value: "false" },
              ]}
              value={value ?? ""}
              onChange={(v) => form.setValue(field.name as any, v)}
            />
          );
        }
        return (
          <Checkbox label={field.label} {...form.register(field.name as any)} />
          // <SegmentedControl
          //   fullWidth
          //   data={[
          //     { label: "Unset", value: "" },
          //     { label: "Yes", value: "true" },
          //     { label: "No", value: "false" },
          //   ]}
          //   value={value ?? ""}
          //   onChange={(v) => form.setValue(field.name as any, v)}
          // />
        );
      }
      case "numberRange": {
        if (mode === "find") {
          const minField = field.rangeFields?.min || `${field.name}Min`;
          const maxField = field.rangeFields?.max || `${field.name}Max`;
          return (
            <Group gap="xs" align="flex-end" style={{ alignItems: "flex-end" }}>
              <TextInput
                label={field.label + " Min"}
                placeholder="min"
                {...form.register(minField as any)}
                style={{ flex: 1 }}
              />
              <TextInput
                label={field.label + " Max"}
                placeholder="max"
                {...form.register(maxField as any)}
                style={{ flex: 1 }}
              />
            </Group>
          );
        }
        return (
          <Controller
            control={form.control}
            name={field.name as any}
            render={({ field: f }) => {
              const value =
                f.value == null || f.value === "" ? "" : String(f.value);
              return (
                <TextInput
                  {...common}
                  type="number"
                  placeholder={field.placeholder}
                  readOnly={resolvedReadOnly}
                  disabled={resolvedDisabled}
                  rightSection={
                    field.rightSection
                      ? field.rightSection({ form, mode, field, ctx })
                      : undefined
                  }
                  value={value}
                  onChange={(e) => {
                    const raw = e.currentTarget.value;
                    if (raw === "") {
                      f.onChange(null);
                      return;
                    }
                    const n = Number(raw);
                    f.onChange(Number.isFinite(n) ? n : null);
                  }}
                  onBlur={f.onBlur}
                  ref={f.ref as any}
                />
              );
            }}
          />
        );
      }
      default: {
        if (resolvedReadOnly) {
          const value =
            form.watch(field.name as any) ??
            (form.getValues() as any)?.[field.name];
          return (
            <ReadOnlyDisplayInput common={common} value={value} ctx={ctx} />
          );
        }
        return (
          <TextInput
            {...common}
            rightSection={
              field.rightSection
                ? field.rightSection({ form, mode, field, ctx })
                : undefined
            }
            placeholder={
              mode === "find"
                ? field.findPlaceholder ||
                  (field.findOp === "equals" ? "equals..." : "contains...")
                : undefined
            }
            {...form.register(field.name as any)}
            readOnly={resolvedReadOnly}
            disabled={resolvedDisabled}
          />
        );
      }
    }
  };

  const control = renderControl();
  return renderTrailingActionWrapper({ control, form, field, mode, ctx });
}

// JSX wrapper that pulls options via context and maps to renderField
export function RenderField({
  form,
  field,
  mode,
  ctx,
}: {
  form: UseFormReturn<any>;
  field: FieldConfig;
  mode: FieldMode;
  ctx?: RenderContext;
}) {
  const options = useOptions();
  const autoCtx: RenderContext | undefined = React.useMemo(() => {
    if (!options && !ctx) return ctx;
    const map = (arr?: { value: string; label: string }[]) => arr || [];
    return {
      ...ctx,
      options: options || ctx?.options,
      fieldOptions: {
        ...(ctx?.fieldOptions || {}),
        category: ctx?.fieldOptions?.category ?? map(options?.categoryOptions),
        subcategory:
          ctx?.fieldOptions?.subcategory ?? map(options?.subcategoryOptions),
        tax: ctx?.fieldOptions?.tax ?? map(options?.taxCodeOptions),
        productType:
          ctx?.fieldOptions?.productType ?? map(options?.productTypeOptions),
        variantSet:
          ctx?.fieldOptions?.variantSet ?? map(options?.variantSetOptions),
        customer: ctx?.fieldOptions?.customer ?? map(options?.customerOptions),
        customerAll:
          ctx?.fieldOptions?.customerAll ?? map(options?.customerAllOptions),
        consignee:
          ctx?.fieldOptions?.consignee ?? map(options?.consigneeOptions),
        consigneeAll:
          ctx?.fieldOptions?.consigneeAll ?? map(options?.consigneeAllOptions),
        supplier: ctx?.fieldOptions?.supplier ?? map(options?.supplierOptions),
        supplierAll:
          ctx?.fieldOptions?.supplierAll ?? map(options?.supplierAllOptions),
        companyAll:
          ctx?.fieldOptions?.companyAll ?? map(options?.companyAllOptions),
        carrier: ctx?.fieldOptions?.carrier ?? map(options?.carrierOptions),
        jobType: ctx?.fieldOptions?.jobType ?? map(options?.jobTypeOptions),
        jobStatus:
          ctx?.fieldOptions?.jobStatus ?? map(options?.jobStatusOptions),
        location: ctx?.fieldOptions?.location ?? map(options?.locationOptions),
        salePriceGroup:
          ctx?.fieldOptions?.salePriceGroup ??
          map(options?.salePriceGroupOptions),
        costGroup:
          ctx?.fieldOptions?.costGroup ?? map(options?.costGroupOptions),
        productTemplate:
          ctx?.fieldOptions?.productTemplate ??
          map(options?.productTemplateOptions),
      },
    };
  }, [options, ctx]);

  return renderField(form, field, mode, autoCtx);
}

// JSX to render a group of fields with shared props
export function RenderGroup({
  form,
  items,
  fields,
  mode,
  ctx,
  gap = 6,
}: {
  form: UseFormReturn<any>;
  items?: FormItem[];
  fields?: FieldConfig[];
  mode: FieldMode;
  ctx?: RenderContext;
  gap?: number;
}) {
  // Subscribe to all form changes so conditional fields can react to deps
  form.watch();
  const list: FormItem[] = Array.isArray(items)
    ? items
    : Array.isArray(fields)
    ? fields
    : [];
  const isFieldVisible = (f: FieldConfig) => {
    if (f.hiddenInModes && f.hiddenInModes.includes(mode)) return false;
    if (f.visibleWhen && !f.visibleWhen({ form, mode, field: f, ctx }))
      return false;
    if (f.showIf && !f.showIf({ form, mode, field: f, ctx })) return false;
    return true;
  };
  const isFieldConfig = (item: FormItem): item is FieldConfig =>
    typeof (item as any)?.kind !== "string";
  const rows: React.ReactNode[] = [];
  const spacerHeights: Record<NonNullable<SpacerItem["size"]>, number> = {
    xs: 6,
    sm: 12,
    md: 18,
  };
  const renderOverrideDisplay = (
    value: React.ReactNode,
    isOverridden: boolean
  ) => (
    <Group gap="xs" wrap="nowrap" align="center">
      {typeof value === "string" || typeof value === "number" ? (
        <Text size="sm">{value}</Text>
      ) : (
        value
      )}
      <OverrideSourceIcon isOverridden={isOverridden} />
    </Group>
  );
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (isFieldConfig(item)) {
      if (!isFieldVisible(item)) continue;
      const key =
        (item.overrideName as string | undefined) || item.name || item.label;
      if (item.inlineWithNext) {
        let nextIndex = i + 1;
        let nextField: FieldConfig | undefined;
        while (nextIndex < list.length) {
          const candidate = list[nextIndex];
          if (!isFieldConfig(candidate)) break;
          if (isFieldVisible(candidate)) {
            nextField = candidate;
            break;
          }
          nextIndex++;
        }
        if (nextField) {
          const key2 =
            (nextField.overrideName as string | undefined) ||
            nextField.name ||
            nextField.label;
          rows.push(
            <Group key={`${key}+${key2}`} gap="xl" align="flex-start" grow>
              <div style={{ flex: item.flex ?? 1 }}>
                <RenderField form={form} field={item} mode={mode} ctx={ctx} />
              </div>
              <div style={{ flex: nextField.flex ?? 1 }}>
                <RenderField
                  form={form}
                  field={nextField}
                  mode={mode}
                  ctx={ctx}
                />
              </div>
            </Group>
          );
          i = nextIndex; // skip the next, already rendered inline
          continue;
        }
      }
      rows.push(
        <React.Fragment key={key}>
          <RenderField form={form} field={item} mode={mode} ctx={ctx} />
        </React.Fragment>
      );
      continue;
    }
    if (item.kind === "divider") {
      const key = item.key ?? `divider-${i}`;
      rows.push(<Divider key={key} my="xs" style={{ opacity: 0.4 }} />);
      continue;
    }
    if (item.kind === "labelDivider") {
      const key = item.key ?? `label-divider-${i}`;
      rows.push(
        <Divider
          key={key}
          my="xs"
          label={item.label}
          labelPosition="center"
          style={{ opacity: 0.6 }}
        />
      );
      continue;
    }
    if (item.kind === "spacer") {
      const key = item.key ?? `spacer-${i}`;
      const height = item.size ? spacerHeights[item.size] : spacerHeights.sm;
      rows.push(<div key={key} style={{ height, width: "100%" }} />);
      continue;
    }
    if (item.kind === "header") {
      const key = item.key ?? `header-${i}`;
      rows.push(
        <Text
          key={key}
          size={item.size ?? "xs"}
          c={item.tone === "normal" ? undefined : "dimmed"}
          fw={500}
        >
          {item.label}
        </Text>
      );
      continue;
    }
    if (item.kind === "override") {
      const key = item.key ?? `override-${i}`;
      const args = { form, mode, ctx };
      const jobValue = item.getJobValue(args);
      const overrideValue = item.getOverrideValue(args);
      const effectiveValue =
        overrideValue != null ? overrideValue : jobValue ?? null;
      const isOverridden = overrideValue != null;
      const displayRaw = item.formatDisplay
        ? item.formatDisplay(effectiveValue, args)
        : effectiveValue;
      const displayValue = formatEmptyValue(displayRaw, ctx);
      const readOnly =
        mode === "find" || (ctx?.allowEditInCalm === false && mode === "edit");
      if (readOnly) {
        rows.push(
          <DisplayField
            key={key}
            label={item.label}
            value={renderOverrideDisplay(displayValue, isOverridden)}
          />
        );
        continue;
      }
      const input = item.renderInput({
        ...args,
        value: effectiveValue,
        onChange: (next) => item.setOverrideValue(args, next),
        isOverridden,
        onClear: () => item.setOverrideValue(args, null),
      });
      rows.push(
        <Group key={key} gap="xs" wrap="nowrap" align="center">
          <div style={{ flex: 1 }}>{input}</div>
          <OverrideSourceIcon isOverridden={isOverridden} />
        </Group>
      );
      continue;
    }
    if (item.kind === "row") {
      const key = item.key ?? `row-${i}`;
      const [left, right] = item.items;
      const leftVisible = isFieldVisible(left);
      const rightVisible = isFieldVisible(right);
      if (!leftVisible && !rightVisible) continue;
      if (leftVisible && rightVisible) {
        const [leftWeight, rightWeight] = item.weights ?? [1, 1];
        rows.push(
          <Group key={key} gap="xl" align="center" grow>
            <div style={{ flex: leftWeight }}>
              <RenderField form={form} field={left} mode={mode} ctx={ctx} />
            </div>
            <div style={{ flex: rightWeight }}>
              <RenderField form={form} field={right} mode={mode} ctx={ctx} />
            </div>
          </Group>
        );
      } else {
        const field = leftVisible ? left : right;
        rows.push(
          <React.Fragment key={key}>
            <RenderField form={form} field={field} mode={mode} ctx={ctx} />
          </React.Fragment>
        );
      }
    }
  }
  return (
    <Group gap={0} style={{ width: "100%" }}>
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap }}>
          {rows}
        </div>
      </div>
    </Group>
  );
}

export function ViewGroup({
  form,
  items,
  fields,
  mode,
  ctx,
  gap = 6,
}: {
  form: UseFormReturn<any>;
  items?: FormItem[];
  fields?: FieldConfig[];
  mode: FieldMode;
  ctx?: RenderContext;
  gap?: number;
}) {
  form.watch();
  const list: FormItem[] = Array.isArray(items)
    ? items
    : Array.isArray(fields)
    ? fields
    : [];
  const isFieldVisible = (f: FieldConfig) => {
    if (f.hiddenInModes && f.hiddenInModes.includes(mode)) return false;
    if (f.visibleWhen && !f.visibleWhen({ form, mode, field: f, ctx }))
      return false;
    if (f.showIf && !f.showIf({ form, mode, field: f, ctx })) return false;
    return true;
  };
  const isFieldConfig = (item: FormItem): item is FieldConfig =>
    typeof (item as any)?.kind !== "string";
  const spacerHeights: Record<NonNullable<SpacerItem["size"]>, number> = {
    xs: 6,
    sm: 12,
    md: 18,
  };
  const formatDateValue = (value: any) => {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  const resolveSelectLabel = (field: FieldConfig, value: any) => {
    if (value == null || value === "") return "—";
    const options =
      field.options ||
      (field.optionsKey ? ctx?.fieldOptions?.[field.optionsKey] : undefined) ||
      [];
    const match = options.find((opt) => String(opt.value) === String(value));
    return match?.label ?? String(value);
  };
  const renderFieldBlock = (field: FieldConfig) => {
    const widget = field.widget || (field.type === "date" ? "date" : "text");
    let value: React.ReactNode;
    if (widget === "computed" && field.compute) {
      value = field.compute({
        form,
        mode,
        field,
        ctx,
        values: form.getValues(),
      });
    } else {
      const raw =
        form.watch(field.name as any) ??
        (form.getValues() as any)?.[field.name];
      if (widget === "date") value = formatDateValue(raw);
      else if (widget === "select") value = resolveSelectLabel(field, raw);
      else if (raw == null || raw === "") value = "—";
      else value = String(raw);
    }
    if (!field.label) return <div>{value}</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Text size="xs" c="dimmed">
          {field.label}
        </Text>
        {typeof value === "string" || typeof value === "number" ? (
          <Text>{value}</Text>
        ) : (
          value
        )}
      </div>
    );
  };
  const renderOverrideDisplay = (
    label: string,
    value: React.ReactNode,
    isOverridden: boolean
  ) => (
    <DisplayField
      label={label}
      value={
        <Group gap="xs" wrap="nowrap" align="center">
          {typeof value === "string" || typeof value === "number" ? (
            <Text size="sm">{value}</Text>
          ) : (
            value
          )}
          <OverrideSourceIcon isOverridden={isOverridden} />
        </Group>
      }
    />
  );
  const rows: React.ReactNode[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (isFieldConfig(item)) {
      if (!isFieldVisible(item)) continue;
      const key =
        (item.overrideName as string | undefined) || item.name || item.label;
      if (item.inlineWithNext) {
        let nextIndex = i + 1;
        let nextField: FieldConfig | undefined;
        while (nextIndex < list.length) {
          const candidate = list[nextIndex];
          if (!isFieldConfig(candidate)) break;
          if (isFieldVisible(candidate)) {
            nextField = candidate;
            break;
          }
          nextIndex++;
        }
        if (nextField) {
          const key2 =
            (nextField.overrideName as string | undefined) ||
            nextField.name ||
            nextField.label;
          rows.push(
            <Group key={`${key}+${key2}`} gap="xl" align="flex-start" grow>
              <div style={{ flex: item.flex ?? 1 }}>
                {renderFieldBlock(item)}
              </div>
              <div style={{ flex: nextField.flex ?? 1 }}>
                {renderFieldBlock(nextField)}
              </div>
            </Group>
          );
          i = nextIndex;
          continue;
        }
      }
      rows.push(
        <React.Fragment key={key}>{renderFieldBlock(item)}</React.Fragment>
      );
      continue;
    }
    if (item.kind === "divider") {
      const key = item.key ?? `divider-${i}`;
      rows.push(<Divider key={key} my="xs" style={{ opacity: 0.4 }} />);
      continue;
    }
    if (item.kind === "labelDivider") {
      const key = item.key ?? `label-divider-${i}`;
      rows.push(
        <Divider
          key={key}
          my="xs"
          label={item.label}
          labelPosition="center"
          style={{ opacity: 0.6 }}
        />
      );
      continue;
    }
    if (item.kind === "spacer") {
      const key = item.key ?? `spacer-${i}`;
      const height = item.size ? spacerHeights[item.size] : spacerHeights.sm;
      rows.push(<div key={key} style={{ height, width: "100%" }} />);
      continue;
    }
    if (item.kind === "header") {
      const key = item.key ?? `header-${i}`;
      rows.push(
        <Text
          key={key}
          size={item.size ?? "xs"}
          c={item.tone === "normal" ? undefined : "dimmed"}
          fw={500}
        >
          {item.label}
        </Text>
      );
      continue;
    }
    if (item.kind === "override") {
      const key = item.key ?? `override-${i}`;
      const args = { form, mode, ctx };
      const jobValue = item.getJobValue(args);
      const overrideValue = item.getOverrideValue(args);
      const effectiveValue =
        overrideValue != null ? overrideValue : jobValue ?? null;
      const isOverridden = overrideValue != null;
      const displayRaw = item.formatDisplay
        ? item.formatDisplay(effectiveValue, args)
        : effectiveValue;
      const displayValue = formatEmptyValue(displayRaw, ctx);
      rows.push(
        <React.Fragment key={key}>
          {renderOverrideDisplay(item.label, displayValue, isOverridden)}
        </React.Fragment>
      );
      continue;
    }
    if (item.kind === "row") {
      const key = item.key ?? `row-${i}`;
      const [left, right] = item.items;
      const leftVisible = isFieldVisible(left);
      const rightVisible = isFieldVisible(right);
      if (!leftVisible && !rightVisible) continue;
      if (leftVisible && rightVisible) {
        const [leftWeight, rightWeight] = item.weights ?? [1, 1];
        rows.push(
          <Group key={key} gap="xl" align="flex-start" grow>
            <div style={{ flex: leftWeight }}>{renderFieldBlock(left)}</div>
            <div style={{ flex: rightWeight }}>{renderFieldBlock(right)}</div>
          </Group>
        );
      } else {
        const field = leftVisible ? left : right;
        rows.push(
          <React.Fragment key={key}>{renderFieldBlock(field)}</React.Fragment>
        );
      }
    }
  }
  return (
    <Group gap={0} style={{ width: "100%" }}>
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap }}>
          {rows}
        </div>
      </div>
    </Group>
  );
}

export function extractFindValues(formData: Record<string, any>) {
  // Helper to strip empty triBool and range fields later if needed.
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(formData)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    cleaned[k] = v;
  }
  return cleaned;
}
