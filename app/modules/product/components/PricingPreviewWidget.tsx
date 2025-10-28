import React from "react";
import { Group, NumberInput, Select, Text, Card, Tooltip, Stack } from "@mantine/core";
import { useFetcher } from "@remix-run/react";
import { useOptions } from "~/base/options/OptionsContext";

export function useProductPricingPrefs() {
  const [customerId, setCustomerId] = React.useState<string | null>((typeof window !== "undefined" && window.sessionStorage.getItem("pricing.customerId")) || null);
  const [qty, setQty] = React.useState<number>(() => {
    const raw = typeof window !== "undefined" ? window.sessionStorage.getItem("pricing.qty") : null;
    const n = raw ? Number(raw) : 60;
    return Number.isFinite(n) ? n : 60;
  });
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (customerId != null) window.sessionStorage.setItem("pricing.customerId", customerId);
    window.sessionStorage.setItem("pricing.qty", String(qty));
  }, [customerId, qty]);
  return { customerId, setCustomerId, qty, setQty } as const;
}

export function PricingPreviewWidget({ productId }: { productId?: number | null }) {
  const options = useOptions();
  const customers = (options?.customerOptions || []).map((c) => ({
    value: c.value,
    label: c.label,
  }));
  const { customerId, setCustomerId, qty, setQty } = useProductPricingPrefs();
  const fetcher = useFetcher<any>();
  const result = fetcher.data as any;
  const canPrice = productId != null && customerId != null && customerId !== "";
  React.useEffect(() => {
    if (!canPrice) return;
    const fd = new FormData();
    fd.set("_intent", "price.preview");
    fd.set("qty", String(qty));
    fd.set("customerId", String(customerId));
    fetcher.submit(fd, { method: "post", action: `/products/${productId}` });
  }, [productId, customerId, qty]);
  return (
    <Card withBorder p={5} radius="sm">
      <Group gap="xs" align="center">
        <Text size="xs">$ per</Text>
        <Select size="xs" w={180} placeholder="Select customer" data={customers} value={customerId} onChange={setCustomerId} searchable clearable />
        <NumberInput size="xs" w={60} hideControls value={qty} onChange={(v) => setQty((v as number) || 60)} step={1} min={1} />
      </Group>
    </Card>
  );
}
