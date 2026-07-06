const express = require('express');
const router = express.Router();
const { Orders, Products, getDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');

// ── POST /api/instore/sale (POS Log Sale, Admin only) ─────────
router.post('/sale', requireAdmin, async (req, res) => {
  const { productId, qty, price, customerName } = req.body;

  if (!productId || !qty || price === undefined) {
    return res.status(400).json({ error: 'Product ID, quantity, and price are required' });
  }

  const db = getDb();
  try {
    const product = Products.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.stock < qty) {
      return res.status(400).json({ error: `Not enough stock. Available: ${product.stock}` });
    }

    // Wrap stock update and order creation in a SQLite transaction
    const executeSale = db.transaction(() => {
      // 1. Decrement stock
      Products.updateStock(productId, -qty);

      // 2. Create order
      const orderId = Orders.create({
        userId: 'offline',
        customerName: `${customerName || 'Offline Customer'} (In-Store)`,
        customerEmail: 'in-store@mastermindzsportz.local',
        customerPhone: '',
        address: 'In-Store Purchase',
        items: [{
          id: product.id,
          name: product.name,
          price: price,
          qty: qty,
          image: product.image
        }],
        total: qty * price,
        status: 'delivered'
      });

      return orderId;
    });

    const orderId = executeSale();
    const order = Orders.findById(orderId);
    res.status(201).json({ success: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process in-store sale' });
  }
});

module.exports = router;
