import React from "react";
import { Modal, type ModalProps } from "@mantine/core";
import { useSquelchHotkeys } from "./HotkeyContext";

export function HotkeyAwareModal({ opened, ...props }: ModalProps) {
  useSquelchHotkeys(!!opened);
  return <Modal opened={opened} {...props} />;
}
