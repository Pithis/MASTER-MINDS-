const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, seedAdmin, seedProducts } = require('./db');
const productsSeed = require('./products-seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Parse JSON and Form Data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize SQLite database connection
getDb();

// Seed database on startup
try {
  seedAdmin();
  seedProducts(productsSeed);
} catch (err) {
  console.error('Database seeding failed:', err);
}

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/users', require('./routes/users'));
app.use('/api/instore', require('./routes/instore'));
app.use('/api/addresses', require('./routes/addresses'));

// ── Static Files ──────────────────────────────────────────────
// Serve index.html, styles.css, app.js, and static assets from the parent directory
app.use(express.static(path.join(__dirname, '..')));

// Fallback all other client requests to index.html (Single Page App routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🎱 MASTERMINDZ SPORTZ SECURE BACKEND RUNNING`);
  console.log(`🔗 Local Address: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
