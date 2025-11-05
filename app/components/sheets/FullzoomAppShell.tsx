import { AppShell, Group, Text } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import type { ReactNode } from "react";

export function FullzoomAppShell({
  title,
  left,
  right,
  children,
  headerHeight = 64,
  extraReserve = 60,
}: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
  children: (gridHeight: number) => ReactNode;
  headerHeight?: number;
  /** Extra pixels to reserve below header for margins/padding */
  extraReserve?: number;
}) {
  // Use viewport height minus header and a safety reserve to avoid
  // feedback loops. This is stable across renders.
  const { height: viewportHeight } = useViewportSize();
  const gridHeight = Math.max(
    240,
    (viewportHeight || 0) - (headerHeight || 0) - (extraReserve || 0)
  );
  return (
    <AppShell header={{ height: headerHeight }} padding={0} withBorder={false}>
      <AppShell.Header>
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
      </AppShell.Header>
      <AppShell.Main
        style={{
          overflow: "hidden",
          // prevent min-content from forcing extra scrollbars in flex/grid parents
          minHeight: 0,
          // reserve space for scrollbar to avoid layout shift when it appears
          scrollbarGutter: "stable both-edges",
        }}
      >
        {children(gridHeight)}
      </AppShell.Main>
    </AppShell>
  );
}
