import { prisma } from "../app/utils/prisma.server";

const seedData = [
  {
    Group: "Washing - Shirt",
    Quantity: "2000",
    Price: "0.6",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "1500",
    Price: "0.55",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "1000",
    Price: "0.7",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "500",
    Price: "0.8",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "250",
    Price: "0.8",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "100",
    Price: "1.2",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "50",
    Price: "1.8",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "40",
    Price: "2.3",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "30",
    Price: "2.8",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "20",
    Price: "3",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "10",
    Price: "3.4",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "5",
    Price: "5",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "4",
    Price: "6",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "3",
    Price: "8",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "2",
    Price: "12",
  },
  {
    Group: "Washing - Shirt",
    Quantity: "0",
    Price: "23",
  },
  {
    Group: "CMT - Shirt - Basic - MOQ 50",
    Quantity: "2000",
    Price: "10.83",
  },
  {
    Group: "CMT - Shirt - Basic - MOQ 50",
    Quantity: "1500",
    Price: "11.4",
  },
  {
    Group: "CMT - Shirt - Basic - MOQ 50",
    Quantity: "1000",
    Price: "12",
  },
  {
    Group: "CMT - Shirt - Basic - MOQ 50",
    Quantity: "500",
    Price: "12.5",
  },
  {
    Group: "CMT - Shirt - Basic - MOQ 50",
    Quantity: "250",
    Price: "13",
  },
  {
    Group: "CMT - Shirt - Basic - MOQ 50",
    Quantity: "50",
    Price: "14",
  },
  {
    Group: "CMT - Shirt - Basic - MOQ 50",
    Quantity: "40",
    Price: "17.5",
  },
  {
    Group: "CMT - Shirt - Basic - MOQ 50",
    Quantity: "30",
    Price: "21",
  },
  {
    Group: "CMT - Shirt - Basic - MOQ 50",
    Quantity: "20",
    Price: "24.5",
  },
  {
    Group: "CMT - Shirt - Basic - MOQ 50",
    Quantity: "10",
    Price: "32",
  },
  {
    Group: "CMT - Shirt - Basic - MOQ 50",
    Quantity: "0",
    Price: "42",
  },
  {
    Group: "CMT - Jacket - Basic - MOQ 50",
    Quantity: "2000",
    Price: "27.075",
  },
  {
    Group: "CMT - Jacket - Basic - MOQ 50",
    Quantity: "1500",
    Price: "28.5",
  },
  {
    Group: "CMT - Jacket - Basic - MOQ 50",
    Quantity: "1000",
    Price: "30",
  },
  {
    Group: "CMT - Jacket - Basic - MOQ 50",
    Quantity: "500",
    Price: "31.25",
  },
  {
    Group: "CMT - Jacket - Basic - MOQ 50",
    Quantity: "250",
    Price: "32.5",
  },
  {
    Group: "CMT - Jacket - Basic - MOQ 50",
    Quantity: "50",
    Price: "35",
  },
  {
    Group: "CMT - Jacket - Basic - MOQ 50",
    Quantity: "40",
    Price: "43.75",
  },
  {
    Group: "CMT - Jacket - Basic - MOQ 50",
    Quantity: "30",
    Price: "52.5",
  },
  {
    Group: "CMT - Jacket - Basic - MOQ 50",
    Quantity: "20",
    Price: "61.25",
  },
  {
    Group: "CMT - Jacket - Basic - MOQ 50",
    Quantity: "10",
    Price: "80",
  },
  {
    Group: "CMT - Jacket - Basic - MOQ 50",
    Quantity: "0",
    Price: "105",
  },
  {
    Group: "CMT - Apron Waist - Basic - MOQ 50",
    Quantity: "2000",
    Price: "5.268021429",
  },
  {
    Group: "CMT - Apron Waist - Basic - MOQ 50",
    Quantity: "1500",
    Price: "5.545285714",
  },
  {
    Group: "CMT - Apron Waist - Basic - MOQ 50",
    Quantity: "1000",
    Price: "5.837142857",
  },
  {
    Group: "CMT - Apron Waist - Basic - MOQ 50",
    Quantity: "500",
    Price: "6.080357143",
  },
  {
    Group: "CMT - Apron Waist - Basic - MOQ 50",
    Quantity: "250",
    Price: "6.323571429",
  },
  {
    Group: "CMT - Apron Waist - Basic - MOQ 50",
    Quantity: "50",
    Price: "6.81",
  },
  {
    Group: "CMT - Apron Waist - Basic - MOQ 50",
    Quantity: "40",
    Price: "8.5125",
  },
  {
    Group: "CMT - Apron Waist - Basic - MOQ 50",
    Quantity: "30",
    Price: "10.215",
  },
  {
    Group: "CMT - Apron Waist - Basic - MOQ 50",
    Quantity: "20",
    Price: "11.9175",
  },
  {
    Group: "CMT - Apron Waist - Basic - MOQ 50",
    Quantity: "10",
    Price: "15.56571429",
  },
  {
    Group: "CMT - Apron Waist - Basic - MOQ 50",
    Quantity: "0",
    Price: "20.43",
  },
  {
    Group: "CMT - Vest - Basic - MOQ 50",
    Quantity: "2000",
    Price: "15.47",
  },
  {
    Group: "CMT - Vest - Basic - MOQ 50",
    Quantity: "1500",
    Price: "16.29",
  },
  {
    Group: "CMT - Vest - Basic - MOQ 50",
    Quantity: "1000",
    Price: "17.14",
  },
  {
    Group: "CMT - Vest - Basic - MOQ 50",
    Quantity: "500",
    Price: "17.86",
  },
  {
    Group: "CMT - Vest - Basic - MOQ 50",
    Quantity: "250",
    Price: "18.57",
  },
  {
    Group: "CMT - Vest - Basic - MOQ 50",
    Quantity: "50",
    Price: "20",
  },
  {
    Group: "CMT - Vest - Basic - MOQ 50",
    Quantity: "40",
    Price: "25",
  },
  {
    Group: "CMT - Vest - Basic - MOQ 50",
    Quantity: "30",
    Price: "30",
  },
  {
    Group: "CMT - Vest - Basic - MOQ 50",
    Quantity: "20",
    Price: "35",
  },
  {
    Group: "CMT - Vest - Basic - MOQ 50",
    Quantity: "10",
    Price: "45.71",
  },
  {
    Group: "CMT - Vest - Basic - MOQ 50",
    Quantity: "0",
    Price: "60",
  },
];

