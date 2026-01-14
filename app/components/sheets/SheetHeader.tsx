import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconChevronLeft,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBug,
  IconDotsVertical,
} from "@tabler/icons-react";
import { useNavigate, useRouteLoaderData } from "@remix-run/react";
import { useMemo, useState, type ReactNode } from "react";
import { modals } from "@mantine/modals";
import type { SheetController } from "./SheetController";
import { useGlobalFormContext } from "@aa/timber";
import type { loader as rootLoader } from "~/root";
import { DebugDrawer } from "~/modules/debug/components/DebugDrawer";
import type { DebugExplainPayload } from "~/modules/debug/types";

type SheetHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  controller?: SheetController<any>;
  backTo?: string;
  onDone?: () => void;
  saveState?: "idle" | "saving" | "error";
  showStatus?: boolean;
  rightExtra?: ReactNode;
  dsgLink?: string;
  debugPayload?: DebugExplainPayload | null;
};

export function SheetHeader({
  title,
  subtitle,
  controller,
  backTo,
  onDone,
  saveState = "idle",
  showStatus = true,
  rightExtra,
  dsgLink,
  debugPayload,
}: SheetHeaderProps) {
  const navigate = useNavigate();
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const [debugOpen, setDebugOpen] = useState(false);
  const { colorScheme } = useMantineColorScheme();
  const { isDirty, cancelHandlerRef, forceNavigate } = useGlobalFormContext();
  const canUndo = Boolean(controller?.canUndo);
  const canRedo = Boolean(controller?.canRedo);
  const dirty = Boolean(controller?.state?.isDirty ?? isDirty);
  const isDev =
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.DEV === true) ||
    (typeof process !== "undefined" && process.env.NODE_ENV !== "production");
  const isAdminUser =
    !rootData?.userLevel || rootData?.userLevel === "Admin";
  const canDebug = Boolean(isDev && isAdminUser);
  const canShowDsgLink = Boolean(isDev && dsgLink);
  const statusLabel = useMemo(() => {
    if (!showStatus) return null;
    if (saveState === "saving") return "Saving...";
    if (saveState === "error") return "Error";
    return dirty ? "Unsaved" : "Saved";
  }, [dirty, saveState, showStatus]);

  const doExit = useMemo(
    () => () => {
      if (onDone) {
        onDone();
        return;
      }
      if (backTo) {
        forceNavigate(backTo);
      } else {
        navigate(-1);
      }
    },
    [backTo, forceNavigate, navigate, onDone]
  );

  const handleExit = () => {
    if (!dirty) {
      doExit();
      return;
    }
    modals.openConfirmModal({
      title: "Discard changes?",
      children: "You have unsaved changes. Exit anyway?",
      labels: { confirm: "Exit", cancel: "Stay" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        cancelHandlerRef.current?.();
        doExit();
      },
    });
  };

  return (
    <div
      data-sheet-header
      style={{
        height: 56,
        padding: "0 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom:
          colorScheme === "dark"
            ? "1px solid rgba(255, 255, 255, 0.08)"
            : "1px solid var(--mantine-color-gray-3)",
        gap: 12,
      }}
    >
      <Group gap={12} wrap="nowrap" style={{ minWidth: 0 }}>
        <Tooltip label="Back" withArrow>
          <ActionIcon
            variant="subtle"
            aria-label="Back"
            onClick={handleExit}
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" truncate>
            {title}
          </Text>
          {subtitle ? (
            <Text size="xs" c="dimmed" truncate>
              {subtitle}
            </Text>
          ) : null}
        </Stack>
      </Group>

      <Group gap={10} wrap="nowrap">
        {showStatus ? (
          <Text size="xs" c={saveState === "error" ? "red" : "dimmed"}>
            {statusLabel}
          </Text>
        ) : null}
        <Tooltip label="Undo" withArrow>
          <ActionIcon
            variant="subtle"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={() => controller?.triggerUndo?.()}
          >
            <IconArrowBackUp size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Redo" withArrow>
          <ActionIcon
            variant="subtle"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={() => controller?.triggerRedo?.()}
          >
            <IconArrowForwardUp size={16} />
          </ActionIcon>
        </Tooltip>
        {canDebug ? (
          <Tooltip label="Debug" withArrow>
            <ActionIcon
              variant="subtle"
              aria-label="Debug"
              onClick={() => setDebugOpen(true)}
            >
              <IconBug size={16} />
            </ActionIcon>
          </Tooltip>
        ) : null}
        {canShowDsgLink ? (
          <Menu withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label="More">
                <IconDotsVertical size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => navigate(dsgLink!)}>
                Open DSG version
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ) : null}
        <Button size="xs" onClick={handleExit}>
          Done
        </Button>
        {rightExtra}
      </Group>
      {canDebug ? (
        <DebugDrawer
          opened={debugOpen}
          onClose={() => setDebugOpen(false)}
          title="Debug - Sheet"
          payload={debugPayload}
        />
      ) : null}
    </div>
  );
}
