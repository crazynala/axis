import React from "react";
import { Modal, type ModalProps } from "@mantine/core";
import { useSquelchHotkeys } from "./HotkeyContext";

// Simple Modal wrapper: when opened, squelch global hotkeys (e.g., ESC-to-index)
export function HotkeyAwareModal({ opened, ...props }: ModalProps) {
  useSquelchHotkeys(!!opened);
  return <Modal opened={opened} {...props} />;
}

// Composition API wrapper for Modal.Root: mirrors Mantine's API but squelches hotkeys when opened
type ModalRootProps = React.ComponentProps<typeof Modal.Root> & {
  opened: boolean;
};

export function HotkeyAwareModalRoot({
  opened,
  children,
  ...rest
}: ModalRootProps) {
  useSquelchHotkeys(!!opened);
  return (
    <Modal.Root opened={opened} {...rest}>
      {children}
    </Modal.Root>
  );
}