async function main() {
  // Group rows by Group name and normalize numeric values
  type Row = { Group: string; Quantity: string; Price: string };
  const grouped = new Map<
    string,
    Array<{ rangeFrom: number; price: number }>
  >();
  for (const r of seedData as Row[]) {
    const name = String(r.Group || "").trim();
    if (!name) continue;
    const q = Number(r.Quantity);
    const p = Number(r.Price);
    if (!Number.isFinite(q) || !Number.isFinite(p)) continue;
    const arr = grouped.get(name) || [];
    arr.push({ rangeFrom: q, price: p });
    grouped.set(name, arr);
  }

  let groupsCreated = 0;
  let groupsUpdated = 0;
  let rangesInserted = 0;

  for (const [name, tiersRaw] of grouped.entries()) {
    // Dedupe by rangeFrom (keep last occurrence), then sort asc
    const byQty = new Map<number, number>();
    for (const t of tiersRaw) byQty.set(t.rangeFrom, t.price);
    const tiers = Array.from(byQty.entries())
      .map(([rangeFrom, price]) => ({ rangeFrom, price }))
      .sort((a, b) => a.rangeFrom - b.rangeFrom);

    // Find or create group by name
    let group = await prisma.salePriceGroup.findFirst({ where: { name } });
    if (!group) {
      group = await prisma.salePriceGroup.create({ data: { name } });
      groupsCreated++;
    } else {
      groupsUpdated++;
    }

    // Clear existing ranges for this group to avoid duplicates on reseed
    await prisma.salePriceRange.deleteMany({
      where: { saleGroupId: group.id },
    });
    if (tiers.length) {
      await prisma.salePriceRange.createMany({
        data: tiers.map((t) => ({
          saleGroupId: group!.id,
          rangeFrom: t.rangeFrom,
          price: t.price,
        })),
      });
      rangesInserted += tiers.length;
    }
  }

  console.log("Sale price seeding complete:");
  console.log({ groupsCreated, groupsUpdated, rangesInserted });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
