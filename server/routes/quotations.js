const express = require('express');
const router = express.Router();
const { Quotations } = require('../db');
const { requireAdmin, optionalAuth } = require('../middleware/auth');

// ── GET /api/quotations (Admin only) ──────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const quots = Quotations.getAll();
    res.json(quots);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve quotations' });
  }
});

// ── POST /api/quotations (Create quotation) ───────────────────
router.post('/', optionalAuth, async (req, res) => {
  const { customerName, customerEmail, address, city, zip, phoneCode, phone, total, items } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ error: 'Quotation items are required' });
  }

  try {
    const qId = Quotations.create({
      customerName: customerName || (req.user ? req.user.name : 'Guest'),
      customerEmail: customerEmail || (req.user ? req.user.email : ''),
      address,
      city,
      zip,
      phoneCode,
      phone,
      total,
      status: 'pending',
      items
    });
    const quot = Quotations.findById(qId);
    res.status(201).json(quot);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create quotation' });
  }
});

// ── PUT /api/quotations/:id (Update quotation prices, Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { items, total } = req.body;

  if (!items || !items.length || total === undefined) {
    return res.status(400).json({ error: 'Updated items and total are required' });
  }

  try {
    const exists = Quotations.findById(id);
    if (!exists) {
      return res.status(404).json({ error: 'Quotation not found' });
    }
    Quotations.update(id, items, total);
    const updated = Quotations.findById(id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update quotation' });
  }
});

module.exports = router;
