import { useEffect, useMemo } from "react";
import {
  Button,
  Group,
  Radio,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { Controller, useForm, useWatch } from "react-hook-form";
import { HotkeyAwareModal as Modal } from "~/base/hotkeys/HotkeyAwareModal";
import {
  buildAssemblyActivityDefaultValues,
  serializeAssemblyActivityValues,
  type AssemblyActivityFormValues,
} from "~/modules/job/forms/jobAssemblyActivityMarshaller";
import type { QuantityItem } from "~/modules/job/components/AssembliesEditor";
import type { PackBoxSummary } from "~/modules/job/types/pack";
import { useSubmit } from "@remix-run/react";

const formatLabel = (label: string | undefined, index: number) =>
  label && label.trim() ? label : `Variant ${index + 1}`;

const sumArray = (arr: number[]) =>
  arr.reduce((total, value) => total + (Number(value) || 0), 0);

type PackFormValues = AssemblyActivityFormValues & {
  boxMode: "existing" | "new";
  existingBoxId?: string;
  warehouseNumber?: string;
  boxDescription?: string;
  boxNotes?: string;
};

type AssemblyPackModalProps = {
  opened: boolean;
  onClose: () => void;
  assembly: any;
  variantLabels: string[];
  quantityItem?: QuantityItem;
  stockLocationName?: string | null;
  openBoxes: PackBoxSummary[];
};

export function AssemblyPackModal({
  opened,
  onClose,
  assembly,
  variantLabels,
  quantityItem,
  stockLocationName,
  openBoxes,
}: AssemblyPackModalProps) {
  const submit = useSubmit();
  const baseLabels = useMemo(() => {
    if (variantLabels.length) return variantLabels;
    const fromQuantityItem = quantityItem?.variants?.labels || [];
    if (fromQuantityItem.length) return fromQuantityItem;
    return [] as string[];
  }, [variantLabels, quantityItem?.variants?.labels]);

  const availableBreakdown = useMemo(() => {
    const make = quantityItem?.make || [];
    const packed = quantityItem?.pack || [];
    const len = Math.max(baseLabels.length, make.length, packed.length);
    return Array.from({ length: len }, (_, idx) => {
      const made = Number(make[idx] || 0);
      const alreadyPacked = Number(packed[idx] || 0);
      return Math.max(0, made - alreadyPacked);
    });
  }, [baseLabels.length, quantityItem?.make, quantityItem?.pack]);
  const defaultValues = useMemo(() => {
    const base = buildAssemblyActivityDefaultValues({
      mode: "create",
      initialDate: new Date(),
      defaultBreakdown: availableBreakdown,
      initialBreakdown: null,
      initialConsumption: null,
    });
    const suggestedMode: "existing" | "new" = openBoxes.length
      ? "existing"
      : "new";
    return {
      ...base,
      boxMode: suggestedMode,
      existingBoxId: openBoxes[0] ? String(openBoxes[0].id) : "",
      warehouseNumber: "",
      boxDescription: assembly?.name || "",
      boxNotes: "",
    } as PackFormValues;
  }, [availableBreakdown, openBoxes, assembly?.name]);

  const form = useForm<PackFormValues>({
    defaultValues,
  });

  useEffect(() => {
    if (!opened) return;
    form.reset(defaultValues);
  }, [opened, defaultValues, form]);

  const qtyBreakdownValues =
    useWatch({ control: form.control, name: "qtyBreakdown" }) || [];
  const tableLabels = useMemo(() => {
    if (baseLabels.length) return baseLabels;
    const fallbackLength = Math.max(
      qtyBreakdownValues.length,
      availableBreakdown.length,
      1
    );
    return Array.from(
      { length: fallbackLength },
      (_, idx) => `Variant ${idx + 1}`
    );
  }, [baseLabels, qtyBreakdownValues.length, availableBreakdown.length]);

  const boxMode = useWatch({ control: form.control, name: "boxMode" });
  const existingBoxId = useWatch({
    control: form.control,
    name: "existingBoxId",
  });
  const enteredBreakdown = qtyBreakdownValues.map((entry) =>
    Number(entry?.value || 0)
  );

  const unitsEntered = sumArray(enteredBreakdown);
  const totalAvailable = sumArray(availableBreakdown);
  const remainingAfterPack = Math.max(0, totalAvailable - unitsEntered);
  const exceedsAvailable = unitsEntered > totalAvailable;
  const hasUnits = unitsEntered > 0;
  const needsExistingSelection = boxMode === "existing" && !existingBoxId;
  const missingLocation = boxMode === "new" && !stockLocationName;
  const disableSubmit =
    !hasUnits || exceedsAvailable || needsExistingSelection || missingLocation;

  const onSubmit = form.handleSubmit((values) => {
    const fd = serializeAssemblyActivityValues(values, {
      mode: "create",
      activityType: "pack",
    });
    if (assembly?.id != null) {
      fd.set("assemblyId", String(assembly.id));
    }
    fd.set("boxMode", values.boxMode);
    if (values.boxMode === "existing" && values.existingBoxId) {
      fd.set("existingBoxId", values.existingBoxId);
    }
    if (values.boxMode === "new") {
      fd.set("warehouseNumber", values.warehouseNumber ?? "");
      fd.set("boxDescription", values.boxDescription ?? "");
    }
    if (values.boxNotes) fd.set("boxNotes", values.boxNotes);
    submit(fd, { method: "post" });
    onClose();
  });

  const boxOptions = openBoxes.map((box) => ({
    value: String(box.id),
    label: box.warehouseNumber
      ? `#${box.warehouseNumber} • ${box.totalQuantity} units`
      : `Box ${box.id} • ${box.totalQuantity} units`,
  }));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnClickOutside={false}
      title="Record Pack"
      size="xl"
      centered
    >
      <form onSubmit={onSubmit}>
        <Stack p="lg" gap="lg">
          <Group justify="space-between" align="flex-end">
            <Controller
              control={form.control}
              name="activityDate"
              render={({ field }) => (
                <DatePickerInput
                  label="Date"
                  value={field.value}
                  onChange={(value) => field.onChange(value ?? null)}
                  valueFormat="YYYY-MM-DD"
                  required
                />
              )}
            />
            <Button type="submit" disabled={disableSubmit}>
              Save
            </Button>
          </Group>

          <Stack gap="xs">
            <Text fw={600}>{assembly?.name || `Assembly ${assembly?.id}`}</Text>
            <Text size="sm" c="dimmed">
              Product: {(assembly?.product?.name as string) || "Unassigned"}
            </Text>
            <Text size="sm" c="dimmed">
              Location: {stockLocationName || "No stock location"}
            </Text>
            <Text size="sm">
              Packing {unitsEntered} / {totalAvailable} available units
            </Text>
            {exceedsAvailable && (
              <Text size="sm" c="red.6">
                Cannot pack more than available.
              </Text>
            )}
            {needsExistingSelection && (
              <Text size="sm" c="red.6">
                Select a box to continue.
              </Text>
            )}
            {missingLocation && (
              <Text size="sm" c="red.6">
                Set a stock location on the job before creating a box.
              </Text>
            )}
          </Stack>

          <Table withColumnBorders withTableBorder>
            <Table.Thead>
              <Table.Tr>
                {tableLabels.map((label, index) => (
                  <Table.Th key={`head-${index}`} ta="center">
                    {formatLabel(label, index)}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                {tableLabels.map((_, index) => (
                  <Table.Td key={`available-${index}`} ta="center">
                    {availableBreakdown[index] ?? 0}
                  </Table.Td>
                ))}
              </Table.Tr>
              <Table.Tr>
                {tableLabels.map((_, index) => {
                  const registration = form.register(
                    `qtyBreakdown.${index}.value` as const
                  );
                  return (
                    <Table.Td key={`pack-${index}`} p={0} ta="center">
                      <TextInput
                        type="number"
                        variant="unstyled"
                        inputMode="numeric"
                        {...registration}
                        styles={{
                          input: {
                            textAlign: "center",
                            width: "100%",
                            height: "100%",
                            padding: 0,
                          },
                        }}
                      />
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            </Table.Tbody>
          </Table>

          <Stack gap="sm">
            <Controller
              control={form.control}
              name="boxMode"
              render={({ field }) => (
                <Radio.Group
                  label="Select box mode"
                  value={field.value}
                  onChange={(value) =>
                    field.onChange(value as "existing" | "new")
                  }
                >
                  <Stack gap={4}>
                    <Radio
                      value="new"
                      label={`Create new box${
                        stockLocationName ? ` at ${stockLocationName}` : ""
                      }`}
                    />
                    <Radio
                      value="existing"
                      label="Use existing box"
                      disabled={!openBoxes.length}
                    />
                  </Stack>
                </Radio.Group>
              )}
            />

            {boxMode === "existing" ? (
              <Controller
                control={form.control}
                name="existingBoxId"
                render={({ field }) => (
                  <Select
                    label="Open boxes"
                    placeholder={
                      openBoxes.length ? "Select box" : "No open boxes"
                    }
                    data={boxOptions}
                    value={field.value || null}
                    onChange={(value) => field.onChange(value ?? "")}
                  />
                )}
              />
            ) : (
              <Stack gap="sm">
                <TextInput
                  label="Warehouse number"
                  placeholder="e.g. 112"
                  {...form.register("warehouseNumber")}
                />
                <TextInput
                  label="Description"
                  placeholder="Describe contents"
                  {...form.register("boxDescription")}
                />
              </Stack>
            )}

            <TextInput
              label="Notes"
              placeholder="Optional notes"
              {...form.register("boxNotes")}
            />
          </Stack>

          <Text size="sm" c="dimmed">
            Units after pack: {remainingAfterPack}
          </Text>
        </Stack>
      </form>
    </Modal>
  );
}
