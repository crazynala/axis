import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, Group, Radio, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { Controller, useForm, useWatch } from "react-hook-form";
import { HotkeyAwareModal as Modal } from "~/base/hotkeys/HotkeyAwareModal";
import { buildAssemblyActivityDefaultValues, serializeAssemblyActivityValues, type AssemblyActivityFormValues } from "~/modules/job/forms/jobAssemblyActivityMarshaller";
import type { QuantityItem } from "~/modules/job/components/AssembliesEditor";
import { useFetcher } from "@remix-run/react";
import { showToastError, showToastSuccess } from "~/utils/toast";
import { formatAddressLines } from "~/utils/addressFormat";
import { AddressPickerField } from "~/components/addresses/AddressPickerField";
import { resolveEffectiveShipTo } from "~/modules/job/services/shipTo.shared";

const formatLabel = (label: string | undefined, index: number) => (label && label.trim() ? label : `Variant ${index + 1}`);

const sumArray = (arr: number[]) => arr.reduce((total, value) => total + (Number(value) || 0), 0);

type PackFormValues = AssemblyActivityFormValues & {
  boxMode: "existing" | "new";
  existingBoxId?: string;
  boxNumber?: string;
  boxDescription?: string;
  boxNotes?: string;
  destinationType: "address" | "location";
  destinationAddressId?: number | null;
  destinationLocationId?: number | null;
};

type AssemblyPackModalProps = {
  opened: boolean;
  onClose: () => void;
  assembly: any;
  variantLabels: string[];
  quantityItem?: QuantityItem;
  stockLocationName?: string | null;
  shipToAddresses: Array<{
    id: number;
    name: string | null;
    addressLine1: string | null;
    addressTownCity: string | null;
    addressCountyState: string | null;
    addressZipPostCode: string | null;
    addressCountry: string | null;
  }>;
  locations: Array<{ id: number; name: string | null; type: string | null }>;
};

type BoxLookup = {
  id: number;
  warehouseNumber: number | null;
  state: string | null;
  shipmentId: number | null;
  companyId: number | null;
  location?: { id: number; name: string | null } | null;
  destinationAddressId?: number | null;
  destinationLocationId?: number | null;
  destinationAddress?: {
    id: number;
    name: string | null;
    addressLine1: string | null;
    addressTownCity: string | null;
    addressCountyState: string | null;
    addressZipPostCode: string | null;
    addressCountry: string | null;
  } | null;
  destinationLocation?: { id: number; name: string | null; type: string | null } | null;
  _count?: { lines: number };
};

