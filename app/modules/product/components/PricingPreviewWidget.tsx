import React from "react";
import {
  Group,
  NumberInput,
  Select,
  Text,
  Card,
  Tooltip,
  Stack,
} from "@mantine/core";
import { useFetcher } from "@remix-run/react";
import { useOptions } from "~/base/options/OptionsContext";

export function useProductPricingPrefs() {
  // Initialize with SSR-safe defaults; hydrate from sessionStorage after mount
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [qty, setQty] = React.useState<number>(60);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const cid = window.sessionStorage.getItem("pricing.customerId");
    if (cid != null) setCustomerId(cid);
    const rawQty = window.sessionStorage.getItem("pricing.qty");
    if (rawQty != null) {
      const n = Number(rawQty);
      setQty(Number.isFinite(n) ? n : 60);
    }
  }, []);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (customerId != null)
      window.sessionStorage.setItem("pricing.customerId", customerId);
    window.sessionStorage.setItem("pricing.qty", String(qty));
    try {
      // Notify other components (e.g., index list) that prefs changed
      const ev = new CustomEvent("pricing:prefs", {
        detail: { customerId, qty },
      });
      window.dispatchEvent(ev);
    } catch {}
  }, [customerId, qty]);
  return { customerId, setCustomerId, qty, setQty } as const;
}

export function PricingPreviewWidget({
  productId,
  vendorId,
}: {
  productId?: number | null;
  vendorId?: number | null;
}) {
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

  // Broadcast server preview result for other components (detail form) to consume
  React.useEffect(() => {
    if (!result) return;
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          "pricing.preview",
          JSON.stringify(result)
        );
        const ev = new CustomEvent("pricing:preview", { detail: result });
        window.dispatchEvent(ev);
      }
    } catch {}
  }, [result]);

  // Hydrate customer multiplier when selection changes (used by index view for client-side calc)
  React.useEffect(() => {
    let abort = false;
    (async () => {
      try {
        if (!customerId) return;
        const qs = vendorId ? `?vendorId=${vendorId}` : "";
        const resp = await fetch(`/api/customers/${customerId}/pricing${qs}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json, */*" },
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as {
          priceMultiplier?: number;
          marginOverride?: number | null;
          vendorDefaultMargin?: number | null;
          globalDefaultMargin?: number | null;
        };
        const mult = Number(data?.priceMultiplier ?? 1) || 1;
        if (!abort && typeof window !== "undefined") {
          window.sessionStorage.setItem("pricing.mult", String(mult));
          const margins = {
            marginOverride:
              data?.marginOverride != null ? Number(data.marginOverride) : null,
            vendorDefaultMargin:
              data?.vendorDefaultMargin != null
                ? Number(data.vendorDefaultMargin)
                : null,
            globalDefaultMargin:
              data?.globalDefaultMargin != null
                ? Number(data.globalDefaultMargin)
                : null,
          } as const;
          try {
            window.sessionStorage.setItem(
              "pricing.margins",
              JSON.stringify(margins)
            );
          } catch {}
          try {
            const ev = new CustomEvent("pricing:prefs", {
              detail: { customerId, qty, priceMultiplier: mult, margins },
            });
            window.dispatchEvent(ev);
          } catch {}
        }
      } catch {}
    })();
    return () => {
      abort = true;
    };
  }, [customerId, qty, vendorId]);
  return (
    <Group gap="xs" align="center">
      <Text size="xxs">$ per</Text>
      <Select
        size="xs"
        w={180}
        styles={{
          input: {
            lineHeight: 20,
            minHeight: 20,
            height: 20,
            fontSize: "var(--mantine-font-size-xxs)",
          },
        }}
        placeholder="Select customer"
        data={customers}
        value={customerId}
        onChange={setCustomerId}
        searchable
        clearable
      />
      <NumberInput
        size="xs"
        w={60}
        styles={{
          input: {
            lineHeight: 20,
            minHeight: 20,
            height: 20,
            fontSize: "var(--mantine-font-size-xxs)",
          },
        }}
        hideControls
        value={qty}
        onChange={(v) => setQty((v as number) || 60)}
        step={1}
        min={1}
      />
    </Group>
  );
}
