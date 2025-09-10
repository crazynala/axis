import React, { useEffect, useState } from "react";
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
} from "../../find/multiFind";
import type {
  GenericFindModalProps,
  MultiRequestAdapter,
  FindFieldConfig,
} from "./GenericFindTypes";

export interface GenericMultiFindModalProps<TValues extends FieldValues>
  extends GenericFindModalProps<TValues> {
  adapter: MultiRequestAdapter<TValues>;
  FormComponent: React.ComponentType<any>; // expects props { mode, form, showModeBadge? }
}

export function GenericMultiFindModal<TValues extends FieldValues>({
  opened,
  onClose,
  onSearch,
  initialValues,
  adapter,
  FormComponent,
}: GenericMultiFindModalProps<TValues>) {
  const { buildDefaults, allFields, title } = adapter;
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const form = useForm<TValues>({
    defaultValues: { ...buildDefaults(), ...(initialValues || {}) } as any,
  });
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
    if (opened) {
      form.reset({ ...buildDefaults(), ...(initialValues || {}) } as any);
      setMode("simple");
      setMulti({ requests: [makeRequest()] });
      setActiveReqId(null);
    }
  }, [opened]);

  // On entering advanced mode, copy current simple criteria into first request (only once per transition)
  useEffect(() => {
    if (mode === "advanced") {
      setMulti((m) => {
        // derive from current simple form values
        const vals: any = form.getValues();
        const first = { ...m.requests[0] };
        if (Object.keys(first.criteria).length === 0) {
          const crit: Record<string, any> = {};
          for (const f of allFields()) {
            if (!f.findOp) continue;
            if (f.widget === "numberRange") {
              const minName = f.rangeFields?.min || `${f.name}Min`;
              const maxName = f.rangeFields?.max || `${f.name}Max`;
              const minVal = vals[minName];
              const maxVal = vals[maxName];
              if (minVal !== undefined && minVal !== null && minVal !== "")
                crit[minName] = minVal;
              if (maxVal !== undefined && maxVal !== null && maxVal !== "")
                crit[maxName] = maxVal;
              continue;
            }
            const v = vals[f.name];
            if (v !== undefined && v !== null && v !== "" && v !== "any")
              crit[f.name] = v;
          }
          first.criteria = crit;
          const next = [...m.requests];
          next[0] = first;
          return { requests: next };
        }
        return m;
      });
      // load first request into form (active)
      const first = multi.requests[0];
      const base: any = buildDefaults();
      for (const [k, v] of Object.entries(first.criteria)) base[k] = v;
      form.reset(base);
    } else {
      // switching to simple: collapse active request values into form (already there) and keep them
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
      for (const f of allFields()) {
        if (!f.findOp) continue;
        if (f.widget === "numberRange") {
          const minName = f.rangeFields?.min || `${f.name}Min`;
          const maxName = f.rangeFields?.max || `${f.name}Max`;
          const minVal = vals[minName];
          const maxVal = vals[maxName];
          if (minVal !== undefined && minVal !== "" && minVal !== null)
            crit[minName] = minVal;
          if (maxVal !== undefined && maxVal !== "" && maxVal !== null)
            crit[maxName] = maxVal;
          continue;
        }
        const v = (vals as any)[f.name];
        if (v !== undefined && v !== null && v !== "" && v !== "any")
          crit[f.name] = v;
      }
      req.criteria = crit;
      const next = [...m.requests];
      next[idx] = req;
      return { requests: next };
    });
  };

  const buildParamsFromValues = (vals: any) => {
    const params = new URLSearchParams();
    for (const f of allFields()) {
      if (!f.findOp) continue;
      if (f.widget === "numberRange") {
        const minName = f.rangeFields?.min || `${f.name}Min`;
        const maxName = f.rangeFields?.max || `${f.name}Max`;
        const minVal = vals[minName];
        const maxVal = vals[maxName];
        if (minVal !== undefined && minVal !== null && minVal !== "")
          params.set(minName, String(minVal));
        if (maxVal !== undefined && maxVal !== null && maxVal !== "")
          params.set(maxName, String(maxVal));
        continue;
      }
      const val = vals[f.name];
      if (val === undefined || val === null || val === "" || val === "any")
        continue;
      params.set(f.name, String(val));
    }
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
        for (const f of allFields()) {
          if (!f.findOp) continue;
          if (f.widget === "numberRange") {
            const minName = f.rangeFields?.min || `${f.name}Min`;
            const maxName = f.rangeFields?.max || `${f.name}Max`;
            const minVal = vals[minName];
            const maxVal = vals[maxName];
            if (minVal !== undefined && minVal !== null && minVal !== "")
              crit[minName] = minVal;
            if (maxVal !== undefined && maxVal !== null && maxVal !== "")
              crit[maxName] = maxVal;
            continue;
          }
          const v = vals[f.name];
          if (v !== undefined && v !== null && v !== "" && v !== "any")
            crit[f.name] = v;
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
          if (val.length > 12) val = val.slice(0, 12) + "…";
          return `${k}=${val}`;
        })
        .join(", ") + (entries.length > 3 ? " …" : "")
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
        <FormComponent mode="find" form={form as any} showModeBadge />
      </div>
    </Stack>
  );

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="xl" centered>
      {/* Mode toggle removed from header */}
      {mode === "simple" ? (
        <div onBlur={syncActive}>
          <div style={{ width: "100%" }}>
            <FormComponent
              mode="find"
              form={form as any}
              showModeBadge
              layout="stack"
            />
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
        >
          {mode === "simple" ? "Advanced" : "Simple"}
        </Button>
        <Group justify="flex-end">
          <Button variant="light" onClick={onClose}>
            Close
          </Button>
          {mode === "simple" ? (
            <Button onClick={submitSimple}>Search</Button>
          ) : (
            <Button onClick={submitAdvanced}>Search</Button>
          )}
        </Group>
      </Group>
    </Modal>
  );
}
