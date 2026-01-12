import { useElementSize } from "@mantine/hooks";
import type { ReactNode } from "react";
import type { SheetController } from "./SheetController";
import { SheetHeader } from "./SheetHeader";

export function SheetShell({
  title,
  subtitle,
  controller,
  backTo,
  onDone,
  saveState = "idle",
  showStatus = true,
  rightExtra,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  controller?: SheetController<any>;
  backTo?: string;
  onDone?: () => void;
  saveState?: "idle" | "saving" | "error";
  showStatus?: boolean;
  rightExtra?: ReactNode;
  children: (bodyHeight: number) => ReactNode;
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
      <div style={{ flex: "0 0 auto" }}>
        <SheetHeader
          title={title}
          subtitle={subtitle}
          controller={controller}
          backTo={backTo}
          onDone={onDone}
          saveState={saveState}
          showStatus={showStatus}
          rightExtra={rightExtra}
        />
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
