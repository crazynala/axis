import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Alert,
  Button,
  Group,
  Select,
  Stack,
  Title,
  Text,
} from "@mantine/core";
import { useEffect, useState } from "react";
import {
  loadLogLevels,
  saveLogLevels,
  type LogLevels,
  type LogLevel,
} from "~/utils/log-config.server";

export async function loader(_args: LoaderFunctionArgs) {
  const logLevels = await loadLogLevels();
  return json({ logLevels });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const raw = (form.get("levels") as string) || "{}";
  const parsed = JSON.parse(raw) as LogLevels;
  await saveLogLevels(parsed);
  const logLevels = await loadLogLevels();
  return json({ logLevels, message: "Log levels updated" });
}

export default function AdminLoggingRoute() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const MODULES: string[] = [
    "default",
    "timber",
    "products",
    "jobs",
    "companies",
    "contacts",
    "assembly",
    "assembly-activities",
    "costings",
    "search",
    "import",
    "api",
    "web",
    "db",
    "ui",
  ];
  const LEVELS: LogLevel[] = [
    "silent",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
  ];
  const [local, setLocal] = useState<LogLevels>(
    data.logLevels ?? { default: "info" }
  );
  useEffect(() => setLocal(data.logLevels), [data.logLevels]);

  const dataFor = (module: string) => {
    const base = LEVELS.map((l) => ({ value: l, label: l }));
    return module === "default"
      ? base
      : [{ value: "__inherit__", label: "(inherit default)" }, ...base];
  };
  const valueFor = (module: string) =>
    module === "default"
      ? local.default ?? "info"
      : (local as any)[module] ?? "__inherit__";
  const setFor = (module: string, v: string | null) => {
    if (!v) return;
    if (module === "default") setLocal({ ...local, default: v as LogLevel });
    else if (v === "__inherit__") {
      const { [module]: _omit, ...rest } = local as any;
      setLocal(rest as LogLevels);
    } else setLocal({ ...local, [module]: v as LogLevel });
  };

  const save = () => {
    const fd = new FormData();
    fd.set("levels", JSON.stringify({ default: "info", ...local }));
    submit(fd, { method: "post" });
    try {
      (window as any).__LOG_LEVELS__ = { default: "info", ...local };
    } catch {}
  };

  return (
    <Stack>
      <Title order={3}>Logging</Title>
      <Alert mb="sm" color="grape" variant="light">
        Set per-module log levels. Unset modules inherit from <b>default</b>.
      </Alert>
      <Group wrap="wrap" align="flex-end" gap="md">
        {MODULES.map((m) => (
          <div key={m} style={{ minWidth: 220 }}>
            <Select
              label={m}
              data={dataFor(m)}
              value={valueFor(m)}
              onChange={(v) => setFor(m, v)}
              allowDeselect={false}
            />
          </div>
        ))}
        <Group>
          <Button
            size="xs"
            variant="light"
            onClick={() => setLocal({ default: "info" })}
          >
            Default info
          </Button>
          <Button
            size="xs"
            variant="light"
            onClick={() => setLocal({ default: "warn" })}
          >
            Default warn
          </Button>
          <Button
            size="xs"
            variant="light"
            onClick={() =>
              setLocal({ default: "debug", recordBrowser: "debug" })
            }
          >
            Debug recordBrowser
          </Button>
        </Group>
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </Button>
      </Group>
      <Text c="dimmed" size="sm">
        Modules not shown will inherit <b>default</b>.
      </Text>
    </Stack>
  );
}
