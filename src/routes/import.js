const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

router.post('/products', async (req, res) => {
  try {
    const products = req.body;
    if (!Array.isArray(products)) return res.status(400).json({ error: 'Invalid data' });
    const created = [];
    for (const data of products) {
      const product = await prisma.product.create({ data });
      created.push(product);
    }
    res.json({ count: created.length, products: created });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
