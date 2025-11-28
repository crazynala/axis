import { Checkbox, Group, Loader, Stack, Text, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import { HotkeyAwareModal } from "~/base/hotkeys/HotkeyAwareModal";

export type ProductPickerItem = {
  id: number;
  sku: string;
  name?: string | null;
  type?: string | null;
  supplierName?: string | null;
  _count?: { productLines?: number | null } | null;
};

export type ProductPickerModalProps = {
  opened: boolean;
  onClose: () => void;
  onSelect: (product: ProductPickerItem) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  results: ProductPickerItem[];
  loading?: boolean;
  title?: string;
  emptyState?: ReactNode;
  assemblyItemOnly?: boolean;
  onAssemblyItemOnlyChange?: (value: boolean) => void;
  showAssemblyToggle?: boolean;
};

export function ProductPickerModal({
  opened,
  onClose,
  onSelect,
  searchValue,
  onSearchChange,
  results,
  loading = false,
  title = "Add Component",
  emptyState,
  assemblyItemOnly = false,
  onAssemblyItemOnlyChange,
  showAssemblyToggle = true,
}: ProductPickerModalProps) {
  const handleAssemblyToggle = (checked: boolean) => {
    if (!onAssemblyItemOnlyChange) return;
    onAssemblyItemOnlyChange(checked);
  };

  const renderEmpty = () => {
    if (loading) return null;
    if (emptyState) return emptyState;
    if (searchValue.trim().length === 0) {
      return (
        <Text size="sm" c="dimmed">
          Start typing to search products.
        </Text>
      );
    }
    return (
      <Text size="sm" c="dimmed">
        No products match "{searchValue}".
      </Text>
    );
  };

  return (
    <HotkeyAwareModal
      opened={opened}
      onClose={onClose}
      title={title}
      size="xl"
      centered
    >
      <Stack style={{ height: "min(500px, 80vh)" }}>
        <Group justify="space-between" align="flex-end">
          <TextInput
            placeholder="Search products..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            w={320}
            autoFocus
          />
          {showAssemblyToggle && (
            <Checkbox
              label="Assembly Item"
              checked={assemblyItemOnly}
              onChange={(e) => handleAssemblyToggle(e.currentTarget.checked)}
            />
          )}
        </Group>
        <div style={{ flex: 1, overflow: "auto" }}>
          {loading ? (
            <Group justify="center" py="lg">
              <Loader size="sm" />
            </Group>
          ) : results.length ? (
            results.map((p) => (
              <Group
                key={p.id}
                py={6}
                gap="md"
                onClick={() => onSelect(p)}
                style={{ cursor: "pointer" }}
              >
                <Text w={60}>{p.id}</Text>
                <Text w={160}>{p.sku}</Text>
                <Text style={{ flex: 1 }}>{p.name}</Text>
              </Group>
            ))
          ) : (
            renderEmpty()
          )}
        </div>
      </Stack>
    </HotkeyAwareModal>
  );
}
