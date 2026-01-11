import "dotenv/config";
import { PrismaClient, LocationType } from "@prisma/client";

const prisma = new PrismaClient();

type SeedLocation = {
  name: string;
  type: LocationType;
  notes?: string | null;
};

const defaultLocations: SeedLocation[] = [
  { name: "QC Review", type: LocationType.review, notes: "Defects awaiting review" },
  { name: "Scrap", type: LocationType.scrap, notes: "Physical scrap / trash" },
  { name: "Off-spec", type: LocationType.off_spec, notes: "Defect but kept for donation/testing" },
  { name: "Samples", type: LocationType.sample, notes: "Reference/keep samples" },
  { name: "Dev Samples", type: LocationType.sample, notes: "Internal development samples" },
  { name: "WIP", type: LocationType.wip, notes: "Work in progress" },
  { name: "Warehouse", type: LocationType.warehouse, notes: "General stock" },
];

async function main() {
  for (const loc of defaultLocations) {
    const existing =
      loc.type === LocationType.sample
        ? await prisma.location.findFirst({
            where: {
              type: loc.type,
              name: { equals: loc.name, mode: "insensitive" },
            },
          })
        : await prisma.location.findFirst({
            where: { type: loc.type },
          });
    if (existing) {
      // Update name/notes if blank to standardize
      const updates: Partial<SeedLocation> = {};
      if (!existing.name || existing.name.trim() === "") updates.name = loc.name;
      if (!existing.notes && loc.notes) updates.notes = loc.notes;
      if (Object.keys(updates).length) {
        await prisma.location.update({
          where: { id: existing.id },
          data: updates,
        });
        console.log(`[seed:locations] Updated ${loc.type} -> ${updates.name ?? existing.name}`);
      } else {
        console.log(`[seed:locations] Exists ${loc.type} (${existing.name})`);
      }
      continue;
    }
    await prisma.location.create({
      data: {
        name: loc.name,
        type: loc.type,
        notes: loc.notes ?? null,
        is_active: true,
      },
    });
    console.log(`[seed:locations] Created ${loc.type} (${loc.name})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
