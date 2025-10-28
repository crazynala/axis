import React, { forwardRef } from "react";
import { Button, Menu } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronDown } from "@tabler/icons-react";

type SplitItem = {
  label: string;
  onClick?: () => void;
  leftSection?: React.ReactNode;
  rightSection?: React.ReactNode;
  disabled?: boolean;
};

type SplitButtonProps = {
  children: React.ReactNode; // primary label
  onPrimaryClick?: () => void; // primary action
  items: SplitItem[]; // secondary actions
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "filled" | "light" | "outline" | "subtle" | "default" | "white";
  color?: string;
  radius?: number | string;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  leftSection?: React.ReactNode; // optional icon on the left of label
};

export const SplitButton = forwardRef<HTMLButtonElement, SplitButtonProps>(
  ({ children, onPrimaryClick, items, size = "md", variant = "filled", color, radius = "md", fullWidth, loading, disabled, leftSection }, ref) => {
    const [opened, { toggle, close, open }] = useDisclosure(false);

    const iconSizes: Record<NonNullable<SplitButtonProps["size"]>, number> = {
      xs: 14,
      sm: 16,
      md: 18,
      lg: 18,
      xl: 20,
    } as const;

    const openMenuFromRight = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    };

    const onKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        open();
      }
    };

    return (
      <Menu opened={opened} onChange={(o) => (o ? open() : close())} withinPortal position="bottom-end" offset={4}>
        <Menu.Target>
          <span style={{ display: fullWidth ? "flex" : "inline-flex", width: fullWidth ? "100%" : undefined }}>
            <Button.Group style={{ flexGrow: fullWidth ? 1 : 0 }}>
              <Button
                ref={ref}
                onClick={onPrimaryClick}
                size={size}
                variant={variant}
                color={color}
                radius={radius}
                loading={loading}
                disabled={disabled}
                leftSection={leftSection}
                onKeyDown={onKeyDown}
                style={{ flexGrow: fullWidth ? 1 : 0 }}
              >
                {children}
              </Button>
              <Button
                size={size}
                variant={variant}
                color={color}
                radius={radius}
                aria-label="More actions"
                disabled={disabled}
                onClick={openMenuFromRight}
                onMouseDown={(e) => e.preventDefault()}
                style={{ paddingInline: size === "xs" ? 6 : 8, display: "inline-flex", alignItems: "center" }}
              >
                <IconChevronDown size={iconSizes[size]} />
              </Button>
            </Button.Group>
          </span>
        </Menu.Target>

        <Menu.Dropdown>
          {items.map((it, idx) => (
            <Menu.Item
              key={idx}
              leftSection={it.leftSection}
              rightSection={it.rightSection}
              disabled={it.disabled}
              onClick={() => {
                it.onClick?.();
                close();
              }}
            >
              {it.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    );
  }
);

SplitButton.displayName = "SplitButton";

export default SplitButton;
