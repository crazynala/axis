import type { ReactNode } from "react";
import type { ModalProps } from "@mantine/core";
import { HotkeyAwareModal } from "~/base/hotkeys/HotkeyAwareModal";
import { SheetFrame } from "./SheetFrame";

type SheetModalProps = Omit<ModalProps, "children"> & {
  height?: number;
  topReserve?: number;
  bottomReserve?: number;
  children?: ReactNode | ((bodyHeight: number) => ReactNode);
};

export function SheetModal({
  height = 420,
  topReserve = 0,
  bottomReserve = 0,
  children,
  ...modalProps
}: SheetModalProps) {
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
          return children ?? null;
        }}
      </SheetFrame>
    </HotkeyAwareModal>
  );
}
