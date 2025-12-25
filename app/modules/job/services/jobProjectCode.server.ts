import type { PrismaClient } from "@prisma/client";
import {
  JOB_PROJECT_CODE_PREFIX_DEFAULT,
  normalizeJobProjectCodePrefix,
} from "./jobProjectCode";

export const JOB_PROJECT_CODE_PREFIX_KEY = "jobProjectCodePrefix";

export async function loadJobProjectCodePrefix(
  prisma: PrismaClient
): Promise<string> {
  const setting = await prisma.setting.findUnique({
    where: { key: JOB_PROJECT_CODE_PREFIX_KEY },
    select: { value: true },
  });
  const normalized = normalizeJobProjectCodePrefix(setting?.value ?? null);
  return normalized ?? JOB_PROJECT_CODE_PREFIX_DEFAULT;
}
