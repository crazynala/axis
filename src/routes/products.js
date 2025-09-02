const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (_req, res) => {
  const products = await prisma.product.findMany();
  res.json(products);
});

router.post('/', async (req, res) => {
  const data = req.body;
  const product = await prisma.product.create({ data });
  res.json(product);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const product = await prisma.product.update({ where: { id: Number(id) }, data });
  res.json(product);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await prisma.product.delete({ where: { id: Number(id) } });
  res.json({ success: true });
});

module.exports = router;
