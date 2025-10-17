import { json } from "@remix-run/node";
import {
  AppShell,
  Group,
  Text,
  Stack,
  Card,
  TextInput,
  NumberInput,
  Checkbox,
  Button,
} from "@mantine/core";
import { SaveCancelHeader, useInitGlobalFormContext } from "@aa/timber";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useCallback, useMemo, useState } from "react";

export async function loader({ request }: any) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") || "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return json({ ids });
}

type Patch = {
  name?: string | null;
  type?: string | null;
  supplierId?: number | null;
  categoryId?: number | null;
  purchaseTaxId?: number | null;
  costPrice?: number | null;
  manualSalePrice?: number | null;
  stockTrackingEnabled?: boolean | null;
  batchTrackingEnabled?: boolean | null;
};

export default function ProductsBatchEditFullzoom() {
  const { ids } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [patch, setPatch] = useState<Patch>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const setField = (k: keyof Patch, v: any) => {
    setPatch((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const payload = { _intent: "product.batchUpdate", ids, patch };
      const resp = await fetch("/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok) {
        navigate("/products?refreshed=1");
      } else {
        // eslint-disable-next-line no-alert
        alert(data?.error || "Update failed");
      }
    } finally {
      setSaving(false);
    }
  }, [ids, patch, navigate]);

  const reset = useCallback(() => {
    setPatch({});
    setDirty(false);
  }, []);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset,
      formState: { isDirty: dirty },
    }),
    [dirty, reset]
  );
  useInitGlobalFormContext(formHandlers as any, () => save(), reset);

  return (
    <AppShell header={{ height: 100 }} padding="md" withBorder={false}>
      <AppShell.Header>
        <Group justify="space-between" align="center" px={24} py={16}>
          <Text size="xl">Batch Edit Products ({ids.length})</Text>
          <SaveCancelHeader />
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Card withBorder>
          <Stack>
            <Text c="dimmed" size="sm">
              Set only the fields you want to update. Leave others blank to keep
              existing values.
            </Text>
            <TextInput
              label="Name"
              value={patch.name ?? ""}
              onChange={(e) => setField("name", e.currentTarget.value || null)}
            />
            <TextInput
              label="Type"
              value={patch.type ?? ""}
              onChange={(e) => setField("type", e.currentTarget.value || null)}
            />
            <NumberInput
              label="Supplier ID"
              value={patch.supplierId ?? undefined}
              onChange={(v) =>
                setField("supplierId", v == null ? null : Number(v))
              }
            />
            <NumberInput
              label="Category ID"
              value={patch.categoryId ?? undefined}
              onChange={(v) =>
                setField("categoryId", v == null ? null : Number(v))
              }
            />
            <NumberInput
              label="Purchase Tax ID"
              value={patch.purchaseTaxId ?? undefined}
              onChange={(v) =>
                setField("purchaseTaxId", v == null ? null : Number(v))
              }
            />
            <NumberInput
              label="Cost Price"
              value={patch.costPrice ?? undefined}
              onChange={(v) =>
                setField("costPrice", v == null ? null : Number(v))
              }
            />
            <NumberInput
              label="Manual Sale Price"
              value={patch.manualSalePrice ?? undefined}
              onChange={(v) =>
                setField("manualSalePrice", v == null ? null : Number(v))
              }
            />
            <Checkbox
              label="Stock Tracking Enabled"
              checked={!!patch.stockTrackingEnabled}
              onChange={(e) =>
                setField("stockTrackingEnabled", e.currentTarget.checked)
              }
            />
            <Checkbox
              label="Batch Tracking Enabled"
              checked={!!patch.batchTrackingEnabled}
              onChange={(e) =>
                setField("batchTrackingEnabled", e.currentTarget.checked)
              }
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => navigate("/products")}>
                Cancel
              </Button>
              <Button
                color="green"
                onClick={save}
                loading={saving}
                disabled={!dirty}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </Card>
      </AppShell.Main>
    </AppShell>
  );
}
