export async function refreshStockSnapshotSafe(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const { refreshProductStockSnapshot } = await import("~/utils/prisma.server");
  try {
    await refreshProductStockSnapshot(false);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "refresh_failed" };
  }
}
