import type { Prisma } from "@prisma/client";

export type BoxDestinationKind = "address" | "location";
export type BoxDestination = { kind: BoxDestinationKind; id: number };

export type BoxDestinationFields = {
  destinationAddressId?: number | null;
  destinationLocationId?: number | null;
};

export function getBoxDestination(
  box: BoxDestinationFields
): BoxDestination | null {
  if (box.destinationAddressId != null) {
    return { kind: "address", id: box.destinationAddressId };
  }
  if (box.destinationLocationId != null) {
    return { kind: "location", id: box.destinationLocationId };
  }
  return null;
}

export function assertBoxDestinationValid(
  box: BoxDestinationFields,
  options: { requireDestination?: boolean } = {}
) {
  if (box.destinationAddressId != null && box.destinationLocationId != null) {
    throw new Error("Box destination must be either an address or a location.");
  }
  if (options.requireDestination && !getBoxDestination(box)) {
    throw new Error("Box destination is required.");
  }
}

export async function assertBoxDestinationMatches(
  tx: Prisma.TransactionClient,
  box: {
    id: number;
    state?: string | null;
    shipmentId?: number | null;
    destinationAddressId?: number | null;
    destinationLocationId?: number | null;
  },
  desired: BoxDestination | null
) {
  assertBoxDestinationValid(box);
  if (!desired) {
    throw new Error("Destination is required to pack into this box.");
  }
  const current = getBoxDestination(box);
  if (!current) {
    const state = String(box.state ?? "").toLowerCase();
    if (state && state !== "open") {
      throw new Error("Destination can only be set on open boxes.");
    }
    if (box.shipmentId) {
      throw new Error("Destination cannot be set on a box already in a shipment.");
    }
    const data =
      desired.kind === "address"
        ? { destinationAddressId: desired.id, destinationLocationId: null }
        : { destinationLocationId: desired.id, destinationAddressId: null };
    await tx.box.update({ where: { id: box.id }, data });
    return;
  }
  if (current.kind !== desired.kind || current.id !== desired.id) {
    throw new Error("Box destination does not match the selected destination.");
  }
}
