import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Outlet,
  useActionData,
  useFetcher,
  useMatches,
  useRouteLoaderData,
  useSubmit,
} from "@remix-run/react";
import { prisma } from "../../../utils/prisma.server";
import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import { useRecordContext } from "../../../base/record/RecordContext";
import {
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure, useDebouncedValue } from "@mantine/hooks";
import { useForm, useWatch } from "react-hook-form";
import { Fragment, useEffect, useMemo, useState, useRef } from "react";
import { ShipmentDetailForm } from "../forms/ShipmentDetailForm";
import { AttachBoxesModal } from "../components/AttachBoxesModal";
import { resolveVariantSourceFromLine } from "../../../utils/variantBreakdown";
import { formatAddressLines } from "~/utils/addressFormat";
import {
  assertAddressAllowedForShipment,
  getCompanyAddressOptions,
  getContactAddressOptions,
} from "~/utils/addressOwnership.server";

const ALLOWED_BOX_STATES = new Set(["open", "sealed"]);
const LOCKED_SHIPMENT_STATUSES = new Set(["COMPLETE", "CANCELED"]);

function isShipmentLocked(status: string | null | undefined) {
  return status != null && LOCKED_SHIPMENT_STATUSES.has(status);
}

function buildShipmentLineKey(
  jobId: number | null,
  assemblyId: number | null,
  productId: number | null,
  variantSetId: number | null
) {
  return [
    jobId ?? "null",
    assemblyId ?? "null",
    productId ?? "null",
    variantSetId ?? "null",
  ].join("|");
}

function sumNumberArray(values: number[]): number {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function mergeBreakdowns(existing: number[], incoming: number[]): number[] {
  const length = Math.max(existing.length, incoming.length);
  return Array.from({ length }, (_, index) => {
    const prev = Number(existing[index] ?? 0) || 0;
    const next = Number(incoming[index] ?? 0) || 0;
    return prev + next;
  });
}

function lineQuantityOrSum(line: {
  quantity: any;
  qtyBreakdown: number[] | null;
}) {
  const qtyNumber = Number(line.quantity ?? 0);
  if (Number.isFinite(qtyNumber) && qtyNumber !== 0) return qtyNumber;
  return sumNumberArray(
    Array.isArray(line.qtyBreakdown) ? line.qtyBreakdown : []
  );
}

function parseBoxIdList(value: FormDataEntryValue | null): number[] {
  if (value == null) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry)) as number[]
      )
    );
  } catch {
    return [];
  }
}

async function buildShipmentAddressSnapshot(addressId: number | null) {
  if (addressId == null) {
    return {
      addressIdShip: null,
      addressName: null,
      addressCountry: null,
      addressCountyState: null,
      addressLine1: null,
      addressLine2: null,
      addressLine3: null,
      addressTownCity: null,
      addressZipPostCode: null,
    };
  }
  const address = await prisma.address.findUnique({
    where: { id: addressId },
    select: {
      id: true,
      name: true,
      addressCountry: true,
      addressCountyState: true,
      addressLine1: true,
      addressLine2: true,
      addressLine3: true,
      addressTownCity: true,
      addressZipPostCode: true,
    },
  });
  if (!address) {
    return {
      addressIdShip: null,
      addressName: null,
      addressCountry: null,
      addressCountyState: null,
      addressLine1: null,
      addressLine2: null,
      addressLine3: null,
      addressTownCity: null,
      addressZipPostCode: null,
    };
  }
  return {
    addressIdShip: address.id,
    addressName: address.name ?? null,
    addressCountry: address.addressCountry ?? null,
    addressCountyState: address.addressCountyState ?? null,
    addressLine1: address.addressLine1 ?? null,
    addressLine2: address.addressLine2 ?? null,
    addressLine3: address.addressLine3 ?? null,
    addressTownCity: address.addressTownCity ?? null,
    addressZipPostCode: address.addressZipPostCode ?? null,
  };
}

function buildAddressOptionLabel(address: {
  id: number;
  name: string | null;
  addressLine1: string | null;
  addressTownCity: string | null;
  addressCountyState: string | null;
  addressZipPostCode: string | null;
  addressCountry?: string | null;
}) {
  const lines = formatAddressLines(address);
  const base = lines[0] || address.addressLine1 || `Address ${address.id}`;
  const tail = lines.slice(1).join(", ");
  return tail ? `${base} — ${tail}` : base;
}

async function loadShipToAddressOptions(args: {
  companyIdReceiver: number | null;
  contactIdReceiver: number | null;
}) {
  const companyId = args.companyIdReceiver;
  const contactId = args.contactIdReceiver;
  if (!companyId && !contactId) return [];
  const [companyAddresses, contactAddresses] = await Promise.all([
    companyId ? getCompanyAddressOptions(companyId) : Promise.resolve([]),
    contactId ? getContactAddressOptions(contactId) : Promise.resolve([]),
  ]);
  const merged = [...companyAddresses, ...contactAddresses];
  return merged.map((address) => ({
    value: String(address.id),
    label: buildAddressOptionLabel(address),
  }));
}

type ShipmentLoaderData = NonNullable<
  ReturnType<typeof useRouteLoaderData<typeof loader>>
>;

function useShipmentLoaderDataSafe(): ShipmentLoaderData {
  const dataFromModules = useRouteLoaderData<typeof loader>(
    "modules/shipment/routes/shipments.$id"
  );
  const dataFromRoutes = useRouteLoaderData<typeof loader>("routes/shipments.$id");
  const matches = useMatches();
  const matchData = matches.find((m) => (m.data as any)?.shipment)?.data as
    | ShipmentLoaderData
    | undefined;
  const data = dataFromModules ?? dataFromRoutes ?? matchData;
  if (!data) {
    throw new Error("Shipment loader data missing for shipments.$id");
  }
  return data;
}

type AddBoxItemModalProps = {
  opened: boolean;
  onClose: () => void;
  boxId: number | null;
};

