import { Text, Tooltip, Stack } from "@mantine/core";
import { IconLock, IconLockBolt, IconPin, IconTarget } from "@tabler/icons-react";
import { formatMoney } from "~/utils/format";
import type { PricingValueMeta, PricedValue } from "~/utils/pricingValueMeta";

type PricingValueWithMetaProps = {
  priced: PricedValue | null | undefined;
  format?: "currency" | "number";
  formatValue?: (value: number) => string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
};

const formatForTooltip = (value: number) =>
  formatMoney(value, { currency: "USD" });

const tooltipContent = (meta: PricingValueMeta) => {
  if (meta.state === "locked") {
    return (
      <Stack gap={2}>
        <Text size="xs" fw={600}>
          Locked value
        </Text>
        <Text size="xs">Locked when finalized; will not update automatically.</Text>
      </Stack>
    );
  }
  if (meta.state === "drifted") {
    const locked = meta.drift ? meta.drift.current - meta.drift.delta : null;
    const current = meta.drift?.current ?? null;
    return (
      <Stack gap={2}>
        <Text size="xs" fw={600}>
          Locked value differs from current pricing
        </Text>
        <Text size="xs">
          Locked:{" "}
          {locked != null ? formatForTooltip(locked) : "—"} • Current:{" "}
          {current != null ? formatForTooltip(current) : "—"}
        </Text>
      </Stack>
    );
  }
  if (meta.state === "overridden") {
    return (
      <Stack gap={2}>
        <Text size="xs" fw={600}>
          Pinned override
        </Text>
        <Text size="xs">This value was set explicitly and overrides automatic pricing.</Text>
      </Stack>
    );
  }
  if (meta.contextAffected) {
    const hasContext =
      Boolean(meta.context?.customerName) || meta.context?.qty != null;
    return (
      <Stack gap={2}>
        <Text size="xs" fw={600}>
          Preview-affected value
        </Text>
        {hasContext ? (
          <>
            <Text size="xs">Calculated using preview context:</Text>
            {meta.context?.customerName ? (
              <Text size="xs">• Customer: {meta.context.customerName}</Text>
            ) : null}
            {meta.context?.qty != null ? (
              <Text size="xs">• Qty: {meta.context.qty}</Text>
            ) : null}
          </>
        ) : (
          <Text size="xs">Calculated using active preview (customer / qty).</Text>
        )}
      </Stack>
    );
  }
  return null;
};

const iconForMeta = (meta: PricingValueMeta) => {
  if (meta.state === "locked") return IconLock;
  if (meta.state === "drifted") return IconLockBolt;
  if (meta.state === "overridden") return IconPin;
  if (meta.contextAffected) return IconTarget;
  return null;
};

export function PricingValueWithMeta({
  priced,
  format = "currency",
  formatValue,
  size = "sm",
}: PricingValueWithMetaProps) {
  if (!priced || !Number.isFinite(priced.value)) {
    return <span>—</span>;
  }
  const icon = iconForMeta(priced.meta);
  const tooltip = tooltipContent(priced.meta);
  const text =
    formatValue != null
      ? formatValue(priced.value)
      : format === "currency"
      ? formatMoney(priced.value, { currency: "USD" })
      : formatMoney(priced.value);
  const Icon = icon;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
      }}
    >
      <Text size={size} span>
        {text}
      </Text>
      {Icon && tooltip ? (
        <Tooltip label={tooltip} withArrow>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              color:
                priced.meta.state === "drifted"
                  ? "var(--axis-chip-warning-fg)"
                  : "var(--mantine-color-gray-6)",
            }}
            aria-label={priced.meta.state}
          >
            <Icon size={12} />
          </span>
        </Tooltip>
      ) : null}
    </span>
  );
}
