type TransferGuardInput = {
  movementType: string | null | undefined;
  locationInId: number | null | undefined;
  locationOutId: number | null | undefined;
  context?: Record<string, unknown>;
};

type BatchGuardInput = {
  movementType: string | null | undefined;
  batchTrackingEnabled: boolean;
  hasBatchId: boolean;
  context?: Record<string, unknown>;
};

export function isTransferLikeMovementType(movementType: string | null | undefined) {
  const mt = (movementType ?? "").toString().trim().toLowerCase();
  return mt === "transfer" || mt.startsWith("defect_");
}

export function assertTransferLocations(input: TransferGuardInput) {
  if (!isTransferLikeMovementType(input.movementType)) return;
  if (input.locationInId == null || input.locationOutId == null) {
    const error = new Error(
      "Transfer-like movement requires both locationInId and locationOutId."
    );
    (error as any).context = {
      movementType: input.movementType ?? null,
      locationInId: input.locationInId ?? null,
      locationOutId: input.locationOutId ?? null,
      ...input.context,
    };
    throw error;
  }
}

export function assertBatchLinePresence(input: BatchGuardInput) {
  if (!input.batchTrackingEnabled) return;
  if (input.hasBatchId) return;
  const error = new Error(
    "Batch-tracked product requires movement lines with batchId."
  );
  (error as any).context = {
    movementType: input.movementType ?? null,
    batchTrackingEnabled: input.batchTrackingEnabled,
    ...input.context,
  };
  throw error;
}
