import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

export type FormStateDebugData = {
  summary: Record<string, any>;
  diffKeys: string[];
  extraValueKeys: Array<{ key: string; value?: any; defaultValue?: any }>;
  missingValueKeys: Array<{ key: string; value?: any; defaultValue?: any }>;
  extraInValues: Array<{ key: string; value?: any; defaultValue?: any }>;
  missingInValues: Array<{ key: string; value?: any; defaultValue?: any }>;
  values: any;
  builderDefaults: any;
  rhfDefaults: any;
  rhfValues: any;
  internalDiagnostics: Record<string, any>;
};

export function FormStateDebugPanel(props: {
  formId?: string;
  getDefaultValues?: () => any;
  collapseLong?: boolean;
  dirtySources?: Record<string, any>;
  saveSignals?: Record<string, any>;
  formInstances?: Record<string, any>;
  assertions?: Record<string, any>;
}) {
  const { formState, getValues, control } = useFormContext();
  const builderDefaults = props.getDefaultValues?.() ?? null;
  const rhfDefaults = (control as any)?._defaultValues ?? null;
  const rhfValues = (control as any)?._formValues ?? null;
  const values = getValues();

  const data = useMemo(
    () =>
      buildFormStateDebugData({
        formId: props.formId,
        formState,
        values,
        builderDefaults,
        rhfDefaults,
        rhfValues,
        control,
      }),
    [props.formId, formState, values, builderDefaults, rhfDefaults, rhfValues, control]
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {props.dirtySources ? (
        <Section
          title="Dirty sources"
          json={props.dirtySources}
          collapseLong={props.collapseLong}
        />
      ) : null}
      {props.saveSignals ? (
        <Section
          title="Save signals"
          json={props.saveSignals}
          collapseLong={props.collapseLong}
        />
      ) : null}
      {props.formInstances ? (
        <Section
          title="Form instances"
          json={props.formInstances}
          collapseLong={props.collapseLong}
        />
      ) : null}
      {props.assertions ? (
        <Section
          title="Assertions"
          json={props.assertions}
          collapseLong={props.collapseLong}
        />
      ) : null}
      <Section
        title="Summary"
        json={data.summary}
        collapseLong={props.collapseLong}
      />
      <Section
        title="Diff keys (values != defaults)"
        json={data.diffKeys}
        collapseLong={props.collapseLong}
      />
      <Section
        title="Extra value keys (value without default)"
        json={data.extraValueKeys}
        collapseLong={props.collapseLong}
      />
      <Section
        title="Missing value keys (default without value)"
        json={data.missingValueKeys}
        collapseLong={props.collapseLong}
      />
      <Section
        title="Extra in values (current vs RHF defaults)"
        json={data.extraInValues}
        collapseLong={props.collapseLong}
      />
      <Section
        title="Missing in values (RHF defaults vs current)"
        json={data.missingInValues}
        collapseLong={props.collapseLong}
      />
      <Section
        title="Current values"
        json={data.values}
        collapseLong={props.collapseLong}
      />
      <Section
        title="Builder defaults"
        json={data.builderDefaults}
        collapseLong={props.collapseLong}
      />
      <Section
        title="RHF defaults"
        json={data.rhfDefaults}
        collapseLong={props.collapseLong}
      />
      <Section
        title="RHF values"
        json={data.rhfValues}
        collapseLong={props.collapseLong}
      />
      <Section
        title="RHF internal diagnostics"
        json={data.internalDiagnostics}
        collapseLong={props.collapseLong}
      />
    </div>
  );
}

export function buildFormStateDebugData(args: {
  formId?: string;
  formState: {
    isDirty: boolean;
    dirtyFields: Record<string, any>;
    touchedFields: Record<string, any>;
    isSubmitting: boolean;
    submitCount: number;
  };
  values: any;
  builderDefaults: any;
  rhfDefaults: any;
  rhfValues: any;
  control?: any;
}): FormStateDebugData {
  const summary = {
    formId: args.formId ?? null,
    isDirty: args.formState.isDirty,
    dirtyFields: args.formState.dirtyFields,
    touchedFields: args.formState.touchedFields,
    isSubmitting: args.formState.isSubmitting,
    submitCount: args.formState.submitCount,
  };

  const diffKeys = computeDiffKeys(args.values, args.builderDefaults);
  const keyDiffs = computeKeyDiffs(args.values, args.builderDefaults);
  const rhfKeyDiffs = computeKeyDiffs(args.values, args.rhfDefaults);
  const internalDiagnostics = buildInternalDiagnostics(args.control);

  return {
    summary,
    diffKeys,
    extraValueKeys: keyDiffs.extraValueKeys,
    missingValueKeys: keyDiffs.missingValueKeys,
    extraInValues: rhfKeyDiffs.extraValueKeys,
    missingInValues: rhfKeyDiffs.missingValueKeys,
    values: args.values,
    builderDefaults: args.builderDefaults,
    rhfDefaults: args.rhfDefaults,
    rhfValues: args.rhfValues,
    internalDiagnostics,
  };
}

