const express = require('express');
const router = express.Router();
const { Products } = require('../db');
const { requireAdmin } = require('../middleware/auth');

// ── GET /api/products ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const prods = Products.getAll();
    res.json(prods);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ── POST /api/products ───────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const p = req.body;
  if (!p.id || !p.name || p.price === undefined || !p.category) {
    return res.status(400).json({ error: 'Product ID, name, price, and category are required' });
  }

  try {
    Products.upsert(p);
    const created = Products.findById(p.id);
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// ── PUT /api/products/:id ────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const p = req.body;
  p.id = id; // Ensure ID matches URL

  try {
    const exists = Products.findById(id);
    if (!exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    Products.upsert(p);
    const updated = Products.findById(id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// ── PATCH /api/products/:id/stock ───────────────────────────
router.patch('/:id/stock', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { delta, stock } = req.body;

  try {
    const exists = Products.findById(id);
    if (!exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (delta !== undefined) {
      Products.updateStock(id, delta);
    } else if (stock !== undefined) {
      Products.setStock(id, stock);
    } else {
      return res.status(400).json({ error: 'Either delta or stock is required' });
    }

    const updated = Products.findById(id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

// ── DELETE /api/products/:id ─────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const exists = Products.findById(id);
    if (!exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    Products.delete(id);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
