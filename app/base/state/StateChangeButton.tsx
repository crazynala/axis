import { forwardRef, useEffect, useMemo, useState } from "react";
import { Button, Popover, Stack, ActionIcon, Group, Code } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArrowBackUp } from "@tabler/icons-react";
import { useStateHistory } from "@mantine/hooks";
import { StateModel, type StateConfig, type StateKey } from "./StateModel";

export interface StateChangeButtonProps {
  value: string;
  defaultValue?: string;
  size?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  config: StateConfig;
  debug?: boolean;
  children?: React.ReactNode;
}

export const StateChangeButton = forwardRef<
  HTMLButtonElement,
  StateChangeButtonProps
>(
  (
    {
      defaultValue = "",
      value,
      onChange,
      disabled = false,
      size = "sm",
      config,
      debug = false,
      children = null,
    },
    ref
  ) => {
    const [state, stateHandlers, stateHistory] = useStateHistory(defaultValue);
    const [updateStateInForm, setUpdateStateInForm] = useState(false);
    const [opened, setOpened] = useState(false);
    const model = useMemo(
      () => new StateModel(config, state as StateKey),
      [config, state]
    );

    // Sync from prop value
    useEffect(() => {
      if (value !== state) {
        stateHandlers.set(value);
      }
    }, [value]);

    // After undo, reflect into caller
    useEffect(() => {
      if (updateStateInForm) {
        onChange(state);
        setUpdateStateInForm(false);
      }
    }, [updateStateInForm]);

    return (
      <Popover
        width={240}
        position="bottom"
        withArrow
        shadow="md"
        opened={opened}
        onChange={setOpened}
      >
        <Popover.Target>
          <Group>
            <Button
              size={size as any}
              color={model.getColor()}
              onClick={() => setOpened((o) => !o)}
              ref={ref}
              disabled={disabled}
            >
              {model.getLabel()}
            </Button>
            {stateHistory.current > 0 && (
              <ActionIcon
                onClick={() => {
                  stateHandlers.back();
                  setUpdateStateInForm(true);
                }}
                variant="subtle"
              >
                <IconArrowBackUp />
              </ActionIcon>
            )}
          </Group>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap={6}>
            {model.getPossibleTransitions().map((ns) => {
              const meta = model.getTransitionMeta(state as StateKey, ns);
              const color = meta?.color || model.getColor(ns);
              const doChange = () => {
                stateHandlers.set(ns);
                onChange(ns);
                setOpened(false);
              };
              if (meta) {
                return (
                  <Button
                    key={ns}
                    color={color}
                    onClick={() => {
                      modals.openConfirmModal({
                        title: meta.title || model.getLabel(ns),
                        children: meta.text ? (
                          <div>{meta.text}</div>
                        ) : undefined,
                        labels: {
                          confirm: meta.confirmLabel || model.getLabel(ns),
                          cancel: meta.cancelLabel || "Cancel",
                        },
                        confirmProps: { color },
                        onConfirm: doChange,
                      });
                    }}
                    variant="light"
                    size="xs"
                  >
                    {model.getLabel(ns)}
                  </Button>
                );
              }
              return (
                <Button
                  key={ns}
                  color={color}
                  onClick={doChange}
                  variant="light"
                  size="xs"
                >
                  {model.getLabel(ns)}
                </Button>
              );
            })}
            {debug && (
              <Code block>{JSON.stringify(stateHistory, null, 2)}</Code>
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    );
  }
);

export default StateChangeButton;
