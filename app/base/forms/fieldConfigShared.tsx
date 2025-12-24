import React from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { DatePickerInput } from "@mantine/dates";
import {
  TextInput,
  Select,
  Group,
  SegmentedControl,
  Checkbox,
  Indicator,
  Input,
  CloseButton,
  Combobox,
  useCombobox,
} from "@mantine/core";
import { useOptions } from "../options/OptionsContext";
import { IconEditCircle } from "@tabler/icons-react";

export type FieldMode = "edit" | "find" | "create";

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
};

export type RenderContext = {
  fieldOptions?: Record<string, { value: string; label: string }[]>;
  options?: any; // full OptionsData if available
  openCustomerModal?: () => void;
  [key: string]: any;
};

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
  if (field.showIf && !field.showIf({ form, mode, field, ctx })) {
    return null;
  }
  if (field.render) return field.render({ form, mode, field, ctx });
  const widget = field.widget || (field.type === "date" ? "date" : "text");
  const common: any = { label: field.label, mod: "data-autosize" };
  const requiredState = (ctx as any)?.requiredStates?.[field.name];
  if (requiredState?.state === "error") {
    common.error = requiredState.message ?? "Required";
  } else if (requiredState?.state === "warn") {
    common.description = requiredState.message ?? "Required";
    common.styles = {
      input: {
        borderColor: "var(--mantine-color-yellow-6)",
      },
    };
  }
  const dynamicReadOnly = field.readOnlyIf
    ? field.readOnlyIf({ form, mode, field, ctx })
    : false;
  const resolvedReadOnly =
    dynamicReadOnly ||
    (mode === "edit" && (field.editable === false || field.readOnly));

  const getSelectOptions = () => {
    // Always return an object with primary/fallback arrays
    if (field.options && field.options.length) {
      return {
        primary: field.options,
        fallback: [] as { value: string; label: string }[],
      };
    }
    const primary =
      field.optionsKey && ctx?.fieldOptions?.[field.optionsKey]
        ? ctx.fieldOptions[field.optionsKey]
        : [];
    const fallback =
      field.allOptionsKey && ctx?.fieldOptions?.[field.allOptionsKey]
        ? ctx.fieldOptions[field.allOptionsKey]
        : [];
    return { primary, fallback } as {
      primary: { value: string; label: string }[];
      fallback: { value: string; label: string }[];
    };
  };

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
      return (
        <TextInput {...common} readOnly value={v != null ? String(v) : ""} />
      );
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
              />
            );
          }}
        />
      );
    }
    case "select": {
      const { primary, fallback } = getSelectOptions() as any;
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
            const allForLookup = React.useMemo(
              () => [...(primary || []), ...(fallback || [])],
              [primary, fallback]
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

            const setFormValue = (v: string | null) => {
              const out = coerceToNumber
                ? v != null && v !== ""
                  ? Number(v)
                  : null
                : v ?? null;
              f.onChange(out);
            };

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
                  onOptionSubmit={(val) => {
                    if (val === "__EMPTY__") {
                      setFormValue(mode === "find" ? "" : null);
                      setSearch("");
                    } else {
                      setFormValue(val);
                      const picked = allForLookup.find((o) => o.value === val);
                      setSearch(picked?.label || "");
                    }
                    combobox.closeDropdown();
                  }}
                >
                  <Combobox.Target>
                    <TextInput
                      {...common}
                      value={combobox.dropdownOpened ? search : selectedLabel}
                      onMouseDown={() => {
                        clickedByMouseRef.current = true;
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
                        event.currentTarget.select();
                      }}
                      onChange={(event) => {
                        setSearch(event.currentTarget.value);
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
        <TextInput
          {...common}
          type="number"
          placeholder={field.placeholder}
          readOnly={resolvedReadOnly}
          rightSection={
            field.rightSection
              ? field.rightSection({ form, mode, field, ctx })
              : undefined
          }
          value={
            (form.watch(field.name as any) ??
              (form.getValues() as any)?.[field.name] ??
              "") as any
          }
          onChange={(e) => form.setValue(field.name as any, e.target.value)}
        />
      );
    }
    default: {
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
        />
      );
    }
  }
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
      category:
        ctx?.fieldOptions?.category ?? map(options?.categoryOptions),
      subcategory:
        ctx?.fieldOptions?.subcategory ?? map(options?.subcategoryOptions),
      tax: ctx?.fieldOptions?.tax ?? map(options?.taxCodeOptions),
      productType:
        ctx?.fieldOptions?.productType ?? map(options?.productTypeOptions),
      variantSet:
        ctx?.fieldOptions?.variantSet ?? map(options?.variantSetOptions),
      customer:
        ctx?.fieldOptions?.customer ?? map(options?.customerOptions),
      customerAll:
        ctx?.fieldOptions?.customerAll ?? map(options?.customerAllOptions),
      consignee:
        ctx?.fieldOptions?.consignee ?? map(options?.consigneeOptions),
      consigneeAll:
        ctx?.fieldOptions?.consigneeAll ?? map(options?.consigneeAllOptions),
      supplier:
        ctx?.fieldOptions?.supplier ?? map(options?.supplierOptions),
      supplierAll:
        ctx?.fieldOptions?.supplierAll ?? map(options?.supplierAllOptions),
      companyAll:
        ctx?.fieldOptions?.companyAll ?? map(options?.companyAllOptions),
      carrier:
        ctx?.fieldOptions?.carrier ?? map(options?.carrierOptions),
      jobType:
        ctx?.fieldOptions?.jobType ?? map(options?.jobTypeOptions),
      jobStatus:
        ctx?.fieldOptions?.jobStatus ?? map(options?.jobStatusOptions),
      location:
        ctx?.fieldOptions?.location ?? map(options?.locationOptions),
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
  fields,
  mode,
  ctx,
  gap = 6,
}: {
  form: UseFormReturn<any>;
  fields: FieldConfig[];
  mode: FieldMode;
  ctx?: RenderContext;
  gap?: number;
}) {
  // Subscribe to all form changes so conditional fields can react to deps
  form.watch();
  const list: FieldConfig[] = Array.isArray(fields) ? fields : [];
  // Filter out fields hidden for this mode to avoid duplicate keys from hidden siblings
  const visible = list.filter(
    (f) => !(f.hiddenInModes && f.hiddenInModes.includes(mode))
  );
  const rows: React.ReactNode[] = [];
  for (let i = 0; i < visible.length; i++) {
    const field = visible[i];
    const key =
      (field.overrideName as string | undefined) || field.name || field.label;
    const next = visible[i + 1];
    if (field.inlineWithNext && next) {
      const key2 =
        (next.overrideName as string | undefined) || next.name || next.label;
      rows.push(
        <Group key={`${key}+${key2}`} gap="xl" align="flex-end" grow>
          <div style={{ flex: field.flex ?? 1 }}>
            <RenderField form={form} field={field} mode={mode} ctx={ctx} />
          </div>
          <div style={{ flex: next.flex ?? 1 }}>
            <RenderField form={form} field={next} mode={mode} ctx={ctx} />
          </div>
        </Group>
      );
      i++; // skip the next, already rendered inline
    } else {
      rows.push(
        <React.Fragment key={key}>
          <RenderField form={form} field={field} mode={mode} ctx={ctx} />
        </React.Fragment>
      );
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
