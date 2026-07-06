const express = require('express');
const router = express.Router();
const { Orders } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── GET /api/orders (User's own orders) ───────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const orders = Orders.getByUserId(req.user.id);
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve orders' });
  }
});

// ── GET /api/orders/all (Admin only) ──────────────────────────
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const orders = Orders.getAll();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve all orders' });
  }
});

// ── POST /api/orders (Place order) ────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { customerName, customerEmail, customerPhone, address, total, items } = req.body;
  if (!customerName || !total || !items || !items.length) {
    return res.status(400).json({ error: 'Customer name, total, and items are required' });
  }

  try {
    const orderId = Orders.create({
      userId: req.user.id,
      customerName,
      customerEmail: customerEmail || req.user.email,
      customerPhone,
      address,
      total,
      status: 'processing',
      items
    });
    const order = Orders.findById(orderId);
    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// ── PATCH /api/orders/:id/status (Update order status) ────────
router.patch('/:id/status', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    const order = Orders.findById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    Orders.updateStatus(id, status);
    const updated = Orders.findById(id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// ── GET /api/orders/export (CSV export, Admin only) ──────────
router.get('/export', requireAdmin, async (req, res) => {
  try {
    const orders = Orders.getAll();
    let csv = 'OrderID,Customer,Email,Total,Status,Date,Items\n';
    orders.forEach(o => {
      const itemsStr = o.items.map(i => `${i.name} (x${i.qty})`).join('; ');
      csv += `${o.id},"${o.customerName}","${o.customerEmail}",${o.total.toFixed(2)},${o.status},${o.createdAt},"${itemsStr}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=MastermindzSportz_Orders_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export orders' });
  }
});

module.exports = router;
