import { Group, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import type { ReactNode } from "react";

export function SheetShell({
  title,
  left,
  right,
  children,
  headerHeight = 64,
  footer,
}: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
  children: (bodyHeight: number) => ReactNode;
  headerHeight?: number;
  footer?: ReactNode;
}) {
  const { ref: bodyRef, height: bodyHeight } = useElementSize();
  return (
    <div
      data-sheet-shell
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ flex: "0 0 auto", height: headerHeight }}>
        <Group
          justify="space-between"
          align="center"
          px={24}
          // keep vertical height fixed to headerHeight (no extra vertical padding)
          style={{ height: "100%" }}
        >
          <div>{left}</div>
          <Text size="xl">{title}</Text>
          <div>{right}</div>
        </Group>
      </div>
      <div
        ref={bodyRef}
        data-sheet-body
        style={{
          display: "flex",
          flexDirection: "column",
          flex: "1 1 auto",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {children(Math.max(0, bodyHeight || 0))}
      </div>
      <div style={{ flex: "0 0 auto" }}>{footer}</div>
    </div>
  );
}