function AddBoxItemModal({ opened, onClose, boxId }: AddBoxItemModalProps) {
  const submit = useSubmit();
  const [mode, setMode] = useState<"product" | "adHoc">("product");
  const [productSearch, setProductSearch] = useState<string>("");
  const [productId, setProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | "">(1);
  const [description, setDescription] = useState<string>("");
  const [debouncedSearch] = useDebouncedValue(productSearch, 200);
  const productFetcher = useFetcher<{ results: any[] }>();

  useEffect(() => {
    if (!opened) return;
    setMode("product");
    setProductSearch("");
    setProductId(null);
    setQuantity(1);
    setDescription("");
  }, [opened]);

  useEffect(() => {
    if (!opened) return;
    if (!debouncedSearch || debouncedSearch.length < 2) return;
    productFetcher.load(
      `/api.products.search?q=${encodeURIComponent(debouncedSearch)}`
    );
  }, [debouncedSearch, opened, productFetcher]);

  const productOptions =
    productFetcher.data?.results?.map((p) => ({
      value: String(p.id),
      label: p.name ? `${p.sku} — ${p.name}` : p.sku,
    })) || [];

  const handleSubmit = () => {
    if (!boxId) return;
    if (mode === "product" && !productId) return;
    if (mode === "adHoc" && !description.trim()) return;
    const fd = new FormData();
    fd.set("_intent", "box.addLine");
    fd.set("boxId", String(boxId));
    fd.set("mode", mode);
    fd.set("quantity", quantity === "" ? "0" : String(quantity));
    if (mode === "product" && productId) fd.set("productId", productId);
    if (mode === "adHoc") fd.set("description", description.trim());
    submit(fd, { method: "post" });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Add item to box" centered>
      <Stack gap="md">
        <SegmentedControl
          value={mode}
          onChange={(value) => setMode(value as "product" | "adHoc")}
          data={[
            { value: "product", label: "Add Product" },
            { value: "adHoc", label: "Ad Hoc" },
          ]}
        />
        {mode === "product" ? (
          <Stack gap="sm">
            <Select
              label="Product"
              placeholder="Search products"
              searchable
              data={productOptions}
              value={productId}
              onChange={setProductId}
              searchValue={productSearch}
              onSearchChange={setProductSearch}
              nothingFound={
                productSearch.length < 2
                  ? "Start typing..."
                  : "No matching products"
              }
            />
            <NumberInput
              label="Quantity"
              min={0}
              value={quantity}
              onChange={setQuantity}
            />
          </Stack>
        ) : (
          <Stack gap="sm">
            <TextInput
              label="Description"
              placeholder="e.g. Fabric swatches – styles 2103, 2107, 3260"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
            <NumberInput
              label="Quantity"
              min={0}
              value={quantity}
              onChange={setQuantity}
            />
          </Stack>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !boxId ||
              (mode === "product" ? !productId : !description.trim()) ||
              !Number(quantity)
            }
          >
            Add
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

async function attachBoxesToShipment(shipmentId: number, boxIds: number[]) {
  if (!Number.isFinite(shipmentId)) return;
  const normalizedIds = Array.from(
    new Set(boxIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)))
  ) as number[];
  if (!normalizedIds.length) return;
  await prisma.$transaction(async (tx) => {
    const shipmentRecord = await tx.shipment.findUnique({
      where: { id: shipmentId },
      select: { id: true, locationId: true, packMode: true, type: true },
    });
    if (!shipmentRecord) {
      throw new Error("Shipment not found");
    }
    const isBoxMode = (shipmentRecord.packMode || "line") === "box";
    if (shipmentRecord.type !== "Out" || !isBoxMode) {
      throw new Error(
        "Boxes can only be attached to outbound shipments in box mode"
      );
    }
    const boxes = await tx.box.findMany({
      where: { id: { in: normalizedIds } },
      include: {
        location: { select: { id: true } },
        company: { select: { id: true, name: true } },
        lines: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            qtyBreakdown: true,
            jobId: true,
            assemblyId: true,
            description: true,
            isAdHoc: true,
            packingOnly: true,
            assembly: {
              select: {
                id: true,
                name: true,
                variantSetId: true,
                variantSet: {
                  select: { id: true, name: true, variants: true },
                },
              },
            },
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                variantSetId: true,
                variantSet: {
                  select: { id: true, name: true, variants: true },
                },
              },
            },
          },
        },
      },
    });
    if (boxes.length !== normalizedIds.length) {
      throw new Error("One or more boxes could not be loaded");
    }
    const invalidBox = boxes.find((box) => {
      const state = String(box.state ?? "").toLowerCase();
      const wrongLocation =
        shipmentRecord.locationId != null &&
        shipmentRecord.locationId !== box.locationId;
      return (
        box.shipmentId != null ||
        wrongLocation ||
        !ALLOWED_BOX_STATES.has(state)
      );
    });
    if (invalidBox) {
      throw new Error("Selected boxes are no longer available");
    }
    const maxNumber = await tx.box.aggregate({
      where: { shipmentId },
      _max: { shipmentNumber: true },
    });
    let nextShipmentNumber = (maxNumber._max.shipmentNumber ?? 0) + 1;
    const maxShipmentLine = await tx.shipmentLine.aggregate({
      _max: { id: true },
    });
    let nextShipmentLineId = (maxShipmentLine._max.id || 0) + 1;
    type Group = {
      jobId: number | null;
      assemblyId: number | null;
      productId: number | null;
      variantSetId: number | null;
      qtyBreakdown: number[];
      quantity: number;
      boxLineIds: number[];
    };
    const groups = new Map<string, Group>();
    for (const box of boxes) {
      await tx.box.update({
        where: { id: box.id },
        data: {
          shipmentId,
          shipmentNumber: nextShipmentNumber++,
        },
      });
      for (const line of box.lines) {
        if (line.packingOnly) continue;
        const qtyBreakdown = Array.isArray(line.qtyBreakdown)
          ? (line.qtyBreakdown as number[])
          : [];
        const key = buildShipmentLineKey(
          line.jobId ?? null,
          line.assemblyId ?? null,
          line.productId ?? null,
          line.assembly?.variantSetId ?? null
        );
        if (!groups.has(key)) {
          groups.set(key, {
            jobId: line.jobId ?? null,
            assemblyId: line.assemblyId ?? null,
            productId: line.productId ?? null,
            variantSetId: line.assembly?.variantSetId ?? null,
            qtyBreakdown: [],
            quantity: 0,
            boxLineIds: [],
          });
        }
        const current = groups.get(key)!;
        current.qtyBreakdown = mergeBreakdowns(
          current.qtyBreakdown,
          qtyBreakdown
        );
        current.quantity += lineQuantityOrSum({
          quantity: line.quantity,
          qtyBreakdown,
        });
        current.boxLineIds.push(line.id);
      }
    }
    const existingLines = await tx.shipmentLine.findMany({
      where: { shipmentId },
      select: {
        id: true,
        jobId: true,
        assemblyId: true,
        productId: true,
        variantSetId: true,
        qtyBreakdown: true,
        quantity: true,
      },
    });
    const existingMap = new Map(
      existingLines.map((line) => [
        buildShipmentLineKey(
          line.jobId ?? null,
          line.assemblyId ?? null,
          line.productId ?? null,
          line.variantSetId ?? null
        ),
        line,
      ])
    );
    for (const group of groups.values()) {
      const key = buildShipmentLineKey(
        group.jobId,
        group.assemblyId,
        group.productId,
        group.variantSetId
      );
      const existing = existingMap.get(key);
      let shipmentLineId: number;
      if (existing) {
        const mergedBreakdown = mergeBreakdowns(
          Array.isArray(existing.qtyBreakdown)
            ? (existing.qtyBreakdown as number[])
            : [],
          group.qtyBreakdown
        );
        const updated = await tx.shipmentLine.update({
          where: { id: existing.id },
          data: {
            qtyBreakdown: mergedBreakdown as any,
            quantity:
              Number(existing.quantity ?? 0) +
              (group.quantity || sumNumberArray(group.qtyBreakdown)),
          },
        });
        shipmentLineId = updated.id;
        existingMap.set(key, {
          ...updated,
          qtyBreakdown: mergedBreakdown as any,
        });
      } else {
        const created = await tx.shipmentLine.create({
          data: {
            id: nextShipmentLineId++,
            shipmentId,
            jobId: group.jobId ?? undefined,
            assemblyId: group.assemblyId ?? undefined,
            productId: group.productId ?? undefined,
            variantSetId: group.variantSetId ?? undefined,
            qtyBreakdown: group.qtyBreakdown as any,
            quantity: group.quantity || sumNumberArray(group.qtyBreakdown),
            status: "Packed",
          },
        });
        shipmentLineId = created.id;
        existingMap.set(key, created);
      }
      await tx.boxLine.updateMany({
        where: { id: { in: group.boxLineIds } },
        data: { shipmentLineId },
      });
    }
  });
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.shipment
      ? `Shipment ${data.shipment.trackingNo ?? data.shipment.id}`
      : "Shipment",
  },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid id", { status: 400 });
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      lines: { include: { product: true } },
      companyCarrier: { select: { id: true } },
      companySender: { select: { id: true } },
      companyReceiver: { select: { id: true } },
      // include name so we can populate read-only locationName in the form defaults
      location: { select: { id: true, name: true } },
    },
  });
  console.log("Returning shipment:", shipment);
  if (!shipment) return redirect("/shipments");
  const addressOptions = await loadShipToAddressOptions({
    companyIdReceiver: shipment.companyIdReceiver ?? null,
    contactIdReceiver: shipment.contactIdReceiver ?? null,
  });
  const [attachedBoxes, availableBoxes] = await Promise.all([
    prisma.box.findMany({
      where: { shipmentId: shipment.id },
      orderBy: { shipmentNumber: "asc" },
      include: {
        company: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        lines: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            productId: true,
            quantity: true,
            qtyBreakdown: true,
            jobId: true,
            assemblyId: true,
            shipmentLineId: true,
            description: true,
            isAdHoc: true,
            packingOnly: true,
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                variantSetId: true,
                variantSet: {
                  select: { id: true, name: true, variants: true },
                },
              },
            },
            job: { select: { id: true, name: true } },
            assembly: {
              select: {
                id: true,
                name: true,
                variantSetId: true,
                variantSet: {
                  select: { id: true, name: true, variants: true },
                },
              },
            },
          },
        },
      },
    }),
    shipment.locationId
      ? prisma.box.findMany({
          where: {
            shipmentId: null,
            locationId: shipment.locationId,
            state: { in: ["open", "sealed"] },
          },
          orderBy: [{ warehouseNumber: "asc" }, { id: "asc" }],
          include: {
            company: { select: { id: true, name: true } },
            location: { select: { id: true, name: true } },
            lines: {
              select: {
                id: true,
                productId: true,
                quantity: true,
                qtyBreakdown: true,
                jobId: true,
                assemblyId: true,
                shipmentLineId: true,
                description: true,
                isAdHoc: true,
                packingOnly: true,
                job: { select: { id: true, name: true } },
                product: {
                  select: {
                    id: true,
                    sku: true,
                    name: true,
                    variantSetId: true,
                    variantSet: {
                      select: { id: true, name: true, variants: true },
                    },
                  },
                },
                assembly: {
                  select: {
                    id: true,
                    name: true,
                    variantSetId: true,
                    variantSet: {
                      select: { id: true, name: true, variants: true },
                    },
                  },
                },
              },
            },
          },
        })
      : [],
  ]);
  return json({ shipment, attachedBoxes, availableBoxes, addressOptions });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const isNew = idRaw === "new";
  const id = !isNew && idRaw ? Number(idRaw) : NaN;
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  const lockIntents = new Set([
    "box.addLine",
    "box.updateLine",
    "shipment.update",
    "shipment.attachBoxes",
  ]);
  let shipmentStatus: string | null | undefined;
  let shipmentAddressId: number | null | undefined;
  if (
    !isNew &&
    (lockIntents.has(intent) ||
      intent === "shipment.markComplete" ||
      intent === "shipment.cancel")
  ) {
    if (!Number.isFinite(id)) throw new Error("Shipment id required");
    const current = await prisma.shipment.findUnique({
      where: { id },
      select: { status: true, addressIdShip: true },
    });
    if (!current) throw new Error("Shipment not found");
    shipmentStatus = current.status;
    shipmentAddressId = current.addressIdShip ?? null;
    if (isShipmentLocked(shipmentStatus) && lockIntents.has(intent)) {
      return json(
        { error: "Shipment is locked because it is COMPLETE/CANCELED." },
        { status: 400 }
      );
    }
    if (
      isShipmentLocked(shipmentStatus) &&
      (intent === "shipment.markComplete" || intent === "shipment.cancel")
    ) {
      return json(
        { error: "Shipment is already locked because it is COMPLETE/CANCELED." },
        { status: 400 }
      );
    }
  }
  if (intent === "shipment.markComplete") {
    if (!Number.isFinite(id)) throw new Error("Shipment id required");
    if (shipmentStatus !== "DRAFT") {
      return json(
        { error: "Shipment must be in DRAFT status to mark complete." },
        { status: 400 }
      );
    }
    const snapshot =
      shipmentAddressId != null
        ? await buildShipmentAddressSnapshot(shipmentAddressId)
        : {};
    await prisma.shipment.update({
      where: { id },
      data: {
        status: "COMPLETE",
        ...(snapshot as any),
      },
    });
    return redirect(`/shipments/${id}`);
  }
  if (intent === "shipment.cancel") {
    if (!Number.isFinite(id)) throw new Error("Shipment id required");
    if (shipmentStatus !== "DRAFT") {
      return json(
        { error: "Shipment must be in DRAFT status to cancel." },
        { status: 400 }
      );
    }
    await prisma.shipment.update({
      where: { id },
      data: { status: "CANCELED" },
    });
    return redirect(`/shipments/${id}`);
  }
  if (intent === "box.addLine") {
    const boxId = Number(form.get("boxId"));
    const mode = String(form.get("mode") || "product");
    const productIdRaw = form.get("productId");
    const description = (form.get("description") as string) || "";
    const qtyRaw = Number(form.get("quantity") ?? 0);
    const quantity = Number.isFinite(qtyRaw) ? qtyRaw : 0;
    if (!Number.isFinite(boxId)) throw new Error("Box id required");
    let redirectId = id;
    await prisma.$transaction(async (tx) => {
      const box = await tx.box.findUnique({
        where: { id: boxId },
        select: {
          id: true,
          shipmentId: true,
          shipment: { select: { id: true, type: true, packMode: true } },
        },
      });
      if (!box || !box.shipmentId) {
        throw new Error("Box must be attached to a shipment");
      }
      redirectId = box.shipmentId;
      if (box.shipment?.type !== "Out" || box.shipment?.packMode !== "box") {
        throw new Error(
          "Adding items only supported for outbound box-mode shipments"
        );
      }
      const packingOnly = mode === "adHoc";
      const isAdHoc = mode === "adHoc";
      let productId: number | null = null;
      let variantSetId: number | null = null;
      if (!packingOnly) {
        productId = Number(productIdRaw);
        if (!Number.isFinite(productId)) {
          throw new Error("Select a product to add");
        }
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { id: true, variantSetId: true },
        });
        if (!product) throw new Error("Product not found");
        variantSetId = product.variantSetId ?? null;
      }
      const created = await tx.boxLine.create({
        data: {
          boxId,
          productId: productId || undefined,
          description: description || null,
          isAdHoc,
          packingOnly,
          quantity,
        } as any,
      });
      if (!packingOnly && productId) {
        const existingLine = await tx.shipmentLine.findFirst({
          where: {
            shipmentId: box.shipmentId,
            productId,
            jobId: null,
            assemblyId: null,
            variantSetId,
          },
        });
        if (existingLine) {
          const updated = await tx.shipmentLine.update({
            where: { id: existingLine.id },
            data: {
              quantity: Number(existingLine.quantity ?? 0) + quantity,
            },
          });
          await tx.boxLine.update({
            where: { id: created.id },
            data: { shipmentLineId: updated.id },
          });
        } else {
          const maxLine = await tx.shipmentLine.aggregate({
            _max: { id: true },
          });
          const nextId = (maxLine._max.id || 0) + 1;
          const newLine = await tx.shipmentLine.create({
            data: {
              id: nextId,
              shipmentId: box.shipmentId,
              productId,
              quantity,
              variantSetId: variantSetId ?? undefined,
              status: "Packed",
            },
          });
          await tx.boxLine.update({
            where: { id: created.id },
            data: { shipmentLineId: newLine.id },
          });
        }
      }
    });
    const targetId = Number.isFinite(redirectId) ? redirectId : id;
    return redirect(`/shipments/${targetId}`);
  }
  if (intent === "box.updateLine") {
    const lineId = Number(form.get("lineId"));
    const quantity = Number(form.get("quantity") ?? 0);
    const description = (form.get("description") as string) || "";
    if (!Number.isFinite(lineId)) throw new Error("Line id required");
    let redirectId = id;
    await prisma.$transaction(async (tx) => {
      const line = await tx.boxLine.findUnique({
        where: { id: lineId },
        include: {
          box: {
            select: {
              id: true,
              shipmentId: true,
              shipment: { select: { id: true, packMode: true, type: true } },
            },
          },
        },
      });
      if (!line || !line.box?.shipmentId) {
        throw new Error("Line not found on shipment box");
      }
      redirectId = line.box.shipmentId ?? redirectId;
      if (
        line.box.shipment?.type !== "Out" ||
        line.box.shipment?.packMode !== "box"
      ) {
        throw new Error(
          "Editing only supported for outbound box-mode shipments"
        );
      }
      const qtyDelta =
        !line.packingOnly && Number.isFinite(quantity)
          ? quantity - Number(line.quantity ?? 0)
          : 0;
      await tx.boxLine.update({
        where: { id: lineId },
        data: {
          quantity: Number.isFinite(quantity) ? quantity : line.quantity,
          description: line.packingOnly
            ? description || null
            : line.description,
        },
      });
      if (!line.packingOnly && line.shipmentLineId && qtyDelta !== 0) {
        await tx.shipmentLine.update({
          where: { id: line.shipmentLineId },
          data: {
            quantity: Number(line.quantity ?? 0) + qtyDelta,
          },
        });
      }
    });
    const targetId = Number.isFinite(redirectId) ? redirectId : id;
    return redirect(`/shipments/${targetId}`);
  }
  if (isNew || intent === "shipment.create") {
    const status = "DRAFT";
    const type = (form.get("type") as string) || null;
    const shipmentType = (form.get("shipmentType") as string) || null;
    const packModeRaw = (form.get("packMode") as string) || null;
    const packMode = packModeRaw || (type === "Out" ? "box" : "line");
    const trackingNo = (form.get("trackingNo") as string) || null;
    const packingSlipCode = (form.get("packingSlipCode") as string) || null;
    const shippingMethodRaw = form.get("shippingMethod");
    const shippingMethod =
      shippingMethodRaw != null && String(shippingMethodRaw).trim() !== ""
        ? String(shippingMethodRaw)
        : null;
    const dateRaw = form.get("date") as string | null;
    const dateReceivedRaw = form.get("dateReceived") as string | null;
    const companyIdReceiverRaw = form.get("companyIdReceiver") as string | null;
    const contactIdReceiverRaw = form.get("contactIdReceiver") as string | null;
    const addressIdShipRaw = form.get("addressIdShip") as string | null;
    const companyIdReceiver = companyIdReceiverRaw
      ? Number(companyIdReceiverRaw)
      : null;
    const contactIdReceiver = contactIdReceiverRaw
      ? Number(contactIdReceiverRaw)
      : null;
    const hasAddressIdShip = addressIdShipRaw != null;
    const addressIdParsed =
      addressIdShipRaw === null || addressIdShipRaw === ""
        ? null
        : Number(addressIdShipRaw);
    const addressIdShip =
      addressIdParsed != null && Number.isFinite(addressIdParsed) && addressIdParsed > 0
        ? addressIdParsed
        : null;
    if (hasAddressIdShip && addressIdShip != null) {
      const allowed = await assertAddressAllowedForShipment(
        addressIdShip,
        companyIdReceiver,
        contactIdReceiver
      );
      if (!allowed) {
        return json(
          {
            error:
              "Ship-to address must belong to the receiver company or receiver contact.",
          },
          { status: 400 }
        );
      }
    }
    const addressSnapshot = hasAddressIdShip
      ? await buildShipmentAddressSnapshot(
          Number.isFinite(addressIdShip) ? addressIdShip : null
        )
      : {};
    const shippingMethodPatch =
      form.has("shippingMethod") || (hasAddressIdShip && addressIdShip == null)
        ? { shippingMethod }
        : {};
    const date = dateRaw ? new Date(dateRaw) : null;
    const dateReceived = dateReceivedRaw ? new Date(dateReceivedRaw) : null;
    const max = await prisma.shipment.aggregate({ _max: { id: true } });
    const nextId = (max._max.id || 0) + 1;
    let locationId: number | null = null;
    if (companyIdReceiver != null) {
      const company = await prisma.company.findUnique({
        where: { id: companyIdReceiver },
        select: { stockLocationId: true },
      });
      locationId = company?.stockLocationId ?? null;
    }
    if (locationId == null) locationId = 1;
    const created = await prisma.shipment.create({
      data: {
        id: nextId,
        status,
        type,
        shipmentType,
        trackingNo,
        packingSlipCode,
        date,
        dateReceived,
        locationId,
        packMode,
        ...(shippingMethodPatch as any),
        companyIdReceiver: Number.isFinite(Number(companyIdReceiver))
          ? (companyIdReceiver as any)
          : undefined,
        contactIdReceiver: Number.isFinite(Number(contactIdReceiver))
          ? (contactIdReceiver as any)
          : undefined,
        ...(addressSnapshot as any),
      } as any,
    });
    return redirect(`/shipments/${created.id}`);
  }
  if (intent === "shipment.update") {
    const type = (form.get("type") as string) || null;
    const packModeRaw = (form.get("packMode") as string) || null;
    const trackingNo = (form.get("trackingNo") as string) || null;
    const packingSlipCode = (form.get("packingSlipCode") as string) || null;
    const shippingMethodRaw = form.get("shippingMethod");
    const shippingMethod =
      shippingMethodRaw != null && String(shippingMethodRaw).trim() !== ""
        ? String(shippingMethodRaw)
        : null;
    const dateRaw = form.get("date") as string | null;
    const dateReceivedRaw = form.get("dateReceived") as string | null;
    const companyIdReceiverRaw = form.get("companyIdReceiver") as string | null;
    const contactIdReceiverRaw = form.get("contactIdReceiver") as string | null;
    const addressIdShipRaw = form.get("addressIdShip") as string | null;
    const pendingAttachBoxIds = parseBoxIdList(form.get("pendingAttachBoxIds"));
    const normalizedPackMode =
      packModeRaw === "box" ? "box" : packModeRaw === "line" ? "line" : null;
    const existingShipment = await prisma.shipment.findUnique({
      where: { id },
      select: {
        packMode: true,
        _count: { select: { boxes: true, lines: true } },
      },
    });
    if (!existingShipment) throw new Error("Shipment not found");
    const hasExistingItems =
      (existingShipment._count?.boxes ?? 0) > 0 ||
      (existingShipment._count?.lines ?? 0) > 0;
    const allowPackModeChange =
      !hasExistingItems && pendingAttachBoxIds.length === 0;
    const packModeUpdate = allowPackModeChange ? normalizedPackMode : undefined;
    const companyIdReceiver = companyIdReceiverRaw
      ? Number(companyIdReceiverRaw)
      : null;
    const contactIdReceiver = contactIdReceiverRaw
      ? Number(contactIdReceiverRaw)
      : null;
    const hasAddressIdShip = addressIdShipRaw != null;
    const addressIdParsed =
      addressIdShipRaw === null || addressIdShipRaw === ""
        ? null
        : Number(addressIdShipRaw);
    const addressIdShip =
      addressIdParsed != null && Number.isFinite(addressIdParsed) && addressIdParsed > 0
        ? addressIdParsed
        : null;
    if (hasAddressIdShip && addressIdShip != null) {
      const allowed = await assertAddressAllowedForShipment(
        addressIdShip,
        companyIdReceiver,
        contactIdReceiver
      );
      if (!allowed) {
        return json(
          {
            error:
              "Ship-to address must belong to the receiver company or receiver contact.",
          },
          { status: 400 }
        );
      }
    }
    const addressSnapshot = hasAddressIdShip
      ? await buildShipmentAddressSnapshot(
          Number.isFinite(addressIdShip) ? addressIdShip : null
        )
      : {};
    const shippingMethodPatch =
      form.has("shippingMethod") || (hasAddressIdShip && addressIdShip == null)
        ? { shippingMethod }
        : {};
    const date = dateRaw ? new Date(dateRaw) : null;
    const dateReceived = dateReceivedRaw ? new Date(dateReceivedRaw) : null;
    if (shipmentStatus !== "DRAFT") {
      return json(
        { error: "Shipment is locked because it is COMPLETE/CANCELED." },
        { status: 400 }
      );
    }
    await prisma.shipment.update({
      where: { id },
      data: {
        type,
        trackingNo,
        packingSlipCode,
        ...(shippingMethodPatch as any),
        date,
        dateReceived,
        ...(packModeUpdate ? { packMode: packModeUpdate } : {}),
        companyIdReceiver: Number.isFinite(Number(companyIdReceiver))
          ? (companyIdReceiver as any)
          : undefined,
        contactIdReceiver: Number.isFinite(Number(contactIdReceiver))
          ? (contactIdReceiver as any)
          : undefined,
        ...(addressSnapshot as any),
      },
    });
    if (pendingAttachBoxIds.length) {
      await attachBoxesToShipment(id, pendingAttachBoxIds);
    }
    return redirect(`/shipments/${id}`);
  }
  if (intent === "shipment.attachBoxes") {
    if (!Number.isFinite(id)) return redirect("/shipments");
    const selectedIds = parseBoxIdList(form.get("boxIds"));
    await attachBoxesToShipment(id, selectedIds);
    return redirect(`/shipments/${id}`);
  }
  return redirect(`/shipments/${id}`);
}

