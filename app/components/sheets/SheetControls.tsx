import { Button, type ButtonProps } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconLogout2, IconDeviceFloppy } from "@tabler/icons-react";
import { useGlobalFormContext } from "@aa/timber";
import { useEffect, useMemo } from "react";
import { useNavigate } from "@remix-run/react";

export function useSheetDirtyPrompt(message?: string) {
  const { isDirty } = useGlobalFormContext();
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!isDirty) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message || "You have unsaved changes.";
      return event.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, message]);
}

export type SheetExitButtonProps = {
  to?: string;
  label?: string;
  confirmTitle?: string;
  confirmMessage?: string;
  confirmOkLabel?: string;
  confirmCancelLabel?: string;
  onExit?: () => void;
} & Omit<ButtonProps, "onClick">;

export function SheetExitButton({
  to,
  label = "Exit",
  confirmTitle = "Discard changes?",
  confirmMessage = "You have unsaved changes. Exit anyway?",
  confirmOkLabel = "Exit",
  confirmCancelLabel = "Stay",
  onExit,
  leftSection,
  variant = "subtle",
  size = "sm",
  ...rest
}: SheetExitButtonProps) {
  const navigate = useNavigate();
  const { isDirty, cancelHandlerRef, forceNavigate } = useGlobalFormContext();

  const doExit = useMemo(
    () => () => {
      if (onExit) {
        onExit();
        return;
      }
      if (to) {
        forceNavigate(to);
      } else {
        navigate(-1);
      }
    },
    [forceNavigate, navigate, onExit, to]
  );

  const handleExit = () => {
    if (!isDirty) {
      doExit();
      return;
    }
    modals.openConfirmModal({
      title: confirmTitle,
      children: confirmMessage ? <div>{confirmMessage}</div> : undefined,
      labels: { confirm: confirmOkLabel, cancel: confirmCancelLabel },
      confirmProps: { color: "red" },
      onConfirm: () => {
        cancelHandlerRef.current?.();
        doExit();
      },
    });
  };

  return (
    <Button
      variant={variant}
      size={size}
      leftSection={leftSection ?? <IconLogout2 size={16} />}
      onClick={handleExit}
      {...rest}
    >
      {label}
    </Button>
  );
}

export type SheetSaveButtonProps = {
  label?: string;
  saving?: boolean;
} & Omit<ButtonProps, "onClick">;

export function SheetSaveButton({
  label = "Save",
  saving = false,
  disabled,
  leftSection,
  size = "sm",
  ...rest
}: SheetSaveButtonProps) {
  const { isDirty, saveHandlerRef } = useGlobalFormContext();
  const canSave = !saving && isDirty && !!saveHandlerRef.current;
  return (
    <Button
      size={size}
      leftSection={leftSection ?? <IconDeviceFloppy size={16} />}
      loading={saving}
      disabled={!canSave || disabled}
      onClick={() => saveHandlerRef.current?.()}
      {...rest}
    >
      {label}
    </Button>
  );
}
