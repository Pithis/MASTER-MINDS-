const express = require('express');
const router = express.Router();
const { Addresses } = require('../db');
const { requireAuth } = require('../middleware/auth');

// Protect all address routes
router.use(requireAuth);

// ── GET /api/addresses (Get saved addresses) ──────────────────
router.get('/', async (req, res) => {
  try {
    const list = Addresses.getByUserId(req.user.id);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve addresses' });
  }
});

// ── POST /api/addresses (Add new address) ─────────────────────
router.post('/', async (req, res) => {
  const { title, addr, city, zip, phoneCode, phone, isDefault } = req.body;
  if (!title || !addr || !city || !zip || !phone) {
    return res.status(400).json({ error: 'Title, Address, City, ZIP, and Phone are required' });
  }

  try {
    const id = Addresses.create({
      userId: req.user.id,
      title,
      addr,
      city,
      zip,
      phoneCode,
      phone,
      isDefault: isDefault ? 1 : 0
    });
    const created = Addresses.findById(id);
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create address' });
  }
});

// ── PUT /api/addresses/:id (Update address) ────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, addr, city, zip, phoneCode, phone, isDefault } = req.body;

  if (!title || !addr || !city || !zip || !phone) {
    return res.status(400).json({ error: 'Title, Address, City, ZIP, and Phone are required' });
  }

  try {
    const existing = Addresses.findById(id);
    if (!existing || existing.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Address not found' });
    }

    Addresses.update(id, req.user.id, {
      title,
      addr,
      city,
      zip,
      phoneCode,
      phone,
      isDefault: isDefault ? 1 : 0
    });

    const updated = Addresses.findById(id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update address' });
  }
});

// ── DELETE /api/addresses/:id (Delete address) ─────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const existing = Addresses.findById(id);
    if (!existing || existing.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Address not found' });
    }

    Addresses.delete(id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

// ── PATCH /api/addresses/:id/default (Set default) ────────────
router.patch('/:id/default', async (req, res) => {
  const { id } = req.params;
  try {
    const existing = Addresses.findById(id);
    if (!existing || existing.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Address not found' });
    }

    Addresses.setDefault(id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set default address' });
  }
});

module.exports = router;
