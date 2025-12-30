import React from "react";
import { Button, Card, Drawer, Grid, Group, Stack, Title } from "@mantine/core";
import type { PageNode, CardNode } from "./layoutTypes";
import { RenderGroup } from "./fieldConfigShared";
import type { UseFormReturn } from "react-hook-form";

type LayoutFormRendererProps = {
  page: PageNode;
  form: UseFormReturn<any>;
  mode: "edit" | "find";
  ctx?: Record<string, any>;
  onSave?: (values: any) => void;
  children?: React.ReactNode;
};

type CardRendererProps = {
  card: CardNode;
  form: UseFormReturn<any>;
  mode: "edit" | "find";
  ctx?: Record<string, any>;
  onSave?: (values: any) => void;
};

const resolveFlag = (
  value: boolean | ((args: { form: UseFormReturn<any>; mode: "edit" | "find"; ctx?: any }) => boolean) | undefined,
  args: { form: UseFormReturn<any>; mode: "edit" | "find"; ctx?: any }
) => (typeof value === "function" ? value(args) : value);

const resolveUiMode = (
  value:
    | "normal"
    | "quiet"
    | ((args: { form: UseFormReturn<any>; mode: "edit" | "find"; ctx?: any }) => "normal" | "quiet")
    | undefined,
  args: { form: UseFormReturn<any>; mode: "edit" | "find"; ctx?: any },
  fallback: "normal" | "quiet"
) => (typeof value === "function" ? value(args) : value ?? fallback);

function CardRenderer({
  card,
  form,
  mode,
  ctx,
  onSave,
}: CardRendererProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const inlineEditable = card.editableInlineWhen
    ? card.editableInlineWhen({ form, mode, ctx })
    : false;
  const surfaceAllowEdit =
    resolveFlag(card.surfaceAllowEdit, { form, mode, ctx }) ?? inlineEditable;
  const drawerAllowEdit =
    resolveFlag(card.drawerAllowEdit, { form, mode, ctx }) ?? true;
  const surfaceUiMode = resolveUiMode(
    card.surfaceUiMode,
    { form, mode, ctx },
    "normal"
  );
  const drawerUiMode = resolveUiMode(
    card.drawerUiMode,
    { form, mode, ctx },
    "normal"
  );
  const showEdit = !inlineEditable && mode === "edit";
  const surfaceCtx = {
    ...(ctx || {}),
    allowEditInCalm: surfaceAllowEdit,
    uiMode: surfaceUiMode,
  };
  const drawerCtx = {
    ...(ctx || {}),
    allowEditInCalm: drawerAllowEdit,
    uiMode: drawerUiMode,
    markDirtyOnChange: true,
  };
  const drawerItems = card.drawerItems?.length ? card.drawerItems : card.items;
  const hasHeader = Boolean(card.title || showEdit);

  return (
    <>
      <Card withBorder padding="md">
        {hasHeader ? (
          <Card.Section inheritPadding py="xs" style={{ position: "relative" }}>
            <Group justify="space-between" align="center">
              {card.title ? <Title order={4}>{card.title}</Title> : <span />}
              {showEdit ? (
                <button
                  type="button"
                  className="drawerToggle"
                  aria-label="Edit"
                  onClick={() => setDrawerOpen(true)}
                />
              ) : null}
            </Group>
          </Card.Section>
        ) : null}
        <RenderGroup
          form={form as any}
          items={card.items as any}
          mode={mode as any}
          ctx={surfaceCtx as any}
        />
      </Card>
      {showEdit && drawerItems?.length ? (
        <Drawer
          opened={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={card.drawerTitle || card.title}
          position="right"
          size="lg"
        >
          <Stack gap="md">
            <RenderGroup
              form={form as any}
              items={drawerItems as any}
              mode={mode as any}
              ctx={drawerCtx as any}
              gap={10}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDrawerOpen(false)}>
                Close
              </Button>
              <Button
                disabled={!form.formState.isDirty}
                onClick={() => onSave?.(form.getValues())}
              >
                Save changes
              </Button>
            </Group>
          </Stack>
        </Drawer>
      ) : null}
    </>
  );
}

export function LayoutFormRenderer({
  page,
  form,
  mode,
  ctx,
  onSave,
  children,
}: LayoutFormRendererProps) {
  return (
    <Grid gutter={page.gutter ?? "md"}>
      {page.columns.map((column, index) => (
        <Grid.Col key={`col-${index}`} span={column.span}>
          <Stack gap="md">
            {column.children.map((card) => (
              <CardRenderer
                key={card.key}
                card={card}
                form={form}
                mode={mode}
                ctx={ctx}
                onSave={onSave}
              />
            ))}
          </Stack>
        </Grid.Col>
      ))}
      {children}
    </Grid>
  );
}
