import React from "react";
import { Card, Drawer, Group, Title } from "@mantine/core";

type CardChromeProps = {
  title?: React.ReactNode;
  showEdit?: boolean;
  onEdit?: () => void;
  children: React.ReactNode;
  drawerOpened?: boolean;
  onDrawerClose?: () => void;
  drawerTitle?: React.ReactNode;
  drawerChildren?: React.ReactNode;
};

export function CardChrome({
  title,
  showEdit,
  onEdit,
  children,
  drawerOpened,
  onDrawerClose,
  drawerTitle,
  drawerChildren,
}: CardChromeProps) {
  const hasHeader = Boolean(title || showEdit);
  const canShowDrawer = Boolean(showEdit && drawerChildren);

  return (
    <>
      <Card withBorder padding="md">
        {hasHeader ? (
          <Card.Section inheritPadding py={8} style={{ position: "relative" }}>
            <Group justify="space-between" align="center">
              {title ? <Title order={4}>{title}</Title> : <span />}
              {showEdit ? (
                <button
                  type="button"
                  className="drawerToggle"
                  aria-label="Edit"
                  onClick={onEdit}
                />
              ) : null}
            </Group>
          </Card.Section>
        ) : null}
        {children}
      </Card>
      {canShowDrawer ? (
        <Drawer
          opened={Boolean(drawerOpened)}
          onClose={onDrawerClose}
          title={drawerTitle}
          position="right"
          size="lg"
        >
          {drawerChildren}
        </Drawer>
      ) : null}
    </>
  );
}