export function AssemblyPackModal({ opened, onClose, assembly, variantLabels, quantityItem, stockLocationName, shipToAddresses, locations }: AssemblyPackModalProps) {
  const fetcher = useFetcher();
  const lookupFetcher = useFetcher<{ box?: BoxLookup | null; error?: string }>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [createShortfall, setCreateShortfall] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupBox, setLookupBox] = useState<BoxLookup | null>(null);
  const [lookupAttempted, setLookupAttempted] = useState(false);
  const jobCompanyId = assembly?.job?.company?.id ?? null;
  const resolvedDestination = useMemo(() => resolveEffectiveShipTo(assembly?.job ?? null, assembly ?? null), [assembly]);
  const baseLabels = useMemo(() => {
    if (variantLabels.length) return variantLabels;
    const fromQuantityItem = quantityItem?.variants?.labels || [];
    if (fromQuantityItem.length) return fromQuantityItem;
    return [] as string[];
  }, [variantLabels, quantityItem?.variants?.labels]);

  const finishBreakdown = useMemo(() => {
    const finish = (quantityItem as any)?.stageStats?.finish?.processedArr || quantityItem?.finish || [];
    const len = Math.max(baseLabels.length, finish.length, 1);
    return Array.from({ length: len }, (_, idx) => Number(finish[idx] ?? 0) || 0);
  }, [baseLabels.length, quantityItem]);

  const packedBreakdown = useMemo(() => {
    const packed = (quantityItem as any)?.stageStats?.pack?.processedArr || quantityItem?.pack || [];
    const len = Math.max(baseLabels.length, packed.length, 1);
    return Array.from({ length: len }, (_, idx) => Number(packed[idx] ?? 0) || 0);
  }, [baseLabels.length, quantityItem]);

  const availableBreakdown = useMemo(() => {
    const len = Math.max(baseLabels.length, finishBreakdown.length, packedBreakdown.length);
    return Array.from({ length: len }, (_, idx) => {
      const completed = Number(finishBreakdown[idx] || 0);
      const alreadyPacked = Number(packedBreakdown[idx] || 0);
      return Math.max(0, completed - alreadyPacked);
    });
  }, [baseLabels.length, finishBreakdown, packedBreakdown]);
  const defaultValues = useMemo(() => {
    const base = buildAssemblyActivityDefaultValues({
      mode: "create",
      initialDate: new Date(),
      defaultBreakdown: availableBreakdown,
      initialBreakdown: null,
      initialConsumption: null,
    });
    const suggestedMode: "existing" | "new" = "new";
    const destinationType = resolvedDestination?.kind === "location" ? "location" : "address";
    return {
      ...base,
      boxMode: suggestedMode,
      existingBoxId: "",
      boxNumber: "",
      boxDescription: assembly?.name || "",
      boxNotes: "",
      destinationType,
      destinationAddressId: resolvedDestination?.kind === "address" ? resolvedDestination.id : null,
      destinationLocationId: resolvedDestination?.kind === "location" ? resolvedDestination.id : null,
    } as PackFormValues;
  }, [availableBreakdown, assembly?.name, resolvedDestination]);

  const form = useForm<PackFormValues>({
    defaultValues,
  });

  useEffect(() => {
    if (!opened) {
      setServerError(null);
      return;
    }
    if (!opened) return;
    form.reset(defaultValues);
    setServerError(null);
    setConfirmOverride(false);
    setCreateShortfall(true);
  }, [opened, defaultValues, form]);

  const qtyBreakdownValues = useWatch({ control: form.control, name: "qtyBreakdown" }) || [];
  const tableLabels = useMemo(() => {
    if (baseLabels.length) return baseLabels;
    const fallbackLength = Math.max(qtyBreakdownValues.length, availableBreakdown.length, 1);
    return Array.from({ length: fallbackLength }, (_, idx) => `Variant ${idx + 1}`);
  }, [baseLabels, qtyBreakdownValues.length, availableBreakdown.length]);

  const boxMode = useWatch({ control: form.control, name: "boxMode" });
  const existingBoxId = useWatch({
    control: form.control,
    name: "existingBoxId",
  });
  const boxNumber = useWatch({ control: form.control, name: "boxNumber" }) || "";
  const destinationType = useWatch({
    control: form.control,
    name: "destinationType",
  });
  const destinationAddressId = useWatch({
    control: form.control,
    name: "destinationAddressId",
  });
  const destinationLocationId = useWatch({
    control: form.control,
    name: "destinationLocationId",
  });
  const boxNotes = useWatch({ control: form.control, name: "boxNotes" }) || "";
  const enteredBreakdown = qtyBreakdownValues.map((entry) => Number(entry?.value || 0));

  const unitsEntered = sumArray(enteredBreakdown);
  const totalAvailable = sumArray(availableBreakdown);
  const totalFinish = sumArray(finishBreakdown);
  const totalPacked = sumArray(packedBreakdown);
  const remainingAfterPack = Math.max(0, totalAvailable - unitsEntered);
  const exceedsAvailable = unitsEntered > totalAvailable;
  const hasUnits = unitsEntered > 0;
  const hasShortfall = !exceedsAvailable && hasUnits && remainingAfterPack > 0;
  const parsedBoxNumber = Number(String(boxNumber).trim());
  const hasBoxNumber = String(boxNumber).trim().length > 0;
  const boxNumberValid = hasBoxNumber && Number.isFinite(parsedBoxNumber);
  const existingBoxState = String(lookupBox?.state ?? "").toLowerCase();
  const existingBoxOpen = Boolean(lookupBox && existingBoxState === "open");
  const existingBoxAvailable = Boolean(lookupBox && existingBoxOpen);
  const needsExistingSelection = boxMode === "existing" && !existingBoxId;
  const missingLocation = boxMode === "new" && !stockLocationName;
  const hasOverrideNote = boxNotes.trim().length > 0;
  const destinationLocked = Boolean(lookupBox?.destinationAddressId || lookupBox?.destinationLocationId);
  const destinationMissing = !destinationLocked && ((destinationType === "address" && !destinationAddressId) || (destinationType === "location" && !destinationLocationId));
  const overfillMessage = useMemo(() => {
    const overfillIdx = enteredBreakdown.findIndex((qty, idx) => qty > (availableBreakdown[idx] ?? 0));
    if (overfillIdx >= 0) {
      return `Variant ${overfillIdx + 1}: cannot pack more than ready-to-pack quantity.`;
    }
    return null;
  }, [enteredBreakdown, availableBreakdown]);

  const disableSubmit =
    fetcher.state === "submitting" ||
    !hasUnits ||
    !boxNumberValid ||
    needsExistingSelection ||
    (boxMode === "existing" && !existingBoxAvailable) ||
    (boxMode === "new" && missingLocation) ||
    destinationMissing ||
    (exceedsAvailable && !(confirmOverride && hasOverrideNote));

  useEffect(() => {
    if (!hasShortfall && createShortfall) {
      setCreateShortfall(false);
    }
  }, [hasShortfall, createShortfall]);

  useEffect(() => {
    setLookupBox(null);
    setLookupError(null);
    setLookupAttempted(false);
    form.setValue("existingBoxId", "");
  }, [boxNumber, form]);

  useEffect(() => {
    if (!lookupFetcher.data) return;
    setLookupAttempted(true);
    setLookupError(lookupFetcher.data.error ?? null);
    setLookupBox(lookupFetcher.data.box ?? null);
  }, [lookupFetcher.data]);

  useEffect(() => {
    if (!lookupBox) return;
    form.setValue("existingBoxId", String(lookupBox.id));
    form.setValue("boxMode", "existing");
    if (lookupBox.destinationAddressId) {
      form.setValue("destinationType", "address");
      form.setValue("destinationAddressId", lookupBox.destinationAddressId);
      form.setValue("destinationLocationId", null);
    } else if (lookupBox.destinationLocationId) {
      form.setValue("destinationType", "location");
      form.setValue("destinationLocationId", lookupBox.destinationLocationId);
      form.setValue("destinationAddressId", null);
    }
  }, [lookupBox, form]);

  const onSubmit = form.handleSubmit((values) => {
    if (overfillMessage && !(confirmOverride && hasOverrideNote)) {
      showToastError(overfillMessage);
      return;
    }
    if (!boxNumberValid) {
      showToastError("Enter a valid box number.");
      return;
    }
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
      fd.set("warehouseNumber", String(parsedBoxNumber));
      fd.set("boxDescription", values.boxDescription ?? "");
    }
    if (values.boxNotes) fd.set("boxNotes", values.boxNotes);
    if (values.destinationType === "address" && values.destinationAddressId) {
      fd.set("destinationAddressId", String(values.destinationAddressId));
    }
    if (values.destinationType === "location" && values.destinationLocationId) {
      fd.set("destinationLocationId", String(values.destinationLocationId));
    }
    if (exceedsAvailable && confirmOverride && hasOverrideNote) {
      fd.set("allowOverpack", "1");
    }
    if (hasShortfall && createShortfall) {
      fd.set("createShortfall", "1");
    }
    fetcher.submit(fd, { method: "post" });
  });

  useEffect(() => {
    if (fetcher.data?.error) {
      showToastError(fetcher.data.error);
    }
    if (fetcher.data?.success) {
      showToastSuccess("Added to box");
      onClose();
    }
    setServerError(fetcher.data?.error ?? null);
  }, [fetcher.data, onClose]);

  const addressOptions = useMemo(
    () =>
      shipToAddresses.map((addr) => {
        const lines = formatAddressLines(addr);
        return {
          value: String(addr.id),
          label: lines.length ? lines.join(", ") : addr.name || `Address ${addr.id}`,
        };
      }),
    [shipToAddresses]
  );
  const addressById = useMemo(() => {
    const map = new Map<number, (typeof shipToAddresses)[number]>();
    shipToAddresses.forEach((addr) => map.set(addr.id, addr));
    return map;
  }, [shipToAddresses]);
  const locationOptions = useMemo(() => {
    return locations
      .filter((loc) => loc.type === "warehouse" || loc.type === "sample")
      .map((loc) => ({
        value: String(loc.id),
        label: loc.name || `Location ${loc.id}`,
      }));
  }, [locations]);
  const formatDestination = (box: BoxLookup | null) => {
    if (!box) return "—";
    if (box.destinationAddress) {
      const lines = formatAddressLines(box.destinationAddress);
      return lines.length ? lines.join(", ") : box.destinationAddress.name || `Address ${box.destinationAddress.id}`;
    }
    if (box.destinationLocation) {
      return box.destinationLocation.name || `Location ${box.destinationLocation.id}`;
    }
    return "Not set";
  };
  const handleLookup = () => {
    if (!boxNumberValid) {
      setLookupError("Enter a valid box number.");
      return;
    }
    if (!jobCompanyId) {
      setLookupError("Company is required to look up boxes.");
      return;
    }
    setLookupError(null);
    lookupFetcher.load(`/api/boxes/by-number?companyId=${jobCompanyId}&warehouseNumber=${parsedBoxNumber}`);
  };

  return (
    <Modal opened={opened} onClose={onClose} closeOnClickOutside={false} title="Add to box" size="xl" centered>
      <form onSubmit={onSubmit}>
        <Stack p="lg" gap="lg">
          <Group justify="space-between" align="flex-end">
            <Controller
              control={form.control}
              name="activityDate"
              render={({ field }) => <DatePickerInput label="Date" value={field.value} onChange={(value) => field.onChange(value ?? null)} valueFormat="YYYY-MM-DD" required />}
            />
            <Button type="submit" disabled={disableSubmit}>
              Save
            </Button>
          </Group>

          <Stack gap="xs">
            {serverError ? (
              <Alert color="red" variant="light">
                {serverError}
              </Alert>
            ) : null}
            <Text fw={600}>{assembly?.name || `Assembly ${assembly?.id}`}</Text>
            <Text size="sm" c="dimmed">
              Product: {(assembly?.product?.name as string) || "Unassigned"}
            </Text>
            <Text size="sm" c="dimmed">
              Location: {stockLocationName || "No stock location"}
            </Text>
            <Text size="sm">
              Finish recorded: {totalFinish.toLocaleString()} • Already packed: {totalPacked.toLocaleString()} • Ready to pack: {totalAvailable.toLocaleString()}
            </Text>
            <Text size="sm">
              Packing {unitsEntered} / {totalAvailable} ready-to-pack units
            </Text>
            {exceedsAvailable && (
              <Text size="sm" c="yellow.7">
                Entered above ready-to-pack. Add a reason and confirm to override.
              </Text>
            )}
            {overfillMessage ? (
              <Text size="sm" c="red.6">
                {overfillMessage}
              </Text>
            ) : null}
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
            {exceedsAvailable ? <Checkbox label="Override ready-to-pack limit" checked={confirmOverride} onChange={(e) => setConfirmOverride(e.currentTarget.checked)} /> : null}
            {hasShortfall ? (
              <Checkbox label={`Create shortfall for remaining ${remainingAfterPack} units`} checked={createShortfall} onChange={(e) => setCreateShortfall(e.currentTarget.checked)} />
            ) : null}
          </Stack>

          <Table withColumnBorders withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th ta="left">Row</Table.Th>
                {tableLabels.map((label, index) => (
                  <Table.Th key={`head-${index}`} ta="center">
                    {formatLabel(label, index)}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td fw={600}>Ready</Table.Td>
                {tableLabels.map((_, index) => (
                  <Table.Td key={`available-${index}`} ta="center">
                    {availableBreakdown[index] ?? 0}
                  </Table.Td>
                ))}
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={600}>Pack</Table.Td>
                {tableLabels.map((_, index) => {
                  const registration = form.register(`qtyBreakdown.${index}.value` as const);
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
            <Text fw={600}>Box</Text>
            <Group align="flex-end">
              <TextInput
                label="Box number"
                placeholder="Scan or enter box #"
                value={boxNumber}
                onChange={(e) => form.setValue("boxNumber", e.currentTarget.value)}
                error={hasBoxNumber && !boxNumberValid ? "Enter a valid number" : null}
                required
              />
              <Button variant="default" onClick={handleLookup} loading={lookupFetcher.state === "loading"}>
                Find box
              </Button>
            </Group>
            {lookupError ? (
              <Text size="sm" c="red.6">
                {lookupError}
              </Text>
            ) : null}
            {lookupAttempted && !lookupBox && !lookupError ? (
              <Text size="sm" c="dimmed">
                No existing box found for that number.
              </Text>
            ) : null}
            {lookupBox ? (
              <Stack gap={4}>
                <Text size="sm">
                  Existing box #{lookupBox.warehouseNumber ?? lookupBox.id} • {lookupBox.state || "unknown"} • Location{" "}
                  {lookupBox.location?.name || (lookupBox.location?.id != null ? `Location ${lookupBox.location.id}` : "—")}
                </Text>
                <Text size="sm" c="dimmed">
                  Destination: {formatDestination(lookupBox)}
                </Text>
                {!existingBoxOpen ? (
                  <Text size="sm" c="red.6">
                    Box is not open. Choose a different box number.
                  </Text>
                ) : null}
              </Stack>
            ) : null}
            <Controller
              control={form.control}
              name="boxMode"
              render={({ field }) => (
                <Radio.Group label="Mode" value={field.value} onChange={(value) => field.onChange(value as "existing" | "new")}>
                  <Stack gap={4}>
                    <Radio value="new" label="Create new box" disabled={Boolean(lookupBox)} />
                    <Radio value="existing" label="Add to existing box" disabled={!lookupBox} />
                  </Stack>
                </Radio.Group>
              )}
            />
            {lookupBox ? (
              <Text size="sm" c="yellow.7">
                Box number already exists — apply a new label or add to existing box.
              </Text>
            ) : null}
            {boxMode === "new" ? <TextInput label="Description" placeholder="Describe contents" {...form.register("boxDescription")} /> : null}
          </Stack>

          <Stack gap="sm">
            <Text fw={600}>Destination</Text>
            <Controller
              control={form.control}
              name="destinationType"
              render={({ field }) => (
                <Radio.Group value={field.value} onChange={(value) => field.onChange(value as "address" | "location")} label="Destination type">
                  <Group gap="md">
                    <Radio value="address" label="Address" disabled={destinationLocked} />
                    <Radio value="location" label="Location" disabled={destinationLocked} />
                  </Group>
                </Radio.Group>
              )}
            />
            {destinationLocked ? (
              <Text size="sm" c="dimmed">
                Destination locked from existing box.
              </Text>
            ) : null}
            {destinationType === "address" ? (
              <AddressPickerField
                label="Destination address"
                value={destinationAddressId ?? null}
                options={addressOptions}
                previewAddress={destinationAddressId != null ? addressById.get(Number(destinationAddressId)) ?? null : null}
                onChange={(nextId) => {
                  form.setValue("destinationAddressId", nextId);
                }}
                disabled={destinationLocked}
                showOpenLink={false}
              />
            ) : (
              <Select
                label="Destination location"
                placeholder="Select location"
                data={locationOptions}
                value={destinationLocationId != null ? String(destinationLocationId) : null}
                onChange={(value) => {
                  if (!value) {
                    form.setValue("destinationLocationId", null);
                    return;
                  }
                  const parsed = Number(value);
                  form.setValue("destinationLocationId", Number.isFinite(parsed) ? parsed : null);
                }}
                disabled={destinationLocked}
                searchable
              />
            )}
            {destinationMissing ? (
              <Text size="sm" c="red.6">
                Select a destination to continue.
              </Text>
            ) : null}
          </Stack>

          <TextInput label="Notes" placeholder="Optional notes" {...form.register("boxNotes")} />
          {exceedsAvailable && !hasOverrideNote ? (
            <Text size="xs" c="dimmed">
              Add a note to justify the override.
            </Text>
          ) : null}

          <Text size="sm" c="dimmed">
            Units after pack: {remainingAfterPack}
          </Text>
        </Stack>
      </form>
    </Modal>
  );
}
