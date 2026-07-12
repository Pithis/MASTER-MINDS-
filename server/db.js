// ═══════════════════════════════════════════════════════════════
// MASTERMINDZ SPORTZ — SQLite Database Layer
// ═══════════════════════════════════════════════════════════════
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'database', 'mastermindz.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

// ── Schema ──────────────────────────────────────────────────
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT,
      phone       TEXT DEFAULT '',
      role        TEXT DEFAULT 'customer' CHECK(role IN ('customer','admin')),
      verified    INTEGER DEFAULT 0,
      avatar      TEXT DEFAULT '',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      price         REAL NOT NULL,
      category      TEXT NOT NULL,
      sub_category  TEXT DEFAULT '',
      stock         INTEGER DEFAULT 0,
      gst           REAL DEFAULT 18,
      badge         TEXT DEFAULT '',
      sale_name     TEXT DEFAULT '',
      sale_percent  REAL DEFAULT 0,
      rating        REAL DEFAULT 4.5,
      reviews       INTEGER DEFAULT 0,
      image         TEXT DEFAULT '',
      description   TEXT DEFAULT '',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         TEXT,
      customer_name   TEXT NOT NULL,
      customer_email  TEXT DEFAULT '',
      customer_phone  TEXT DEFAULT '',
      address         TEXT DEFAULT '',
      total           REAL NOT NULL,
      status          TEXT DEFAULT 'processing',
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

    CREATE TABLE IF NOT EXISTS order_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER NOT NULL,
      product_id TEXT DEFAULT '',
      name       TEXT NOT NULL,
      price      REAL NOT NULL,
      qty        INTEGER NOT NULL,
      image      TEXT DEFAULT '',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name   TEXT DEFAULT 'Guest',
      customer_email  TEXT DEFAULT '',
      address         TEXT DEFAULT '',
      city            TEXT DEFAULT '',
      zip             TEXT DEFAULT '',
      phone_code      TEXT DEFAULT '+91',
      phone           TEXT DEFAULT '',
      total           REAL DEFAULT 0,
      status          TEXT DEFAULT 'pending',
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id  INTEGER NOT NULL,
      product_id    TEXT DEFAULT '',
      name          TEXT NOT NULL,
      price         REAL NOT NULL,
      qty           INTEGER NOT NULL,
      gst           REAL DEFAULT 0,
      image         TEXT DEFAULT '',
      FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS verifications (
      email       TEXT PRIMARY KEY,
      code        TEXT NOT NULL,
      name        TEXT NOT NULL,
      password    TEXT NOT NULL,
      phone       TEXT DEFAULT '',
      expires_at  DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      title         TEXT NOT NULL,
      addr          TEXT NOT NULL,
      city          TEXT NOT NULL,
      zip           TEXT NOT NULL,
      phone_code    TEXT DEFAULT '+91',
      phone         TEXT NOT NULL,
      is_default    INTEGER DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
  `);
}

// ── User Operations ─────────────────────────────────────────
const Users = {
  findByEmail(email) {
    return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
  },
  findById(id) {
    return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  getAll() {
    return getDb().prepare('SELECT id, name, email, phone, role, verified, avatar, created_at as createdAt FROM users ORDER BY created_at DESC').all();
  },
  create({ name, email, password, phone, role, verified, avatar }) {
    const stmt = getDb().prepare(
      'INSERT INTO users (name, email, password, phone, role, verified, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(name, email, password || null, phone || '', role || 'customer', verified ? 1 : 0, avatar || '');
    return result.lastInsertRowid;
  },
  update(id, fields) {
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    vals.push(id);
    getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  },
  updateRole(id, role) {
    getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  }
};

// ── Product Operations ──────────────────────────────────────
const Products = {
  getAll() {
    const rows = getDb().prepare('SELECT * FROM products ORDER BY name').all();
    return rows.map(mapProductRow);
  },
  findById(id) {
    const row = getDb().prepare('SELECT * FROM products WHERE id = ?').get(id);
    return row ? mapProductRow(row) : null;
  },
  upsert(p) {
    const stmt = getDb().prepare(`
      INSERT INTO products (id, name, price, category, sub_category, stock, gst, badge, sale_name, sale_percent, rating, reviews, image, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, price=excluded.price, category=excluded.category,
        sub_category=excluded.sub_category, stock=excluded.stock, gst=excluded.gst,
        badge=excluded.badge, sale_name=excluded.sale_name, sale_percent=excluded.sale_percent,
        rating=excluded.rating, reviews=excluded.reviews, image=excluded.image, description=excluded.description
    `);
    stmt.run(
      p.id, p.name, p.price, p.category, p.subCategory || p.sub_category || '',
      p.stock, p.gst || 18, p.badge || '', p.saleName || p.sale_name || '',
      p.salePercent || p.sale_percent || 0, p.rating || 4.5, p.reviews || 0,
      p.image || '', p.desc || p.description || ''
    );
  },
  updateStock(id, delta) {
    getDb().prepare('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?').run(delta, id);
  },
  setStock(id, stock) {
    getDb().prepare('UPDATE products SET stock = ? WHERE id = ?').run(Math.max(0, stock), id);
  },
  delete(id) {
    getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
  },
  count() {
    return getDb().prepare('SELECT COUNT(*) as cnt FROM products').get().cnt;
  }
};

function mapProductRow(r) {
  return {
    id: r.id, name: r.name, price: r.price, category: r.category,
    subCategory: r.sub_category, stock: r.stock, gst: r.gst,
    badge: r.badge, saleName: r.sale_name, salePercent: r.sale_percent,
    rating: r.rating, reviews: r.reviews, image: r.image,
    desc: r.description, createdAt: r.created_at
  };
}

// ── Order Operations ────────────────────────────────────────
const Orders = {
  getAll() {
    const orders = getDb().prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    return orders.map(o => ({ ...mapOrderRow(o), items: this.getItems(o.id) }));
  },
  getByUserId(userId) {
    const orders = getDb().prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(String(userId));
    return orders.map(o => ({ ...mapOrderRow(o), items: this.getItems(o.id) }));
  },
  findById(id) {
    const o = getDb().prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!o) return null;
    return { ...mapOrderRow(o), items: this.getItems(o.id) };
  },
  create({ userId, customerName, customerEmail, customerPhone, address, total, status, items }) {
    const stmt = getDb().prepare(
      'INSERT INTO orders (user_id, customer_name, customer_email, customer_phone, address, total, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(String(userId || ''), customerName, customerEmail || '', customerPhone || '', address || '', total, status || 'processing');
    const orderId = result.lastInsertRowid;

    const itemStmt = getDb().prepare(
      'INSERT INTO order_items (order_id, product_id, name, price, qty, image) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const stockStmt = getDb().prepare(
      'UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?'
    );
    const insertItems = getDb().transaction((items) => {
      for (const i of items) {
        itemStmt.run(orderId, i.id || '', i.name, i.price, i.qty, i.image || '');
        if (i.id) {
          stockStmt.run(i.qty, i.id);
        }
      }
    });
    insertItems(items || []);
    return orderId;
  },
  updateStatus(id, status) {
    getDb().prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  },
  getItems(orderId) {
    return getDb().prepare('SELECT product_id as id, name, price, qty, image FROM order_items WHERE order_id = ?').all(orderId);
  }
};

function mapOrderRow(o) {
  return {
    id: o.id, userId: o.user_id, customerName: o.customer_name,
    customerEmail: o.customer_email, customerPhone: o.customer_phone,
    address: o.address, total: o.total, status: o.status, createdAt: o.created_at
  };
}

// ── Quotation Operations ────────────────────────────────────
const Quotations = {
  getAll() {
    const rows = getDb().prepare('SELECT * FROM quotations ORDER BY created_at DESC').all();
    return rows.map(q => ({ ...mapQuotationRow(q), items: this.getItems(q.id) }));
  },
  findById(id) {
    const q = getDb().prepare('SELECT * FROM quotations WHERE id = ?').get(id);
    if (!q) return null;
    return { ...mapQuotationRow(q), items: this.getItems(q.id) };
  },
  create({ customerName, customerEmail, address, city, zip, phoneCode, phone, total, status, items }) {
    const stmt = getDb().prepare(
      'INSERT INTO quotations (customer_name, customer_email, address, city, zip, phone_code, phone, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(customerName || 'Guest', customerEmail || '', address || '', city || '', zip || '', phoneCode || '+91', phone || '', total || 0, status || 'pending');
    const qId = result.lastInsertRowid;

    const itemStmt = getDb().prepare(
      'INSERT INTO quotation_items (quotation_id, product_id, name, price, qty, gst, image) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insertItems = getDb().transaction((items) => {
      for (const i of items) {
        itemStmt.run(qId, i.id || '', i.name, i.price, i.qty, i.gst || 0, i.image || '');
      }
    });
    insertItems(items || []);
    return qId;
  },
  update(id, items, total) {
    // Update items
    getDb().prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(id);
    const itemStmt = getDb().prepare(
      'INSERT INTO quotation_items (quotation_id, product_id, name, price, qty, gst, image) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insertItems = getDb().transaction((items) => {
      for (const i of items) {
        itemStmt.run(id, i.id || '', i.name, i.price, i.qty, i.gst || 0, i.image || '');
      }
    });
    insertItems(items || []);
    getDb().prepare('UPDATE quotations SET total = ? WHERE id = ?').run(total, id);
  },
  getItems(qId) {
    return getDb().prepare('SELECT product_id as id, name, price, qty, gst, image FROM quotation_items WHERE quotation_id = ?').all(qId);
  }
};

function mapQuotationRow(q) {
  return {
    id: q.id, customerName: q.customer_name, customerEmail: q.customer_email,
    address: q.address, city: q.city, zip: q.zip, phoneCode: q.phone_code,
    phone: q.phone, total: q.total, status: q.status, createdAt: q.created_at
  };
}

// ── Verification Operations ─────────────────────────────────
const Verifications = {
  create({ email, code, name, password, phone }) {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    getDb().prepare(
      'INSERT OR REPLACE INTO verifications (email, code, name, password, phone, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(email, code, name, password, phone || '', expiresAt);
  },
  findByEmail(email) {
    return getDb().prepare('SELECT * FROM verifications WHERE email = ?').get(email);
  },
  delete(email) {
    getDb().prepare('DELETE FROM verifications WHERE email = ?').run(email);
  }
};

// ── Seed Data ───────────────────────────────────────────────
function seedAdmin() {
  const adminEmail = 'tobi268820@gmail.com';
  const existing = Users.findByEmail(adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync('Admin123', 10);
    Users.create({
      name: 'Admin Tobi',
      email: adminEmail,
      password: hash,
      phone: '+44 7000 000000',
      role: 'admin',
      verified: true,
      avatar: 'https://ui-avatars.com/api/?name=Tobi&background=0f766e&color=fff'
    });
    console.log('✅ Admin user seeded');
  }
}

function seedProducts(products) {
  const count = Products.count();
  if (count >= products.length) {
    console.log(`✅ Products already seeded (${count} products)`);
    return;
  }
  console.log(`🌱 Seeding ${products.length} products...`);
  const upsert = getDb().transaction((prods) => {
    for (const p of prods) {
      Products.upsert(p);
    }
  });
  upsert(products);
  console.log(`✅ ${products.length} products seeded`);
}

// ── Address Operations ──────────────────────────────────────
const Addresses = {
  getByUserId(userId) {
    return getDb().prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC').all(userId);
  },
  findById(id) {
    return getDb().prepare('SELECT * FROM addresses WHERE id = ?').get(id);
  },
  create({ userId, title, addr, city, zip, phoneCode, phone, isDefault }) {
    if (isDefault) {
      getDb().prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(userId);
    }
    const stmt = getDb().prepare(
      'INSERT INTO addresses (user_id, title, addr, city, zip, phone_code, phone, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(userId, title, addr, city, zip, phoneCode || '+91', phone, isDefault ? 1 : 0);
    return result.lastInsertRowid;
  },
  update(id, userId, { title, addr, city, zip, phoneCode, phone, isDefault }) {
    if (isDefault) {
      getDb().prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(userId);
    }
    const stmt = getDb().prepare(`
      UPDATE addresses 
      SET title = ?, addr = ?, city = ?, zip = ?, phone_code = ?, phone = ?, is_default = ?
      WHERE id = ? AND user_id = ?
    `);
    stmt.run(title, addr, city, zip, phoneCode || '+91', phone, isDefault ? 1 : 0, id, userId);
  },
  delete(id, userId) {
    getDb().prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(id, userId);
  },
  setDefault(id, userId) {
    getDb().prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(userId);
    getDb().prepare('UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  }
};

module.exports = {
  getDb, Users, Products, Orders, Quotations, Verifications, Addresses,
  seedAdmin, seedProducts
};
