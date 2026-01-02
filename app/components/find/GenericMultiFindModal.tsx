import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  Modal,
  Group,
  Button,
  ActionIcon,
  Tooltip,
  Stack,
  ScrollArea,
  Divider,
  Text,
} from "@mantine/core";
import { HotkeyAwareModal } from "../../base/hotkeys/HotkeyAwareModal";
import { useForm, type FieldValues } from "react-hook-form";
import {
  IconPlus,
  IconCopy,
  IconTrash,
  IconBan,
  IconSwitchHorizontal,
} from "@tabler/icons-react";
import {
  encodeRequests,
  type MultiFindState,
  type MultiFindRequest,
} from "../../base/find/multiFind";
import type {
  GenericFindModalProps,
  MultiRequestAdapter,
  FindFieldConfig,
} from "./GenericFindTypes";

export interface GenericMultiFindModalProps<TValues extends FieldValues>
  extends GenericFindModalProps<TValues> {
  adapter: MultiRequestAdapter<TValues>;
  FormComponent: React.ComponentType<any>; // expects props { mode, form }
  initialMode?: "simple" | "advanced";
  initialMulti?: MultiFindState | null;
  headerActions?: React.ReactNode;
}

export function GenericMultiFindModal<TValues extends FieldValues>({
  opened,
  onClose,
  onSearch,
  initialValues,
  adapter,
  FormComponent,
  initialMode,
  initialMulti,
  headerActions,
}: GenericMultiFindModalProps<TValues>) {
  const { buildDefaults, allFields, title } = adapter;
  const [mode, setMode] = useState<"simple" | "advanced">(
    initialMode || "simple"
  );
  // Build field <-> param maps once per render
  const fields = useMemo(() => allFields(), [allFields]);
  const fieldToParam = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fields) {
      const paramKey = (f as any).paramName || f.name;
      m.set(f.name, paramKey);
    }
    return m;
  }, [fields]);
  const paramToField = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fields) {
      const paramKey = (f as any).paramName || f.name;
      m.set(paramKey, f.name);
    }
    return m;
  }, [fields]);

  // Normalize incoming initial values: allow passing server param keys
  const coerceInitialValues = (vals: any) => {
    if (!vals) return vals;
    const out: any = { ...vals };
    for (const f of fields) {
      const paramKey = (f as any).paramName;
      if (
        paramKey &&
        out[f.name] === undefined &&
        out[paramKey] !== undefined
      ) {
        out[f.name] = out[paramKey];
      }
    }
    return out;
  };

  // Robust out-bound serialization for select/multiselect/object values
  const serializeValue = (v: any): string | null => {
    if (v === undefined || v === null || v === "" || v === "any") return null;
    if (Array.isArray(v)) {
      // Support arrays of primitives or objects with value/id
      const vals = v
        .map((it) => {
          if (it == null) return null;
          if (typeof it === "object")
            return (it as any).value ?? (it as any).id ?? null;
          return it;
        })
        .filter((x) => x !== null)
        .map(String);
      return vals.length ? vals.join(",") : null;
    }
    if (typeof v === "object") {
      const primitive = (v as any).value ?? (v as any).id;
      return primitive != null ? String(primitive) : null;
    }
    return String(v);
  };

  // Helper for number range serialization
  const setIfPresent = (params: URLSearchParams, key: string, v: any) => {
    const s = serializeValue(v);
    if (s !== null) params.set(key, s);
  };

  const form = useForm<TValues>({
    defaultValues: {
      ...buildDefaults(),
      ...(initialValues ? coerceInitialValues(initialValues) : {}),
    } as any,
  });
  const focusWrapRef = useRef<HTMLDivElement | null>(null);
  const makeRequest = (): MultiFindRequest => ({
    id: crypto.randomUUID(),
    criteria: {},
    omit: false,
  });
  const [multi, setMulti] = useState<MultiFindState>({
    requests: [makeRequest()],
  });
  const [activeReqId, setActiveReqId] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    form.reset({
      ...buildDefaults(),
      ...(initialValues ? coerceInitialValues(initialValues) : {}),
    } as any);
    const nextMode = initialMode || "simple";
    setMode(nextMode);
    if (initialMulti && initialMulti.requests?.length) {
      setMulti(initialMulti);
      setActiveReqId(initialMulti.requests[0]?.id || null);
    } else {
      setMulti({ requests: [makeRequest()] });
      setActiveReqId(null);
    }
  }, [opened, initialValues, initialMode, initialMulti]);

  // Focus handling: robust multi-frame retry until root + first focusable field appear (handles Mantine portal timing & StrictMode double commit)
  const DEBUG_FOCUS =
    (typeof window !== "undefined" && (window as any).__FIND_FOCUS_DEBUG__) ||
    false;
  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    let attempt = 0;
    const MAX_ATTEMPTS = 30; // allow a little longer; still < 500ms worst case
    const STABLE_FRAMES_REQUIRED = 2; // need target to remain active this many verification frames
    let stableFrames = 0;
    let userInteracted = false;

    const markInteraction = () => {
      userInteracted = true;
      if (DEBUG_FOCUS)
        console.log(
          "[FindModal] user interaction detected; stopping forced focus"
        );
    };
    // Guard: if user clicks or types we stop retaking focus
    const rootEl = focusWrapRef.current;
    rootEl?.addEventListener("pointerdown", markInteraction, { once: true });
    window.addEventListener("keydown", markInteraction, { once: true });

    const pickTarget = (root: HTMLElement): HTMLElement | null => {
      const selector =
        '[data-autofocus], input:not([type="hidden"]):not([disabled]):not([aria-hidden="true"]), select:not([disabled]), textarea:not([disabled])';
      const candidates = Array.from(
        root.querySelectorAll(selector)
      ) as HTMLElement[];
      if (DEBUG_FOCUS && attempt === 1)
        console.log(
          "[FindModal] focus candidates (first scan)",
          candidates.map((c) => ({
            tag: c.tagName,
            name: (c as any).name,
            id: c.id,
            disabled: (c as any).disabled,
          }))
        );
      return candidates[0] || null;
    };

    const verifyAndMaybeRetry = (target: HTMLElement | null) => {
      if (cancelled || userInteracted) return;
      if (!target) return; // nothing to stabilize
      const active = document.activeElement;
      if (active === target) {
        stableFrames += 1;
        if (stableFrames >= STABLE_FRAMES_REQUIRED) {
          if (DEBUG_FOCUS) console.log("[FindModal] focus stabilized");
          return; // done
        }
      } else {
        stableFrames = 0; // lost focus; will try again
      }
      if (attempt < MAX_ATTEMPTS) requestAnimationFrame(tryFocus);
      else if (DEBUG_FOCUS)
        console.log(
          "[FindModal] giving up after max attempts (stability phase)"
        );
    };

    const tryFocus = () => {
      if (cancelled || userInteracted) return;
      attempt += 1;
      const root = focusWrapRef.current;
      if (!root) {
        if (DEBUG_FOCUS && attempt === 1)
          console.log("[FindModal] focus: root not mounted yet");
      } else {
        const target = pickTarget(root);
        if (target) {
          if (document.activeElement === target) {
            // Already focused; just verify stability
            verifyAndMaybeRetry(target);
            return;
          }
          try {
            target.focus({ preventScroll: true });
            if (DEBUG_FOCUS)
              console.log(
                `[FindModal] focused attempt ${attempt}`,
                target.tagName,
                (target as any).name || target.id
              );
          } catch (e) {
            if (DEBUG_FOCUS) console.warn("[FindModal] focus error", e);
          }
          // Defer verification a frame
          requestAnimationFrame(() => verifyAndMaybeRetry(target));
          return;
        } else if (DEBUG_FOCUS && (attempt === 1 || attempt === MAX_ATTEMPTS)) {
          console.log(
            `[FindModal] no focusable element yet (attempt ${attempt})`
          );
        }
      }
      if (attempt < MAX_ATTEMPTS) requestAnimationFrame(tryFocus);
      else if (DEBUG_FOCUS)
        console.log("[FindModal] giving up (no target) after max attempts");
    };

    // Start after one frame to let Mantine portal & focus trap initialize
    const id = requestAnimationFrame(tryFocus);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
      rootEl?.removeEventListener("pointerdown", markInteraction);
      window.removeEventListener("keydown", markInteraction);
    };
  }, [opened, mode]);

  // On entering advanced mode, copy current simple criteria into first request (use paramName)
  useEffect(() => {
    if (mode === "advanced") {
      setMulti((m) => {
        const vals: any = form.getValues();
        const first = { ...m.requests[0] };
        if (Object.keys(first.criteria).length === 0) {
          const crit: Record<string, any> = {};
          for (const f of fields) {
            if (!f.findOp) continue;
            if (f.widget === "numberRange") {
              const minName = f.rangeFields?.min || `${f.name}Min`;
              const maxName = f.rangeFields?.max || `${f.name}Max`;
              const minKey = fieldToParam.get(minName) || minName;
              const maxKey = fieldToParam.get(maxName) || maxName;
              if (
                vals[minName] !== undefined &&
                vals[minName] !== null &&
                vals[minName] !== ""
              )
                crit[minKey] = vals[minName];
              if (
                vals[maxName] !== undefined &&
                vals[maxName] !== null &&
                vals[maxName] !== ""
              )
                crit[maxKey] = vals[maxName];
              continue;
            }
            const key = fieldToParam.get(f.name) || f.name;
            const s = serializeValue((vals as any)[f.name]);
            if (s !== null) crit[key] = s;
          }
          first.criteria = crit;
          const next = [...m.requests];
          next[0] = first;
          return { requests: next };
        }
        return m;
      });
      // load first request into form using param->field mapping
      const first = multi.requests[0];
      const base: any = buildDefaults();
      for (const [k, v] of Object.entries(first.criteria)) {
        const fieldName = paramToField.get(k) || k;
        base[fieldName] = v as any;
      }
      form.reset(base);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const syncActive = () => {
    if (mode !== "advanced") return;
    const vals: any = form.getValues();
    setMulti((m) => {
      const idx = m.requests.findIndex(
        (r) => r.id === (activeReqId || m.requests[0].id)
      );
      if (idx === -1) return m;
      const req = { ...m.requests[idx] };
      const crit: Record<string, any> = {};
      for (const f of fields) {
        if (!f.findOp) continue;
        if (f.widget === "numberRange") {
          const minName = f.rangeFields?.min || `${f.name}Min`;
          const maxName = f.rangeFields?.max || `${f.name}Max`;
          const minKey = fieldToParam.get(minName) || minName;
          const maxKey = fieldToParam.get(maxName) || maxName;
          const minVal = vals[minName];
          const maxVal = vals[maxName];
          if (minVal !== undefined && minVal !== "" && minVal !== null)
            crit[minKey] = minVal;
          if (maxVal !== undefined && maxVal !== "" && maxVal !== null)
            crit[maxKey] = maxVal;
          continue;
        }
        const key = fieldToParam.get(f.name) || f.name;
        const s = serializeValue(vals[f.name]);
        if (s !== null) crit[key] = s;
      }
      req.criteria = crit;
      const next = [...m.requests];
      next[idx] = req;
      return { requests: next };
    });
  };

  const buildParamsFromValues = (vals: any) => {
    const params = new URLSearchParams();
    for (const f of fields) {
      console.log("!! buildParamsFromValues field", f, f.findOp);
      if (!f.findOp) continue;
      if (f.widget === "numberRange") {
        const minName = f.rangeFields?.min || `${f.name}Min`;
        const maxName = f.rangeFields?.max || `${f.name}Max`;
        const minKey = fieldToParam.get(minName) || minName;
        const maxKey = fieldToParam.get(maxName) || maxName;
        setIfPresent(params, minKey, vals[minName]);
        setIfPresent(params, maxKey, vals[maxName]);
        continue;
      }
      const key = fieldToParam.get(f.name) || f.name;
      const s = serializeValue(vals[f.name]);
      if (s !== null) params.set(key, s);
    }
    console.log("!! buildParamsFromValues", vals, params.toString());
    return params;
  };

  const submitSimple = () => {
    const values = form.getValues();
    const params = buildParamsFromValues(values);
    onSearch(params.toString());
  };

  const submitAdvanced = () => {
    const values = form.getValues();
    setMulti((m) => {
      const idx = m.requests.findIndex(
        (r) => r.id === (activeReqId || m.requests[0].id)
      );
      if (idx >= 0) {
        const req = { ...m.requests[idx] };
        const vals: any = values;
        const crit: Record<string, any> = {};
        for (const f of fields) {
          if (!f.findOp) continue;
          if (f.widget === "numberRange") {
            const minName = f.rangeFields?.min || `${f.name}Min`;
            const maxName = f.rangeFields?.max || `${f.name}Max`;
            const minKey = fieldToParam.get(minName) || minName;
            const maxKey = fieldToParam.get(maxName) || maxName;
            if (
              vals[minName] !== undefined &&
              vals[minName] !== null &&
              vals[minName] !== ""
            )
              crit[minKey] = vals[minName];
            if (
              vals[maxName] !== undefined &&
              vals[maxName] !== null &&
              vals[maxName] !== ""
            )
              crit[maxKey] = vals[maxName];
            continue;
          }
          const key = fieldToParam.get(f.name) || f.name;
          const s = serializeValue(vals[f.name]);
          if (s !== null) crit[key] = s;
        }
        req.criteria = crit;
        const next = [...m.requests];
        next[idx] = req;
        const params = new URLSearchParams();
        params.set("findReqs", encodeRequests({ requests: next }));
        onSearch(params.toString());
        return { requests: next };
      }
      const params = new URLSearchParams();
      params.set("findReqs", encodeRequests(m));
      onSearch(params.toString());
      return m;
    });
  };

  const addRequest = () => {
    setMulti((m) => {
      const next = [...m.requests, makeRequest()];
      setActiveReqId(next[next.length - 1].id);
      form.reset(buildDefaults() as any);
      return { requests: next };
    });
  };
  const duplicateRequest = (id: string) => {
    setMulti((m) => {
      const idx = m.requests.findIndex((r) => r.id === id);
      if (idx === -1) return m;
      const copy: MultiFindRequest = {
        id: crypto.randomUUID(),
        omit: m.requests[idx].omit,
        criteria: { ...m.requests[idx].criteria },
      };
      const next = [
        ...m.requests.slice(0, idx + 1),
        copy,
        ...m.requests.slice(idx + 1),
      ];
      setActiveReqId(copy.id);
      return { requests: next };
    });
  };
  const removeRequest = (id: string) => {
    setMulti((m) => {
      if (m.requests.length === 1) return m;
      const next = m.requests.filter((r) => r.id !== id);
      if (!next.find((r) => r.id === activeReqId)) setActiveReqId(next[0].id);
      return { requests: next };
    });
  };
  const toggleOmit = (id: string) => {
    setMulti((m) => ({
      requests: m.requests.map((r) =>
        r.id === id ? { ...r, omit: !r.omit } : r
      ),
    }));
  };

  const activeReq =
    multi.requests.find((r) => r.id === activeReqId) || multi.requests[0];

  const summarizeCriteria = (crit: Record<string, any>) => {
    const entries = Object.entries(crit);
    if (!entries.length) return "(empty)";
    return (
      entries
        .slice(0, 3)
        .map(([k, v]) => {
          let val = String(v);
          if (val.length > 12) val = val.slice(0, 12) + "...";
          return `${k}=${val}`;
        })
        .join(", ") + (entries.length > 3 ? " ..." : "")
    );
  };

  const renderAdvancedTabs = () => (
    <Stack gap="sm">
      <ScrollArea h={48} offsetScrollbars>
        <Group gap="xs">
          {multi.requests.map((r, i) => (
            <Group
              key={r.id}
              gap={4}
              style={{
                border:
                  r.id === activeReq.id
                    ? "1px solid var(--mantine-color-blue-5)"
                    : "1px solid var(--mantine-color-gray-4)",
                borderRadius: 4,
                padding: "2px 6px",
                background: "#1a1b1e",
              }}
            >
              <Button
                size="xs"
                variant="subtle"
                onClick={() => setActiveReqId(r.id)}
              >
                {i + 1}
              </Button>
              {r.omit && (
                <Text c="red" fz={10} fw={600}>
                  OMIT
                </Text>
              )}
              <Text fz={10} c="dimmed">
                {summarizeCriteria(r.criteria)}
              </Text>
              <ActionIcon
                size="xs"
                variant="subtle"
                onClick={() => duplicateRequest(r.id)}
                aria-label="Duplicate"
              >
                <IconCopy size={14} />
              </ActionIcon>
              <ActionIcon
                size="xs"
                variant={r.omit ? "filled" : "subtle"}
                color={r.omit ? "red" : undefined}
                onClick={() => toggleOmit(r.id)}
                aria-label="Toggle omit"
              >
                <IconBan size={14} />
              </ActionIcon>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => removeRequest(r.id)}
                aria-label="Remove"
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
          <Tooltip label="Add request">
            <ActionIcon variant="light" size="sm" onClick={addRequest}>
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </ScrollArea>
      <Divider my={4} />
      <div onBlur={syncActive}>
        <FormComponent mode="find" form={form as any} />
      </div>
    </Stack>
  );

  // Native form submit handler
  const onSubmit: React.FormEventHandler = (e) => {
    e.preventDefault();
    if (mode === "simple") submitSimple();
    else submitAdvanced();
  };

  const titleNode = headerActions ? (
    <Group justify="space-between" align="center" wrap="nowrap">
      <Text fw={600}>{title}</Text>
      {headerActions}
    </Group>
  ) : (
    title
  );

  return (
    <HotkeyAwareModal
      opened={opened}
      onClose={onClose}
      title={titleNode}
      size="xxl"
      centered
    >
      <form
        ref={focusWrapRef as any}
        data-focus-scope
        onSubmit={onSubmit}
        noValidate
      >
        {mode === "simple" ? (
          <div onBlur={syncActive}>
            <div style={{ width: "100%" }}>
              <FormComponent mode="find" form={form as any} layout="stack" />
            </div>
          </div>
        ) : (
          renderAdvancedTabs()
        )}
        <Group justify="space-between" mt="md" align="flex-start">
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconSwitchHorizontal size={14} />}
            onClick={() =>
              setMode((m) => (m === "simple" ? "advanced" : "simple"))
            }
            type="button"
          >
            {mode === "simple" ? "Advanced" : "Simple"}
          </Button>
          <Group justify="flex-end">
            <Button variant="light" onClick={onClose} type="button">
              Close
            </Button>
            <Button type="submit">Search</Button>
          </Group>
        </Group>
      </form>
    </HotkeyAwareModal>
  );
}
