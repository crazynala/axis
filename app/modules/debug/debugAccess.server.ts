import { prisma } from "~/utils/prisma.server";
import { requireUserId } from "~/utils/auth.server";

export const DEBUG_PANEL_SETTING_KEY = "enableDebugPanels";

function parseSettingBool(raw: unknown): boolean | null {
  if (raw == null) return null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const val = raw.toLowerCase().trim();
    if (["true", "1", "yes", "on"].includes(val)) return true;
    if (["false", "0", "no", "off"].includes(val)) return false;
  }
  return null;
}

export async function loadDebugPanelsEnabled(): Promise<boolean> {
  const setting = await prisma.setting.findUnique({
    where: { key: DEBUG_PANEL_SETTING_KEY },
    select: { value: true, json: true },
  });
  const fromValue = parseSettingBool(setting?.value);
  if (fromValue != null) return fromValue;
  const fromJson = parseSettingBool(setting?.json);
  if (fromJson != null) return fromJson;
  return process.env.NODE_ENV !== "production";
}

export async function getDebugAccess(request: Request) {
  const userId = await requireUserId(request);
  return getDebugAccessForUser(userId);
}

export async function getDebugAccessForUser(userId: number) {
  const [enabled, user] = await Promise.all([
    loadDebugPanelsEnabled(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, userLevel: true },
    }),
  ]);
  const isAdmin = Boolean(
    user && user.isActive && user.userLevel === "Admin"
  );
  return {
    userId,
    enabled,
    isAdmin,
    canDebug: Boolean(enabled && isAdmin),
  };
}
