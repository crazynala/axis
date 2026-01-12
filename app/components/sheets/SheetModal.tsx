import type { ReactNode, ComponentProps } from "react";
import type { ModalProps } from "@mantine/core";
import { HotkeyAwareModal } from "~/base/hotkeys/HotkeyAwareModal";
import { SheetFrame } from "./SheetFrame";
import { SheetGrid } from "./SheetGrid";
import type { SheetController } from "./SheetController";

type SheetModalProps<T> = Omit<ModalProps, "children"> & {
  height?: number;
  topReserve?: number;
  bottomReserve?: number;
  controller?: SheetController<T>;
  gridProps?: Omit<ComponentProps<typeof SheetGrid<T>>, "controller" | "height">;
  children?: ReactNode | ((bodyHeight: number) => ReactNode);
};

export function SheetModal<T>({
  height = 420,
  topReserve = 0,
  bottomReserve = 0,
  controller,
  gridProps,
  children,
  ...modalProps
}: SheetModalProps<T>) {
  return (
    <HotkeyAwareModal
      {...modalProps}
      styles={{
        body: { overflow: "hidden" },
        content: { scrollbarGutter: "stable both-edges" },
      }}
    >
      <SheetFrame
        gridHeight={height}
        topReserve={topReserve}
        bottomReserve={bottomReserve}
      >
        {(bodyHeight) => {
          if (typeof children === "function") {
            return children(bodyHeight);
          }
          if (children) return children;
          return (
            <SheetGrid
              controller={controller}
              height={bodyHeight}
              {...(gridProps as any)}
            />
          );
        }}
      </SheetFrame>
    </HotkeyAwareModal>
  );
}
