const express = require('express');
const router = express.Router();
const { Users } = require('../db');
const { requireAdmin } = require('../middleware/auth');

// ── GET /api/users (Admin only) ──────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const list = Users.getAll();
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve members' });
  }
});

// ── PATCH /api/users/:id/role (Admin only) ───────────────────
router.patch('/:id/role', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role || !['customer', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be customer or admin.' });
  }

  try {
    const user = Users.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't allow self-demotion if it's the primary admin, or check logic
    if (user.email === 'tobi268820@gmail.com' && role !== 'admin') {
      return res.status(400).json({ error: 'Primary admin role cannot be changed' });
    }

    Users.updateRole(id, role);
    const updated = Users.findById(id);
    delete updated.password;
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

module.exports = router;
