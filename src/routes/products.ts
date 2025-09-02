import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { Router } from "express";
// deprecated; use products.js
const prisma = new PrismaClient();
const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const products = await prisma.product.findMany();
  res.json(products);
});

router.post("/", async (req: Request, res: Response) => {
  const data = req.body;
  const product = await prisma.product.create({ data });
  res.json(product);
});

router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body;
  const product = await prisma.product.update({
    where: { id: Number(id) },
    data,
  });
  res.json(product);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.product.delete({ where: { id: Number(id) } });
  res.json({ success: true });
});

export default router;
