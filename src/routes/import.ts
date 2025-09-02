import { Router } from "express";
import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
// deprecated; use import.js
const prisma = new PrismaClient();
const router = Router();

router.post("/products", async (req: Request, res: Response) => {
  try {
    const products = req.body;
    if (!Array.isArray(products))
      return res.status(400).json({ error: "Invalid data" });
    const created = [] as any[];
    for (const data of products) {
      const product = await prisma.product.create({ data });
      created.push(product);
    }
    res.json({ count: created.length, products: created });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
