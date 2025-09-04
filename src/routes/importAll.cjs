const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

async function importMany(model, rows) {
  const created = [];
  for (const data of rows || []) {
    try {
      const record = await prisma[model].create({ data });
      created.push(record);
    } catch (e) {
      // swallow row errors
    }
  }
  return created;
}

router.post('/products', async (req, res) => {
  const rows = req.body;
  const created = await importMany('product', rows);
  res.json({ count: created.length });
});

router.post('/productlines', async (req, res) => {
  const rows = req.body;
  const created = await importMany('productLine', rows);
  res.json({ count: created.length });
});

router.post('/costings', async (req, res) => {
  const rows = req.body;
  const created = await importMany('costing', rows);
  res.json({ count: created.length });
});

router.post('/productmovements', async (req, res) => {
  const rows = req.body;
  const created = await importMany('productMovement', rows);
  res.json({ count: created.length });
});

router.post('/productmovementlines', async (req, res) => {
  const rows = req.body;
  const created = await importMany('productMovementLine', rows);
  res.json({ count: created.length });
});

router.post('/batches', async (req, res) => {
  const rows = req.body;
  const created = await importMany('batch', rows);
  res.json({ count: created.length });
});

router.post('/locations', async (req, res) => {
  const rows = req.body;
  const created = await importMany('location', rows);
  res.json({ count: created.length });
});

router.post('/productlocations', async (_req, res) => {
  res.json({ count: 0, message: 'Not yet implemented' });
});

module.exports = router;