export function buildFormStateDebugText(
  data: FormStateDebugData,
  collapseLong?: boolean,
  extras?: {
    dirtySources?: Record<string, any>;
    saveSignals?: Record<string, any>;
    formInstances?: Record<string, any>;
    assertions?: Record<string, any>;
  }
) {
  const blocks: Array<[string, any]> = [];
  if (extras?.dirtySources) blocks.push(["Dirty sources", extras.dirtySources]);
  if (extras?.saveSignals) blocks.push(["Save signals", extras.saveSignals]);
  if (extras?.formInstances) blocks.push(["Form instances", extras.formInstances]);
  if (extras?.assertions) blocks.push(["Assertions", extras.assertions]);
  blocks.push(["Summary", data.summary]);
  blocks.push(["Diff keys (values != defaults)", data.diffKeys]);
  blocks.push(["Extra value keys (value without default)", data.extraValueKeys]);
  blocks.push([
    "Missing value keys (default without value)",
    data.missingValueKeys,
  ]);
  blocks.push(["Extra in values (current vs RHF defaults)", data.extraInValues]);
  blocks.push([
    "Missing in values (RHF defaults vs current)",
    data.missingInValues,
  ]);
  blocks.push(["Current values", data.values]);
  blocks.push(["Builder defaults", data.builderDefaults]);
  blocks.push(["RHF defaults", data.rhfDefaults]);
  blocks.push(["RHF values", data.rhfValues]);
  blocks.push(["RHF internal diagnostics", data.internalDiagnostics]);
  return blocks
    .map(([title, value]) => {
      return `## ${title}\n${safeStringify(value, collapseLong)}`;
    })
    .join("\n\n");
}

function Section({
  title,
  json,
  collapseLong,
}: {
  title: string;
  json: any;
  collapseLong?: boolean;
}) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <pre style={{ maxHeight: 260, overflow: "auto", fontSize: 12 }}>
        {safeStringify(json, collapseLong)}
      </pre>
    </div>
  );
}

function computeDiffKeys(values: any, defaultValues: any) {
  try {
    if (!defaultValues) return ["(no default values)"];
    const keys = new Set<string>();
    const walk = (a: any, b: any, path = "") => {
      if (a === b) return;
      const aObj = a && typeof a === "object";
      const bObj = b && typeof b === "object";
      if (!aObj || !bObj) {
        keys.add(path || "(root)");
        return;
      }
      const all = new Set([
        ...Object.keys(a ?? {}),
        ...Object.keys(b ?? {}),
      ]);
      for (const k of all) {
        const p = path ? `${path}.${k}` : k;
        walk(a?.[k], b?.[k], p);
      }
    };
    walk(values, defaultValues);
    return Array.from(keys).slice(0, 200);
  } catch {
    return ["(diff failed)"];
  }
}

function computeKeyDiffs(values: any, defaultValues: any) {
  try {
    const valueKeys = values ? Object.keys(values) : [];
    const defaultKeys = defaultValues ? Object.keys(defaultValues) : [];
    const defaultKeySet = new Set(defaultKeys);
    const valueKeySet = new Set(valueKeys);
    const extraValueKeys = valueKeys
      .filter((key) => !defaultKeySet.has(key))
      .map((key) => ({
        key,
        value: values?.[key],
        defaultValue: defaultValues?.[key],
      }));
    const missingValueKeys = defaultKeys
      .filter((key) => !valueKeySet.has(key))
      .map((key) => ({
        key,
        value: values?.[key],
        defaultValue: defaultValues?.[key],
      }));
    return { extraValueKeys, missingValueKeys };
  } catch {
    return {
      extraValueKeys: [{ key: "(diff failed)" }],
      missingValueKeys: [{ key: "(diff failed)" }],
    };
  }
}

function buildInternalDiagnostics(control: any) {
  try {
    const names = control?._names?.mount;
    const mounted = names && typeof names.forEach === "function";
    const list = mounted ? Array.from(names) : [];
    const defaultValuesKeys = control?._defaultValues
      ? Object.keys(control._defaultValues)
      : [];
    const formValuesKeys = control?._formValues
      ? Object.keys(control._formValues)
      : [];
    return {
      defaultValuesPresent: Boolean(control?._defaultValues),
      mountedCount: list.length,
      mountedFields: list.slice(0, 50),
      internalIsDirty:
        typeof control?._formState?.isDirty === "boolean"
          ? control._formState.isDirty
          : null,
      defaultValuesKeysCount: defaultValuesKeys.length,
      formValuesKeysCount: formValuesKeys.length,
    };
  } catch (err: any) {
    return { error: err?.message || "internal diagnostics failed" };
  }
}

function safeStringify(value: any, collapseLong?: boolean) {
  try {
    const text = JSON.stringify(value, null, 2);
    if (!collapseLong) return text;
    if (text.length <= 20000) return text;
    return `${text.slice(0, 20000)}\n…(truncated)`;
  } catch (err: any) {
    return String(err?.message ?? err);
  }
}
