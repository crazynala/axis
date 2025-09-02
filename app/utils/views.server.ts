import { prisma } from "./prisma.server";

export type SavedViewParams = {
  module: string; // e.g., "products"
  name: string;
  params: Record<string, any>;
};

export async function listViews(module: string) {
  return prisma.savedView.findMany({ where: { module }, orderBy: { updatedAt: "desc" } });
}

export async function saveView({ module, name, params }: SavedViewParams) {
  // Upsert by module+name
  const existing = await prisma.savedView.findFirst({ where: { module, name } });
  if (existing) {
    return prisma.savedView.update({ where: { id: existing.id }, data: { params } });
  }
  return prisma.savedView.create({ data: { module, name, params } });
}

export async function getView(module: string, name: string) {
  return prisma.savedView.findFirst({ where: { module, name } });
}
