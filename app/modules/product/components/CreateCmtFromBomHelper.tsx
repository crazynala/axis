import { useCallback, useMemo, useState } from "react";
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";

export type CreateCmtFromBomHelperProps = {
  parentProductId: number;
  parentType: string | null | undefined;
  parentCategoryId: number | null | undefined;
  parentSubCategoryId: number | null | undefined;
  categoryLabel?: string | null;
  subCategoryLabel?: string | null;
  hasCmtLine: boolean;
  pricingSpecOptions: Array<{ value: string; label: string }>;
  subCategoryOptions?: Array<{ value: string; label: string }>;
  onSuccess?: () => void;
  disabledReason?: string | null;
};

export function CreateCmtFromBomHelper({
  parentProductId,
  parentType,
  parentCategoryId,
  parentSubCategoryId,
  categoryLabel,
  subCategoryLabel,
  hasCmtLine,
  pricingSpecOptions,
  subCategoryOptions = [],
  onSuccess,
  disabledReason,
}: CreateCmtFromBomHelperProps) {
  const isFinished = String(parentType || "") === "Finished";
  const canCreate =
    isFinished && !hasCmtLine && Number.isFinite(parentCategoryId ?? NaN);
  const blockedByDirty = Boolean(disabledReason);
  const createDisabled = !canCreate || blockedByDirty;

  const [opened, setOpened] = useState(false);
  const [pricingSpecId, setPricingSpecId] = useState(
    pricingSpecOptions?.[0]?.value || ""
  );
  const [anchorPrice, setAnchorPrice] = useState<number | "">("");
  const [subCategoryId, setSubCategoryId] = useState(
    parentSubCategoryId != null ? String(parentSubCategoryId) : ""
  );
  const [nameOverride, setNameOverride] = useState("");
  const [saving, setSaving] = useState(false);

  const parentSummary = useMemo(() => {
    const cat = categoryLabel || "—";
    const sub = subCategoryLabel ? ` · ${subCategoryLabel}` : "";
    return `${cat}${sub}`;
  }, [categoryLabel, subCategoryLabel]);

  const handleSubmit = useCallback(async () => {
    if (blockedByDirty) return;
    if (!Number.isFinite(parentProductId)) return;
    if (!pricingSpecId) {
      notifications.show({
        color: "red",
        title: "Missing spec",
        message: "Choose a pricing spec.",
      });
      return;
    }
    const price = Number(anchorPrice);
    if (!Number.isFinite(price) || price <= 0) {
      notifications.show({
        color: "red",
        title: "Invalid price",
        message: "Anchor price must be greater than 0.",
      });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("_intent", "bom.createCmt");
      fd.set("parentProductId", String(parentProductId));
      fd.set("pricingSpecId", pricingSpecId);
      fd.set("anchorPrice", String(price));
      if (subCategoryId) fd.set("subCategoryId", subCategoryId);
      if (nameOverride.trim()) fd.set("name", nameOverride.trim());
      const resp = await fetch(`/products/${parentProductId}`, {
        method: "POST",
        body: fd,
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        notifications.show({
          color: "red",
          title: "Create failed",
          message: data?.error || "Could not create CMT.",
        });
        return;
      }
      notifications.show({
        color: "teal",
        title: "Created",
        message: "Created CMT and added to BOM (tiers generated).",
      });
      setOpened(false);
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }, [
    anchorPrice,
    blockedByDirty,
    nameOverride,
    onSuccess,
    parentProductId,
    pricingSpecId,
    subCategoryId,
  ]);

  if (!isFinished || hasCmtLine) return null;

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text>No CMT line on this BOM.</Text>
        <Tooltip label={disabledReason} disabled={!blockedByDirty} withArrow>
          <span>
            <Button
              size="xs"
              variant="light"
              onClick={() => setOpened(true)}
              disabled={createDisabled}
            >
              Create CMT…
            </Button>
          </span>
        </Tooltip>
      </Group>
      {!canCreate ? (
        <Text size="sm" c="dimmed">
          Set a category on the Finished product to enable CMT creation.
        </Text>
      ) : null}
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Create CMT from BOM"
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Parent category: {parentSummary}
          </Text>
          <Text size="sm" c="dimmed">
            Creates a new CMT product immediately. Save/Discard current edits
            separately.
          </Text>
          <Select
            label="Pricing Spec"
            data={pricingSpecOptions}
            value={pricingSpecId}
            onChange={(v) => setPricingSpecId(v || "")}
            placeholder="Select MOQ spec"
            searchable={false}
            required
          />
          <NumberInput
            label="Anchor Price (at MOQ)"
            value={anchorPrice}
            onChange={setAnchorPrice}
            min={0}
            decimalScale={4}
            hideControls
            required
          />
          <Select
            label="Subcategory Override"
            data={subCategoryOptions}
            value={subCategoryId}
            onChange={(v) => setSubCategoryId(v || "")}
            placeholder="Use parent subcategory"
            clearable
            searchable
          />
          <TextInput
            label="Name Override"
            value={nameOverride}
            onChange={(e) => setNameOverride(e.currentTarget.value)}
            placeholder="Optional"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Tooltip label={disabledReason} disabled={!blockedByDirty} withArrow>
              <span>
                <Button
                  onClick={handleSubmit}
                  loading={saving}
                  disabled={createDisabled}
                >
                  Create
                </Button>
              </span>
            </Tooltip>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
