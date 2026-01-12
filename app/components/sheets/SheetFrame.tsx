import type { ReactNode } from "react";

export function SheetFrame({
  gridHeight,
  topReserve = 0,
  bottomReserve = 0,
  children,
}: {
  gridHeight: number;
  topReserve?: number;
  bottomReserve?: number;
  children: (bodyHeight: number) => ReactNode;
}) {
  const reserveTotal = (topReserve || 0) + (bottomReserve || 0);
  const bodyHeight =
    reserveTotal > 0 ? Math.max(0, gridHeight - reserveTotal) : gridHeight;

  return (
    <div
      style={{
        height: gridHeight,
        maxHeight: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children(bodyHeight)}
      </div>
    </div>
  );
}
