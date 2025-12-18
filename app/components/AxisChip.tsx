import { Badge, type BadgeProps } from "@mantine/core";
import type { ReactNode } from "react";

export type AxisChipTone = "warning" | "info" | "neutral";

export function AxisChip({
  tone,
  children,
  leftSection,
  ...props
}: Omit<BadgeProps, "color" | "variant" | "styles" | "leftSection"> & {
  tone: AxisChipTone;
  leftSection?: ReactNode;
}) {
  const tokens =
    tone === "warning"
      ? {
          bg: "var(--axis-chip-warning-bg)",
          fg: "var(--axis-chip-warning-fg)",
          bd: "var(--axis-chip-warning-bd)",
        }
      : tone === "info"
        ? {
            bg: "var(--axis-chip-info-bg)",
            fg: "var(--axis-chip-info-fg)",
            bd: "var(--axis-chip-info-bd)",
          }
        : {
            bg: "var(--axis-chip-neutral-bg)",
            fg: "var(--axis-chip-neutral-fg)",
            bd: "var(--axis-chip-neutral-bd)",
          };

  return (
    <Badge
      size="sm"
      radius="sm"
      variant="outline"
      styles={{
        root: {
          background: tokens.bg,
          color: tokens.fg,
          borderColor: tokens.bd,
          maxWidth: "100%",
        },
        label: {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
      }}
      {...props}
    >
      {leftSection ? (
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          {leftSection}
        </span>
      ) : null}
      {children}
    </Badge>
  );
}