export function ShipmentDetailView() {
  const { shipment, attachedBoxes = [], availableBoxes = [], addressOptions } =
    useShipmentLoaderDataSafe();
  const actionData = useActionData<typeof action>() as any;
  const isOutbound = shipment.type === "Out";
  const isBoxMode = (shipment.packMode || "line") === "box";
  const showBoxesTab = isOutbound && isBoxMode;
  const isLocked = isShipmentLocked(shipment.status);
  const statusLabel = shipment.status || "DRAFT";
  const statusColor =
    statusLabel === "COMPLETE"
      ? "green"
      : statusLabel === "CANCELED"
      ? "red"
      : "gray";
  const { setCurrentId } = useRecordContext();
  const submit = useSubmit();
  const lineUpdate = useSubmit();
  const [activeTab, setActiveTab] = useState<string>("lines");
  const [attachOpen, { open: openAttach, close: closeAttach }] =
    useDisclosure(false);
  const [addBoxId, setAddBoxId] = useState<number | null>(null);
  const [addItemOpen, { open: openAddItem, close: closeAddItem }] =
    useDisclosure(false);
  useEffect(() => {
    setCurrentId(shipment.id, "restore");
  }, [shipment.id, setCurrentId]);
  // Normalize loader data to match form field names and types used by the UI
  const toFormDefaults = (s: any) => ({
    ...s,
    // Address aliases used by the form
    addressCity: s.addressCity ?? s.addressTownCity ?? "",
    addressPostalCode: s.addressPostalCode ?? s.addressZipPostCode ?? "",
    // Normalize potential nulls to empty strings for text inputs
    addressName: s.addressName ?? "",
    addressLine1: s.addressLine1 ?? "",
    addressLine2: s.addressLine2 ?? "",
    addressLine3: s.addressLine3 ?? "",
    addressCountyState: s.addressCountyState ?? "",
    addressCountry: s.addressCountry ?? "",
    // Read-only derived display field
    locationName: s.location?.name ?? "",
    packMode: s.packMode || "line",
    pendingAttachBoxIds: [],
  });
  const formDefaults = toFormDefaults(shipment);
  const form = useForm({
    defaultValues: formDefaults,
  });
  const [shipToOptions, setShipToOptions] = useState<
    { value: string; label: string }[]
  >(addressOptions || []);
  const receiverCompanyId = useWatch({
    control: form.control,
    name: "companyIdReceiver",
  });
  const receiverContactId = useWatch({
    control: form.control,
    name: "contactIdReceiver",
  });
  const prevReceiverCompanyId = useRef<number | null | undefined>(
    receiverCompanyId
  );
  useEffect(() => {
    if (
      prevReceiverCompanyId.current !== undefined &&
      prevReceiverCompanyId.current !== receiverCompanyId
    ) {
      form.setValue("addressIdShip", null);
    }
    prevReceiverCompanyId.current = receiverCompanyId;
  }, [receiverCompanyId, form]);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const companyId =
        receiverCompanyId != null ? Number(receiverCompanyId) : null;
      const contactId =
        receiverContactId != null ? Number(receiverContactId) : null;
      if (!companyId && !contactId) {
        setShipToOptions([]);
        return;
      }
      const urls: string[] = [];
      if (companyId) urls.push(`/companies/${companyId}/addresses`);
      if (contactId) urls.push(`/contacts/${contactId}/addresses`);
      try {
        const responses = await Promise.all(
          urls.map((url) => fetch(url).then((r) => r.json()))
        );
        if (cancelled) return;
        const merged: Record<string, { value: string; label: string }> = {};
        for (const payload of responses) {
          const list = payload?.addresses || [];
          list.forEach((addr: any) => {
            const label = buildAddressOptionLabel({
              id: addr.id,
              name: addr.name ?? null,
              addressLine1: addr.addressLine1 ?? null,
              addressTownCity: addr.addressTownCity ?? null,
              addressCountyState: addr.addressCountyState ?? null,
              addressZipPostCode: addr.addressZipPostCode ?? null,
            });
            merged[String(addr.id)] = {
              value: String(addr.id),
              label,
            };
          });
        }
        setShipToOptions(Object.values(merged));
      } catch {
        if (!cancelled) setShipToOptions([]);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [receiverCompanyId, receiverContactId]);
  const pendingAttachRaw =
    useWatch({ control: form.control, name: "pendingAttachBoxIds" }) || [];
  const pendingAttachBoxIds: number[] = Array.isArray(pendingAttachRaw)
    ? pendingAttachRaw
    : [];
  const pendingAttachSet = useMemo(
    () => new Set(pendingAttachBoxIds.map((id) => Number(id))),
    [pendingAttachBoxIds]
  );
  const pendingBoxes = useMemo(() => {
    if (!availableBoxes?.length || !pendingAttachSet.size) return [] as any[];
    return (availableBoxes || []).filter((box: any) =>
      pendingAttachSet.has(box.id)
    );
  }, [availableBoxes, pendingAttachSet]);
  const attachableBoxes = useMemo(() => {
    if (!availableBoxes?.length) return [] as any[];
    if (!pendingAttachSet.size) return availableBoxes as any[];
    return (availableBoxes || []).filter(
      (box: any) => !pendingAttachSet.has(box.id)
    );
  }, [availableBoxes, pendingAttachSet]);
  const stagedAndSavedBoxes = useMemo(
    () => [
      ...(pendingBoxes || []).map((box: any) => ({ box, isPending: true })),
      ...(attachedBoxes || []).map((box: any) => ({ box, isPending: false })),
    ],
    [pendingBoxes, attachedBoxes]
  );
  useEffect(() => {
    if (!showBoxesTab && activeTab === "boxes") {
      setActiveTab("lines");
    }
  }, [showBoxesTab, activeTab]);
  useInitGlobalFormContext(
    form as any,
    (values: any) => {
      if (isLocked) return;
      const fd = new FormData();
      fd.set("_intent", "shipment.update");
      fd.set("trackingNo", values.trackingNo || "");
      fd.set("status", values.status || "");
      fd.set("type", values.type || "");
      fd.set("packMode", values.packMode || "");
      fd.set("packingSlipCode", values.packingSlipCode || "");
      fd.set("date", values.date || "");
      fd.set("dateReceived", values.dateReceived || "");
      if (values.companyIdReceiver != null)
        fd.set("companyIdReceiver", String(values.companyIdReceiver));
      if (values.contactIdReceiver != null)
        fd.set("contactIdReceiver", String(values.contactIdReceiver));
      if (values.addressIdShip != null)
        fd.set("addressIdShip", String(values.addressIdShip));
      fd.set(
        "pendingAttachBoxIds",
        JSON.stringify(values.pendingAttachBoxIds || [])
      );
      submit(fd, { method: "post" });
    },
    () => form.reset(toFormDefaults(shipment) as any)
  );
  useEffect(() => {
    const next = toFormDefaults(shipment);
    form.reset(next as any, { keepDirty: false, keepDefaultValues: false });
  }, [shipment, form]);
  const lineCount = shipment.lines?.length ?? 0;
  const boxSummaries = useMemo(() => {
    const staged = Array.isArray(stagedAndSavedBoxes)
      ? stagedAndSavedBoxes
      : [];
    return staged.map(({ box, isPending }) => {
      if (!box) {
        return null;
      }
      const isLegacy = Boolean(
        (box as any)?.importKey &&
          String((box as any).importKey).startsWith("FM_SHIPMENT:")
      );
      const boxLines = Array.isArray((box as any).lines)
        ? (box as any).lines
        : [];
      const commercialLines = boxLines.filter(
        (line: any) => !line.packingOnly
      );
      const extraLines = boxLines.filter((line: any) => !!line.packingOnly);
      const totalQuantity = commercialLines.reduce(
        (sum: number, line: any) =>
          sum +
          lineQuantityOrSum({
            quantity: line.quantity,
            qtyBreakdown: Array.isArray(line.qtyBreakdown)
              ? line.qtyBreakdown
              : [],
          }),
        0
      );
      const skuCount = Array.from(
        new Set(
          commercialLines
            .map((line: any) => line.productId ?? line.product?.id ?? null)
            .filter((id: number | null): id is number => id != null)
        )
      ).length;
      // Group by variant set for rendering headers/labels
      const groupsMap = new Map<
        string,
        {
          key: string;
          title: string;
          labels: string[];
          lines: any[];
        }
      >();
      commercialLines.forEach((line: any) => {
        const variantSource = resolveVariantSourceFromLine(line);
        const key =
          (variantSource?.id != null
            ? `id:${variantSource.id}`
            : variantSource?.name
            ? `name:${variantSource.name}`
            : "none") || "none";
        const title =
          variantSource?.name ||
          (variantSource?.id != null
            ? `Variant Set ${variantSource.id}`
            : "No Variant Set");
        let labels: string[] = [];
        const variants = variantSource?.variants || [];
        if (variants.length) {
          labels = variants.map((v: any, idx: number) => {
            if (typeof v === "string") return v || `Variant ${idx + 1}`;
            return v?.name || v?.value || `Variant ${idx + 1}`;
          });
        } else if (Array.isArray(line.qtyBreakdown)) {
          labels = Array.from(
            { length: line.qtyBreakdown.length },
            (_, i) => `Variant ${i + 1}`
          );
        }
        if (!groupsMap.has(key)) {
          groupsMap.set(key, { key, title, labels, lines: [] });
        } else {
          const existing = groupsMap.get(key)!;
          if (labels.length > existing.labels.length) existing.labels = labels;
        }
        groupsMap.get(key)!.lines.push(line);
      });
      const groups = Array.from(groupsMap.values()).sort((a, b) =>
        a.title.localeCompare(b.title)
      );
      const maxVariantColumns = groups.reduce(
        (max, g) => Math.max(max, g.labels.length || 0),
        0
      );
      // Pad label arrays to max for consistent column count
      groups.forEach((g) => {
        while (g.labels.length < maxVariantColumns) {
          g.labels.push(`Variant ${g.labels.length + 1}`);
        }
      });
      return {
        box,
        totalQuantity,
        skuCount,
        isPending,
        isLegacy,
        commercialLines,
        extraLines,
        groups,
        maxVariantColumns,
      };
    });
  }, [stagedAndSavedBoxes]);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    console.debug("[shipments.detail] boxes trace", {
      stagedType: Array.isArray(stagedAndSavedBoxes)
        ? "array"
        : typeof stagedAndSavedBoxes,
      stagedCount: Array.isArray(stagedAndSavedBoxes)
        ? stagedAndSavedBoxes.length
        : null,
      summariesType: Array.isArray(boxSummaries) ? "array" : typeof boxSummaries,
      summariesCount: Array.isArray(boxSummaries) ? boxSummaries.length : null,
    });
  }, [stagedAndSavedBoxes, boxSummaries]);
  const handleAttachConfirm = (boxIds: number[]) => {
    if (isLocked) return;
    if (!boxIds.length) return;
    const current: number[] = form.getValues("pendingAttachBoxIds") || [];
    const merged = Array.from(
      new Set([...(current || []), ...boxIds])
    ) as number[];
    form.setValue("pendingAttachBoxIds", merged, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };
  const handleRemovePendingBox = (boxId: number) => {
    const current: number[] = form.getValues("pendingAttachBoxIds") || [];
    const next = current.filter((id) => Number(id) !== Number(boxId));
    form.setValue("pendingAttachBoxIds", next, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };
  const handleLineUpdate = (
    lineId: number,
    updates: { quantity?: number; description?: string }
  ) => {
    if (isLocked) return;
    const fd = new FormData();
    fd.set("_intent", "box.updateLine");
    fd.set("lineId", String(lineId));
    if (updates.quantity != null) fd.set("quantity", String(updates.quantity));
    if (updates.description != null) fd.set("description", updates.description);
    lineUpdate(fd, { method: "post" });
  };
  const handleStatusIntent = (nextIntent: "shipment.markComplete" | "shipment.cancel") => {
    const fd = new FormData();
    fd.set("_intent", nextIntent);
    submit(fd, { method: "post" });
  };
  const canAttachBoxes = Boolean(
    showBoxesTab &&
      shipment.status === "DRAFT" &&
      shipment.locationId &&
      (attachableBoxes?.length ?? 0) > 0
  );
  const hasAnyItems =
    lineCount > 0 ||
    (attachedBoxes?.length ?? 0) > 0 ||
    (pendingBoxes?.length ?? 0) > 0;

  return (
    <Stack>
      {actionData?.error ? <Text c="red">{actionData.error}</Text> : null}
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Shipments", href: "/shipments" },
            { label: String(shipment.id), href: `/shipments/${shipment.id}` },
          ]}
        />
        <Group gap="xs">
          <Badge color={statusColor} variant="light">
            {statusLabel}
          </Badge>
          {!isLocked && statusLabel === "DRAFT" ? (
            <>
              <Button
                size="xs"
                variant="light"
                onClick={() => handleStatusIntent("shipment.markComplete")}
              >
                Mark Complete
              </Button>
              <Button
                size="xs"
                variant="light"
                color="red"
                onClick={() => handleStatusIntent("shipment.cancel")}
              >
                Cancel
              </Button>
            </>
          ) : null}
        </Group>
      </Group>

      <ShipmentDetailForm
        mode="edit"
        form={form as any}
        shipment={shipment}
        fieldCtx={{
          packModeLocked: hasAnyItems || isLocked,
          shipmentLocked: isLocked,
          fieldOptions: {
            address_shipto: shipToOptions,
          },
        }}
      />

      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value || "lines")}
        keepMounted={false}
      >
        <Tabs.List>
          <Tabs.Tab value="lines">Lines ({lineCount})</Tabs.Tab>
          {showBoxesTab && (
            <Tabs.Tab value="boxes">Boxes ({attachedBoxes.length})</Tabs.Tab>
          )}
        </Tabs.List>
        <Tabs.Panel value="lines" pt="md">
          {lineCount ? (
            <Card withBorder padding="md">
              <Card.Section inheritPadding py="xs">
                <Title order={5}>Lines</Title>
              </Card.Section>
              <Table withColumnBorders withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>SKU</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Qty</Table.Th>
                    <Table.Th>Job</Table.Th>
                    <Table.Th>Location</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {shipment.lines.map((l: any) => (
                    <Table.Tr key={l.id}>
                      <Table.Td>{l.id}</Table.Td>
                      <Table.Td>{l.product?.sku ?? l.productId ?? ""}</Table.Td>
                      <Table.Td>{l.product?.name ?? ""}</Table.Td>
                      <Table.Td>{l.quantity ?? ""}</Table.Td>
                      <Table.Td>{l.jobId ?? ""}</Table.Td>
                      <Table.Td>{l.locationId ?? ""}</Table.Td>
                      <Table.Td>{l.status ?? ""}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          ) : (
            <Text c="dimmed" mt="sm">
              No shipment lines yet.
            </Text>
          )}
        </Tabs.Panel>
        {showBoxesTab && (
          <Tabs.Panel value="boxes" pt="md">
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Title order={5}>Boxes ({boxSummaries.length})</Title>
                <Button
                  onClick={openAttach}
                  disabled={!canAttachBoxes || isLocked}
                >
                  Attach boxes from warehouse…
                </Button>
              </Group>
              {pendingBoxes.length > 0 && (
                <Text size="sm" c="yellow.7">
                  {pendingBoxes.length} box
                  {pendingBoxes.length === 1 ? "" : "es"} pending – Save to
                  commit or remove to discard.
                </Text>
              )}
              {Array.isArray(boxSummaries) && boxSummaries.length ? (
                <Stack gap="md">
                  {boxSummaries.map((summary) => {
                    if (!summary?.box) return null;
                    const {
                      box,
                      totalQuantity,
                      isPending,
                      isLegacy,
                      commercialLines = [],
                      extraLines = [],
                      groups = [],
                      maxVariantColumns = 0,
                    } = summary;
                    return (
                      <Card key={box.id} withBorder padding="sm">
                          <Group justify="space-between" align="flex-start">
                            <Stack gap={2}>
                              <Text fw={600}>
                                {box.warehouseNumber != null
                                  ? `Box #${box.warehouseNumber}`
                                  : box.code || `Box ${box.id}`}
                              </Text>
                            </Stack>
                            <Group gap="md" align="center">
                              <Stack gap={0} ta="right">
                                <Text size="sm">
                                  Total qty: {totalQuantity}
                                </Text>
                              </Stack>
                              <Group gap="xs">
                                <Badge
                                  color={
                                    box.state === "sealed"
                                      ? "green"
                                      : box.state === "open"
                                      ? "blue"
                                      : "gray"
                                  }
                                >
                                  {box.state || "unknown"}
                                </Badge>
                                {isLegacy && (
                                  <Badge color="gray" variant="light">
                                    Legacy box (imported)
                                  </Badge>
                                )}
                                {isPending && (
                                  <Badge color="yellow">Pending Save</Badge>
                                )}
                              </Group>
                              <Button
                                size="xs"
                                variant="light"
                                disabled={isLocked}
                                onClick={() => {
                                  setAddBoxId(box.id);
                                  openAddItem();
                                }}
                              >
                                Add item
                              </Button>
                              {isPending && (
                                <Button
                                  variant="subtle"
                                  color="red"
                                  size="xs"
                                  disabled={isLocked}
                                  onClick={() => handleRemovePendingBox(box.id)}
                                >
                                  Remove
                                </Button>
                              )}
                            </Group>
                          </Group>
                          {commercialLines.length ? (
                            <Table withColumnBorders mt="sm">
                              <Table.Thead>
                                <Table.Tr>
                                  <Table.Th>SKU</Table.Th>
                                  <Table.Th>Assembly</Table.Th>
                                  {Array.from(
                                    { length: maxVariantColumns || 0 },
                                    (_, idx) => (
                                      <Table.Th key={idx}>
                                        Variant {idx + 1}
                                      </Table.Th>
                                    )
                                  )}
                                  <Table.Th>Total</Table.Th>
                                  <Table.Th>Job</Table.Th>
                                </Table.Tr>
                              </Table.Thead>
                              <Table.Tbody>
                                {(groups || []).map((group) => {
                                  const groupLabels = Array.isArray(group.labels)
                                    ? group.labels
                                    : [];
                                  if (
                                    process.env.NODE_ENV !== "production" &&
                                    (!Array.isArray(group.labels) ||
                                      !Array.isArray(group.lines))
                                  ) {
                                    console.debug(
                                      "[shipments.detail] box group shape",
                                      {
                                        key: group.key,
                                        labelsType: Array.isArray(group.labels)
                                          ? "array"
                                          : typeof group.labels,
                                        linesType: Array.isArray(group.lines)
                                          ? "array"
                                          : typeof group.lines,
                                      }
                                    );
                                  }
                                  return (
                                    <Fragment key={group.key}>
                                    <Table.Tr>
                                      <Table.Td colSpan={2} fw={600}>
                                        {group.title}
                                      </Table.Td>
                                      {groupLabels.map((label, idx) => (
                                        <Table.Td key={idx} fw={600}>
                                          {label}
                                        </Table.Td>
                                      ))}
                                      {maxVariantColumns > groupLabels.length
                                        ? Array.from(
                                            {
                                              length:
                                                maxVariantColumns -
                                                groupLabels.length,
                                            },
                                            (_, idx) => (
                                              <Table.Td key={`pad-${idx}`} />
                                            )
                                          )
                                        : null}
                                      <Table.Td></Table.Td>
                                      <Table.Td></Table.Td>
                                    </Table.Tr>
                                    {(group.lines || []).map((line: any) => {
                                      const breakdown = Array.isArray(
                                        line.qtyBreakdown
                                      )
                                        ? line.qtyBreakdown
                                        : [];
                                      const totalQty =
                                        line.quantity ??
                                        sumNumberArray(
                                          Array.isArray(line.qtyBreakdown)
                                            ? line.qtyBreakdown
                                            : []
                                        );
                                      return (
                                        <Table.Tr key={line.id}>
                                          <Table.Td>
                                            {line.product?.sku ??
                                              line.productId ??
                                              ""}
                                          </Table.Td>
                                          <Table.Td>
                                            {line.assembly?.name ||
                                              (line.assemblyId
                                                ? `Assembly ${line.assemblyId}`
                                                : "—")}
                                          </Table.Td>
                                          {Array.from(
                                            { length: maxVariantColumns || 0 },
                                            (_, idx) => (
                                              <Table.Td key={idx}>
                                                {breakdown[idx] ?? 0}
                                              </Table.Td>
                                            )
                                          )}
                                          <Table.Td>
                                            {line.isAdHoc ? (
                                              <TextInput
                                                type="number"
                                                size="xs"
                                                disabled={isLocked}
                                                defaultValue={
                                                  line.quantity ??
                                                  sumNumberArray(
                                                    Array.isArray(
                                                      line.qtyBreakdown
                                                    )
                                                      ? line.qtyBreakdown
                                                      : []
                                                  )
                                                }
                                                onBlur={(e) => {
                                                  const next = Number(
                                                    e.currentTarget.value
                                                  );
                                                  if (Number.isNaN(next))
                                                    return;
                                                  handleLineUpdate(line.id, {
                                                    quantity: next,
                                                  });
                                                }}
                                              />
                                            ) : (
                                              totalQty
                                            )}
                                          </Table.Td>
                                          <Table.Td>
                                            {line.job?.name ||
                                              (line.jobId
                                                ? `Job ${line.jobId}`
                                                : "—")}
                                          </Table.Td>
                                        </Table.Tr>
                                      );
                                    })}
                                  </Fragment>
                                );
                                })}
                              </Table.Tbody>
                            </Table>
                          ) : (
                            <Text size="sm" c="dimmed" mt="sm">
                              No commercial lines recorded for this box.
                            </Text>
                          )}
                          {extraLines.length > 0 && (
                            <Stack gap={4} mt="sm">
                              <Text size="sm" fw={600}>
                                Extras
                              </Text>
                              {extraLines.map((line: any) => (
                                <Group
                                  key={line.id}
                                  gap="xs"
                                  align="flex-start"
                                >
                                  <Badge size="xs" color="gray">
                                    Packing-only
                                  </Badge>
                                  <Stack gap={6} style={{ flex: 1 }}>
                                    <TextInput
                                      size="xs"
                                      label="Description"
                                      disabled={isLocked}
                                      defaultValue={
                                        line.description ||
                                        line.product?.name ||
                                        line.productId ||
                                        `Line ${line.id}`
                                      }
                                      onBlur={(e) => {
                                        handleLineUpdate(line.id, {
                                          description: e.currentTarget.value,
                                        });
                                      }}
                                    />
                                    <TextInput
                                      type="number"
                                      size="xs"
                                      label="Quantity"
                                      disabled={isLocked}
                                      defaultValue={
                                        line.quantity ??
                                        sumNumberArray(
                                          Array.isArray(line.qtyBreakdown)
                                            ? line.qtyBreakdown
                                            : []
                                        )
                                      }
                                      onBlur={(e) => {
                                        const next = Number(
                                          e.currentTarget.value
                                        );
                                        if (Number.isNaN(next)) return;
                                        handleLineUpdate(line.id, {
                                          quantity: next,
                                        });
                                      }}
                                    />
                                  </Stack>
                                </Group>
                              ))}
                            </Stack>
                          )}
                        </Card>
                      );
                    }
                  )}
                </Stack>
              ) : (
                <Text c="dimmed">
                  No boxes attached or staged for this shipment.
                </Text>
              )}
            </Stack>
          </Tabs.Panel>
        )}
      </Tabs>
      <AttachBoxesModal
        opened={attachOpen}
        onClose={closeAttach}
        shipmentId={shipment.id}
        shipmentLocationId={shipment.locationId ?? null}
        shipmentCustomerId={shipment.companyIdReceiver ?? null}
        boxes={attachableBoxes as any}
        onConfirm={(ids) => {
          handleAttachConfirm(ids);
          closeAttach();
        }}
      />
      <AddBoxItemModal
        opened={addItemOpen}
        onClose={closeAddItem}
        boxId={addBoxId}
      />
    </Stack>
  );
}

export default function ShipmentDetailLayout() {
  return <Outlet />;
}
