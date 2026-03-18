// ============================================================
// MASTERMINDZ SPORTZ — Full-Featured E-Commerce App
// Local DB: IndexedDB | Auth + Email Verification | Admin Panel
// ============================================================

// ── IndexedDB Layer ──────────────────────────────────────────
const DB = (() => {
  let db;
  const DB_NAME = 'MastermindzSportzDB', DB_VER = 3;

  function open() {
    return new Promise((res, rej) => {
      if (db) return res(db);
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('users')) {
          const us = d.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
          us.createIndex('email', 'email', { unique: true });
        }
        if (!d.objectStoreNames.contains('orders')) {
          const os = d.createObjectStore('orders', { keyPath: 'id', autoIncrement: true });
          os.createIndex('userId', 'userId');
          os.createIndex('status', 'status');
        }
        if (!d.objectStoreNames.contains('products')) {
          d.createObjectStore('products', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('verifications')) {
          d.createObjectStore('verifications', { keyPath: 'email' });
        }
        if (!d.objectStoreNames.contains('sessions')) {
          d.createObjectStore('sessions', { keyPath: 'token' });
        }
      };
      req.onsuccess = e => { db = e.target.result; res(db); };
      req.onerror = () => rej(req.error);
    });
  }

  async function getAll(store, indexName, key) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, 'readonly');
      const s = t.objectStore(store);
      const req = indexName ? s.index(indexName).getAll(key) : s.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  async function get(store, key) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, 'readonly');
      const req = t.objectStore(store).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  async function put(store, val) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, 'readwrite');
      const req = t.objectStore(store).put(val);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  async function del(store, key) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, 'readwrite');
      const req = t.objectStore(store).delete(key);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  }

  async function getByIndex(store, index, key) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, 'readonly');
      const req = t.objectStore(store).index(index).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  async function clear(store) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, 'readwrite');
      const req = t.objectStore(store).clear();
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  }

  return { open, put, get, del, getAll, getByIndex, clear };
})();

// ── Auth ─────────────────────────────────────────────────────
const Auth = (() => {
  function genToken() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function genCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }
  function hashPass(p) {
    // Better hash implementation for a client-side demo (still not production secure)
    let h1 = 0xdeadbeef ^ p.length, h2 = 0x41c6ce57 ^ p.length;
    for (let i = 0, ch; i < p.length; i++) {
      ch = p.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  async function currentUser() {
    const token = localStorage.getItem('sa_token');
    if (!token) return null;
    const session = await DB.get('sessions', token);
    if (!session || session.exp < Date.now()) { localStorage.removeItem('sa_token'); return null; }
    return DB.get('users', session.userId);
  }

  async function register({ name, email, password, phone }) {
    const exists = await DB.getByIndex('users', 'email', email);
    if (exists) throw new Error('Email already registered');
    const code = genCode();
    await DB.put('verifications', {
      email, code, exp: Date.now() + 15 * 60 * 1000,
      name, password: hashPass(password), phone
    });
    return code;
  }

  async function verify(email, code) {
    const v = await DB.get('verifications', email);
    if (!v) throw new Error('No pending verification for this email');
    if (v.exp < Date.now()) throw new Error('Code expired. Please register again.');
    if (v.code !== code) throw new Error('Invalid code. Please try again.');
    const userId = await DB.put('users', {
      name: v.name, email, password: v.password, phone: v.phone,
      role: 'customer', verified: true,
      createdAt: new Date().toISOString(),
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(v.name)}&background=0f766e&color=fff`
    });
    await DB.del('verifications', email);
    // Create session
    const token = genToken();
    await DB.put('sessions', { token, userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    localStorage.setItem('sa_token', token);
    return await DB.get('users', userId);
  }

  async function login(email, password) {
    const user = await DB.getByIndex('users', 'email', email);
    if (!user) throw new Error('No account found with this email');
    if (!user.verified) throw new Error('Please verify your email first');
    if (user.password !== hashPass(password)) throw new Error('Incorrect password');
    const token = genToken();
    await DB.put('sessions', { token, userId: user.id, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    localStorage.setItem('sa_token', token);
    return user;
  }

  async function logout() {
    const token = localStorage.getItem('sa_token');
    if (token) await DB.del('sessions', token).catch(() => { });
    localStorage.removeItem('sa_token');
  }

  return { currentUser, register, verify, login, logout, hashPass };
})();
// ── Google Authentication ─────────────────────────────
async function googleLoginHandler(response) {
  const data = JSON.parse(atob(response.credential.split('.')[1]));
  const email = data.email;
  const name = data.name;
  const avatar = data.picture;

  let user = await DB.getByIndex('users', 'email', email);

  if (!user) {
    const userId = await DB.put('users', {
      name, email, password: null, phone: "",
      role: "customer", verified: true,
      createdAt: new Date().toISOString(), avatar
    });
    user = await DB.get('users', userId);
  }

  if (email === "tobi268820@gmail.com" && user.role !== "admin") {
    user.role = "admin";
    await DB.put("users", user);
  }

  const token = Auth.genToken ? Auth.genToken() : Math.random().toString(36).slice(2);
  await DB.put('sessions', { token, userId: user.id, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  localStorage.setItem("sa_token", token);

  S.user = user;
  S.userOrders = await DB.getAll('orders', 'userId', user.id);
  S.modal = null;
  showToast("Signed in with Google 🎱");
  render();
}

// ── Cart ─────────────────────────────────────────────────────
const Cart = (() => {
  let items = [];
  try { items = JSON.parse(localStorage.getItem('sa_cart') || '[]'); } catch (e) { items = []; }
  const save = () => localStorage.setItem('sa_cart', JSON.stringify(items));
  const get = () => items;
  const add = (product, qty = 1) => {
    const idx = items.findIndex(i => i.id === product.id);
    if (idx > -1) items[idx].qty += qty; else items.push({ ...product, qty });
    save(); updateCartBadge();
  };
  const remove = id => { items = items.filter(i => i.id !== id); save(); updateCartBadge(); };
  const update = (id, qty) => {
    if (qty < 1) { remove(id); return; }
    const idx = items.findIndex(i => i.id === id);
    if (idx > -1) items[idx].qty = qty; save(); updateCartBadge();
  };
  const clear = () => { items = []; save(); updateCartBadge(); };
  const total = () => items.reduce((s, i) => s + i.price * i.qty, 0);
  const count = () => items.reduce((s, i) => s + i.qty, 0);
  return { get, add, remove, update, clear, total, count };
})();

function updateCartBadge() {
  const b = document.getElementById('cart-badge');
  if (!b) return;
  const c = Cart.count();
  b.textContent = c;
  b.style.display = c ? 'flex' : 'none';
}

// ── Seed Data ─────────────────────────────────────────────────
const PRODUCTS = [
  { id: 'p1', name: 'Pro Tournament Cue', price: 149.99, category: 'Cues', badge: 'bestseller', rating: 4.8, reviews: 312, stock: 24, image: 'https://images.unsplash.com/photo-1544919982-b61976f0ba43?w=400&q=80', desc: 'Competition-grade 57" maple cue with 9.5mm tip. Used by professionals worldwide.' },
  { id: 'p2', name: 'Mastermindz sportz Ball Set (22)', price: 89.99, category: 'Balls', badge: 'new', rating: 4.9, reviews: 187, stock: 18, image: 'https://images.unsplash.com/photo-1585211969224-3e992986159d?w=400&q=80', desc: 'Full regulation set. Aramith crystal pro-quality resin balls for serious play.' },
  { id: 'p3', name: 'Billiard Table Cover', price: 59.99, category: 'Accessories', badge: '', rating: 4.6, reviews: 94, stock: 40, image: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=400&q=80', desc: 'Heavy-duty waterproof cover for 6–8 ft tables. Dustproof and UV-resistant.' },
  { id: 'p4', name: 'Cue Tip Kit (5pcs)', price: 19.99, category: 'Accessories', badge: 'sale', rating: 4.5, reviews: 210, stock: 120, image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&q=80', desc: 'Premium layered leather tips. Medium hardness. Includes cement and shaper tool.' },
  { id: 'p5', name: 'Triangle Rack — Brass', price: 29.99, category: 'Accessories', badge: '', rating: 4.7, reviews: 78, stock: 55, image: 'https://images.unsplash.com/photo-1616137148867-ab5de281a6c7?w=400&q=80', desc: 'Solid brass frame ball rack for Mastermindz sportz and pool setups. Weighted base.' },
  { id: 'p6', name: 'Cue Case — Leather 2B', price: 79.99, category: 'Cases', badge: 'new', rating: 4.8, reviews: 143, stock: 30, image: 'https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=400&q=80', desc: 'Full-grain leather 2-cue case. Padded interior, shoulder strap included.' },
];

async function seedData() {
  // Clear data as requested for a fresh start
  await DB.clear('users');
  await DB.clear('orders');
  await DB.clear('sessions');
  await DB.clear('verifications');

  const existing = await DB.getAll('products');
  if (!existing.length) {
    for (const p of PRODUCTS) await DB.put('products', p);
  }

  const adminData = {
    name: 'Admin Tobi', email: 'tobi268820@gmail.com',
    password: Auth.hashPass('Admin123'), phone: '+44 7000 000000',
    role: 'admin', verified: true,
    createdAt: new Date().toISOString(),
    avatar: 'https://ui-avatars.com/api/?name=Tobi&background=0f766e&color=fff'
  };
  await DB.put('users', adminData);
}

// ── State ─────────────────────────────────────────────────────
let S = {
  user: null, page: 'home', modal: null,
  products: [], orders: [], users: [],
  userOrders: [],
  pendingVerify: null,
  toast: null, adminTab: 'dashboard',
  shopFilter: 'All'
};

function setState(patch) { Object.assign(S, patch); render(); }

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'success', image = null) {
  const container = document.getElementById('toast-container') || (() => {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;align-items:flex-end;';
    document.body.appendChild(c);
    return c;
  })();

  const t = document.createElement('div');
  t.style.cssText = `
    background:${type === 'error' ? '#b91c1c' : '#D12200'};
    color:white;padding:14px 20px;border-radius:16px;
    box-shadow:0 8px 24px rgba(0,0,0,0.2);
    font-weight:700;font-size:14px;
    max-width:320px;line-height:1.4;display:flex;align-items:center;gap:12px;
  `;

  let innerHTML = '';
  if (image) {
    innerHTML += `<img src="${image}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0;">`;
  }
  innerHTML += `<div>${msg}</div>`;
  t.innerHTML = innerHTML;

  container.appendChild(t);

  setTimeout(() => {
    t.remove();
  }, 3500);
}

// ── Router ────────────────────────────────────────────────────
async function navigate(page) {
  if (page === 'admin') {
    if (!S.user || S.user.role !== 'admin') { showToast('Admin access required', 'error'); return; }
    await loadAdminData();
  }
  if (page === 'cart') {
    toggleCartDrawer(true);
    return;
  }
  if (page === 'orders' && !S.user) { setState({ modal: 'login' }); return; }
  if (page === 'policies') { S.page = 'policies'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

  S.page = page; render();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadAdminData() {
  S.orders = await DB.getAll('orders');
  S.users = await DB.getAll('users');
  S.products = await DB.getAll('products');
}

// ── Render ────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  if (S.page !== 'admin') app.appendChild(renderNav());
  const main = document.createElement('main');
  if (S.page === 'home') main.appendChild(renderHome());
  else if (S.page === 'shop') main.appendChild(renderShop());
  else if (S.page === 'orders') main.appendChild(renderOrders());
  else if (S.page === 'admin') main.appendChild(renderAdmin());
  else if (S.page === 'policies') main.appendChild(renderPolicies());
  app.appendChild(main);
  if (S.page !== 'admin') app.appendChild(renderFooter());
  if (S.modal) app.appendChild(renderModal(S.modal));

  lucide.createIcons();
  updateCartBadge();
}

// ── Nav ───────────────────────────────────────────────────────
function renderNav() {
  const nav = el('nav', 'nav');
  const inner = el('div', 'nav-inner container');

  const logo = mkel('a', { class: 'nav-logo', href: '#' }, null, () => navigate('home'));
  logo.innerHTML = '<img src=\"mmz%20logo%20fin%201.png\" style=\"width:5cm;height:1cm;object-fit:contain;\">';

  const links = el('div', 'nav-links');
  [['home', 'Home'], ['shop', 'Shop'], ['orders', 'My Orders']].forEach(([p, l]) => {
    const a = mkel('a', { class: 'nav-link', href: '#' }, l, () => navigate(p));
    links.appendChild(a);
  });
  if (S.user?.role === 'admin') {
    const a = mkel('a', { class: 'nav-link', href: '#', style: 'color:var(--emerald)' }, '⚙ Admin', () => navigate('admin'));
    links.appendChild(a);
  }

  const actions = el('div', 'nav-actions');
  const cartWrap = el('div', '', { position: 'relative' });
  const cartBtn = mkel('button', { class: 'btn btn-outline', style: 'padding:10px 14px' }, '<i data-lucide="shopping-cart"></i>', () => navigate('cart'));
  cartBtn.innerHTML = '<i data-lucide="shopping-cart"></i>';
  const badge = mkel('span', { id: 'cart-badge', class: 'nav-badge', style: `display:${Cart.count() ? 'flex' : 'none'}` }, Cart.count());
  cartWrap.appendChild(cartBtn); cartWrap.appendChild(badge); actions.appendChild(cartWrap);

  if (S.user) {
    const av = mkel('img', { src: S.user.avatar, style: 'width:36px;height:36px;border-radius:50%;object-fit:cover;cursor:pointer' }, null, () => setState({ modal: 'profile' }));
    const lb = mkel('button', { class: 'btn', style: 'background:#f1f5f9;color:#64748b;padding:8px 12px;border-radius:999px' }, '<i data-lucide="log-out"></i>', doLogout);
    lb.innerHTML = '<i data-lucide="log-out"></i>';
    actions.appendChild(av); actions.appendChild(lb);
  } else {
    const si = mkel('button', { class: 'btn btn-outline' }, 'Sign In', () => setState({ modal: 'login' }));
    const reg = mkel('button', { class: 'btn btn-primary' }, 'Register', () => setState({ modal: 'register' }));
    actions.appendChild(si); actions.appendChild(reg);
  }

  inner.appendChild(logo); inner.appendChild(links); inner.appendChild(actions);
  nav.appendChild(inner);
  return nav;
}

// ── Home ──────────────────────────────────────────────────────
function renderHome() {
  const frag = document.createDocumentFragment();

  const heroSec = el('section', 'section');
  const hInner = el('div', 'container');
  hInner.innerHTML = `
    <div class="hero">
      <div class="hero-card">
        <div style="margin-bottom:16px"><span class="badge badge-emerald"><i data-lucide="zap" style="width:12px;height:12px"></i> NEW ARRIVALS</span></div>
        <h1 class="hero-title">Master<br>Your Game</h1>
        <p class="hero-sub">Premium Mastermindz sportz &amp; billiards equipment. Trusted by champions, loved by enthusiasts worldwide.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" onclick="navigate('shop')"><i data-lucide="shopping-bag"></i> Shop Now</button>
          <button class="btn btn-ghost" onclick="navigate('shop')">View Catalog</button>
        </div>
        <div class="stat-grid">
          <div class="stat-card"><strong>2,400+</strong><span style="font-size:12px;color:#94a3b8">Products</span></div>
          <div class="stat-card"><strong>98%</strong><span style="font-size:12px;color:#94a3b8">Satisfaction</span></div>
          <div class="stat-card"><strong>48hr</strong><span style="font-size:12px;color:#94a3b8">Delivery</span></div>
        </div>
      </div>
      <div class="hero-image">
        <img src="https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=700&q=80" alt="Mastermindz sportz Table" />
      </div>
    </div>`;
  heroSec.appendChild(hInner); frag.appendChild(heroSec);

  const featSec = el('section', 'section');
  const fI = el('div', 'container');
  fI.innerHTML = `<div class="feature-list">
    ${[['truck', 'Free Shipping', 'On orders over £75'], ['shield-check', 'Authentic Gear', '100% genuine products'], ['rotate-ccw', 'Easy Returns', '30-day hassle-free'], ['headphones', 'Expert Support', 'Mon–Sat 9am–6pm']].map(([ic, t, s]) => `
    <div class="feature"><div class="feature-icon"><i data-lucide="${ic}" style="width:20px;height:20px"></i></div>
    <div><div style="font-weight:700;font-size:14px">${t}</div><div style="font-size:12px;color:var(--muted)">${s}</div></div></div>`).join('')}
  </div>`;
  featSec.appendChild(fI); frag.appendChild(featSec);

  const prodSec = el('section', 'section');
  const pI = el('div', 'container');
  pI.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;flex-wrap:wrap;gap:16px">
      <div><h2 class="title">Featured Products</h2><p class="subtitle">Handpicked by our experts</p></div>
      <button class="btn btn-outline" onclick="navigate('shop')">View All <i data-lucide="arrow-right" style="width:16px;height:16px"></i></button>
    </div>
    <div class="grid grid-3">${(S.products || []).slice(0, 3).map(productCardHTML).join('')}</div>`;
  prodSec.appendChild(pI); frag.appendChild(prodSec);

  const ctaSec = el('section', 'section');
  const cI = el('div', 'container');
  cI.innerHTML = `<div class="cta">
    <div style="max-width:540px;position:relative;z-index:1">
      <span class="badge badge-emerald" style="margin-bottom:16px">Newsletter</span>
      <h2 style="font-family:'Bebas Neue',serif;font-size:clamp(28px,4vw,44px);margin:0 0 12px;letter-spacing:0.02em">GET 10% OFF YOUR FIRST ORDER</h2>
      <p style="color:rgba(255,255,255,0.75);margin-bottom:24px">Subscribe for exclusive deals, pro tips, and tournament news.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <input class="input" id="nl-email" placeholder="Your email address" style="max-width:280px;background:rgba(255,255,255,0.12);color:white;border-color:rgba(255,255,255,0.2)" />
        <button class="btn btn-primary" onclick="showToast('Thanks! Your 10% code has been sent 🎱')">Subscribe</button>
      </div>
    </div>
  </div>`;
  ctaSec.appendChild(cI); frag.appendChild(ctaSec);

  return frag;
}

function productCardHTML(p) {
  const stars = '★'.repeat(Math.floor(p.rating)) + '☆'.repeat(5 - Math.floor(p.rating));
  const badgeMap = { bestseller: 'badge-emerald', new: 'badge-blue', sale: 'badge-amber' };
  return `
    <div class="card product-card">
      <div class="product-media" style="position:relative">
        <img src="${p.image}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover" />
        ${p.badge ? `<span class="badge ${badgeMap[p.badge] || 'badge-blue'}" style="position:absolute;top:12px;left:12px">${p.badge.toUpperCase()}</span>` : ''}
        <button class="btn btn-primary quick-view-btn" onclick="openQuickView('${p.id}')">Quick View</button>
      </div>
      <div class="product-body">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">${p.category}</div>
        <div class="product-title">${p.name}</div>
        <div style="font-size:12px;color:#f59e0b;margin:4px 0">${stars} <span style="color:var(--muted)">(${p.reviews})</span></div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.5">${p.desc.slice(0, 72)}…</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="product-price" style="font-size:20px">£${p.price.toFixed(2)}</span>
          <button class="btn btn-primary" style="padding:8px 14px;font-size:13px" onclick="addToCart('${p.id}', event)">
            <i data-lucide="shopping-cart" style="width:14px;height:14px"></i> Add
          </button>
        </div>
        <div style="font-size:11px;color:${p.stock < 10 ? 'var(--red)' : 'var(--emerald)'};margin-top:6px">
          ${p.stock < 10 ? `⚠ Only ${p.stock} left` : `✓ ${p.stock} in stock`}
        </div>
      </div>
    </div>`;
}

function addToCart(id, event) {
  const p = S.products.find(x => x.id === id);
  if (!p) return;
  if (p.stock <= 0) return showToast('Sorry, this item is out of stock!', 'error');
  Cart.add(p);
  showToast(`${p.name} added to cart 🎱`, 'success', p.image);
}

// ── Shop ──────────────────────────────────────────────────────
function renderShop() {
  const wrap = el('div', 'container section');
  const prods = S.products || [];
  const cats = ['All', ...new Set(prods.map(p => p.category))];
  const f = S.shopFilter || 'All';
  const filtered = f === 'All' ? prods : prods.filter(p => p.category === f);

  // Calculate relative left offset for sliding tab roughly
  const activeIdx = cats.indexOf(f);

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;flex-wrap:wrap;gap:16px">
      <div><h2 class="title">Shop All Products</h2><p class="subtitle">${filtered.length} products found</p></div>
      <div style="position:relative;display:flex;gap:8px;flex-wrap:wrap;background:white;padding:6px;border-radius:14px;border:1px solid var(--line);box-shadow:0 4px 12px rgba(0,0,0,0.02)">
        <div class="tab-indicator" style="position:absolute;top:6px;bottom:6px;width:72px;background:var(--emerald);border-radius:10px;transition:0.3s cubic-bezier(0.4, 0, 0.2, 1);left:calc(6px + ${activeIdx * 80}px);z-index:0"></div>
        ${cats.map(c => `<button class="btn" style="position:relative;z-index:1;padding:8px 18px;font-size:13px;background:transparent;box-shadow:none;border:none;min-width:72px;color:${f === c ? 'white' : 'var(--muted)'};transition:color 0.3s;" onclick="setShopFilter('${c}', event)">${c}</button>`).join('')}
      </div>
    </div>
    <div class="grid grid-3" id="shop-grid" style="position:relative">${filtered.length ? filtered.map(productCardHTML).join('') : Array(6).fill('<div class="card product-card" style="padding:20px"><div class="skeleton-shimmer" style="aspect-ratio:1/1;border-radius:16px;margin-bottom:20px"></div><div class="skeleton-shimmer" style="height:20px;width:70%;margin-bottom:8px"></div><div class="skeleton-shimmer" style="height:14px;width:40%"></div></div>').join('')}</div>`;
  return wrap;
}

function setShopFilter(f, event) {
  S.shopFilter = f; render();
}

// ── Cart Drawer ───────────────────────────────────────────────
function toggleCartDrawer(open) {
  let d = document.getElementById('cart-drawer');
  if (!d) {
    d = document.createElement('div');
    d.id = 'cart-drawer';
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;justify-content:flex-end;background:rgba(15, 23, 42, 0.45);backdrop-filter:blur(4px);';

    const panel = document.createElement('div');
    panel.id = 'cart-drawer-panel';
    panel.className = 'cart-drawer-panel';
    panel.style.cssText = 'width:min(440px, 100vw);background:white;height:100vh;box-shadow:-10px 0 40px rgba(0,0,0,0.1);display:flex;flex-direction:column;';

    d.appendChild(panel);
    document.body.appendChild(d);

    d.addEventListener('click', e => { if (e.target === d) toggleCartDrawer(false); });
  }

  if (open) {
    d.style.display = 'flex';
    d.querySelector('#cart-drawer-panel').innerHTML = renderCartHTML();
    lucide.createIcons();
  } else {
    d.style.display = 'none';
  }
}

function renderCartHTML() {
  const items = Cart.get();
  if (!items.length) {
    return `<div style="display:flex;flex-direction:column;height:100%">
      <div style="padding:24px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;font-size:20px">Your Cart</h2>
        <button class="btn" style="padding:6px;background:#f1f5f9;border-radius:8px" onclick="toggleCartDrawer(false)">✕</button>
      </div>
      <div style="text-align:center;padding:80px 20px;flex:1;display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:72px;margin-bottom:16px">🎱</div>
        <h3 style="margin:0 0 8px">Your cart is empty</h3>
        <p style="color:var(--muted);margin-bottom:24px">Add some equipment to get started</p>
        <button class="btn btn-primary" onclick="toggleCartDrawer(false); navigate('shop')">Browse Shop</button>
      </div>
    </div>`;
  }

  const sub = Cart.total(), ship = sub > 75 ? 0 : 6.99, total = sub + ship;
  return `
    <div style="display:flex;flex-direction:column;height:100%">
      <div style="padding:24px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;font-size:20px">Your Cart <span style="color:var(--muted);font-size:14px;font-weight:600">(${Cart.count()} items)</span></h2>
        <button class="btn" style="padding:6px;background:#f1f5f9;border-radius:8px" onclick="toggleCartDrawer(false)">✕</button>
      </div>
      
      <div style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:16px;">
        ${items.map(item => `
          <div style="display:flex;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--line);align-items:center">
            <img src="${item.image}" style="width:72px;height:72px;border-radius:12px;object-fit:cover" />
            <div style="flex:1">
              <div style="font-weight:700;margin-bottom:2px;font-size:14px">${item.name}</div>
              <div style="color:var(--emerald);font-weight:800;font-size:16px;margin-bottom:8px">£${item.price.toFixed(2)}</div>
              <div style="display:flex;align-items:center;gap:8px">
                <button class="btn btn-outline" style="padding:4px 8px;border-radius:6px;font-size:12px" onclick="cartUpdate('${item.id}',${item.qty - 1})">−</button>
                <span style="font-weight:700;min-width:20px;text-align:center;font-size:13px">${item.qty}</span>
                <button class="btn btn-outline" style="padding:4px 8px;border-radius:6px;font-size:12px" onclick="cartUpdate('${item.id}',${item.qty + 1})">+</button>
                <button class="btn" style="padding:4px 8px;background:#fee2e2;color:#b91c1c;border-radius:6px;margin-left:6px" onclick="cartRemove('${item.id}')">
                  <i data-lucide="trash-2" style="width:12px;height:12px"></i>
                </button>
              </div>
            </div>
          </div>`).join('')}
      </div>
      
      <div style="padding:24px;background:#f8fafc;border-top:1px solid var(--line);">
        <div style="display:flex;flex-direction:column;gap:12px;font-size:14px;margin-bottom:20px">
          <div style="display:flex;justify-content:space-between"><span>Subtotal</span><strong>£${sub.toFixed(2)}</strong></div>
          <div style="display:flex;justify-content:space-between"><span>Shipping</span><strong style="color:${ship === 0 ? 'var(--emerald)' : 'inherit'}">${ship === 0 ? 'FREE' : '£' + ship.toFixed(2)}</strong></div>
          <hr style="border:none;border-top:1px dashed var(--line);margin:4px 0">
          <div style="display:flex;justify-content:space-between;font-size:18px"><strong>Total</strong><strong style="color:var(--emerald)">£${total.toFixed(2)}</strong></div>
        </div>
        <button class="btn btn-primary" style="width:100%;padding:16px;font-size:16px;box-shadow:0 10px 20px rgba(15,118,110,0.2)" onclick="doCheckout()">
          <i data-lucide="credit-card"></i> Proceed to Checkout
        </button>
      </div>
    </div>`;
}

function cartUpdate(id, qty) { Cart.update(id, qty); document.getElementById('cart-drawer-panel').innerHTML = renderCartHTML(); lucide.createIcons(); }
function cartRemove(id) { Cart.remove(id); document.getElementById('cart-drawer-panel').innerHTML = renderCartHTML(); lucide.createIcons(); }

function doCheckout() {
  toggleCartDrawer(false);
  if (!S.user) { setState({ modal: 'login' }); return; }
  setState({ modal: 'checkout' });
}

// ── Orders ────────────────────────────────────────────────────
function renderOrders() {
  const wrap = el('div', 'container section');
  const orders = S.userOrders || [];
  wrap.innerHTML = `
    <h2 class="title" style="margin-bottom:24px">My Orders</h2>
    ${!orders.length
      ? `<div class="card" style="padding:60px;text-align:center">
          <div style="font-size:48px;margin-bottom:12px">📦</div>
          <h3 style="margin:0 0 8px">No orders yet</h3>
          <p style="color:var(--muted)">Your orders will appear here after checkout</p>
          <button class="btn btn-primary" onclick="navigate('shop')" style="margin-top:16px">Start Shopping</button>
         </div>`
      : `<div style="display:flex;flex-direction:column;gap:16px">
          ${orders.slice().reverse().map(o => `
            <div class="card" style="padding:24px">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
                <div>
                  <div style="font-weight:700;font-size:16px">Order #${String(o.id).padStart(4, '0')}</div>
                  <div style="font-size:13px;color:var(--muted)">${new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                </div>
                <span class="badge-status ${o.status === 'delivered' ? 'badge-emerald' : o.status === 'processing' ? 'badge-amber' : 'badge-blue'}">${o.status}</span>
                <div style="text-align:right">
                  <div style="font-size:18px;font-weight:800;color:var(--emerald)">£${o.total.toFixed(2)}</div>
                  <div style="font-size:12px;color:var(--muted)">${o.items.length} item(s)</div>
                </div>
              </div>
              <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--line);display:flex;gap:12px;flex-wrap:wrap">
                ${o.items.map(i => `<div style="display:flex;align-items:center;gap:8px;background:#f8fafc;padding:8px 12px;border-radius:10px">
                  <img src="${i.image}" style="width:36px;height:36px;border-radius:8px;object-fit:cover">
                  <span style="font-size:13px;font-weight:600">${i.name} ×${i.qty}</span>
                </div>`).join('')}
              </div>
              <div style="margin-top:12px;font-size:12px;color:var(--muted)">📍 ${o.address}</div>
            </div>`).join('')}
         </div>`}`;
  return wrap;
}

// ── Admin ─────────────────────────────────────────────────────
function renderAdmin() {
  const wrap = el('div', 'layout-admin');
  const sidebar = el('div', 'sidebar');
  const logo = el('div', 'nav-logo');
  logo.style.marginBottom = '32px';
  logo.innerHTML = '<img src="mmz%20logo%20fin%201.png" style="height:24px;margin-right:8px;vertical-align:middle;display:inline-block;">MASTERMINDZ<br><span style="color:var(--text);font-weight:400;font-size:16px;">SPORTZ</span>';
  sidebar.appendChild(logo);

  [['dashboard', 'layout-dashboard', 'Dashboard'],
  ['orders', 'package', 'Orders'],
  ['products', 'shopping-bag', 'Products'],
  ['users', 'users', 'Members']].forEach(([tab, icon, label]) => {
    const a = mkel('a', { href: '#', class: tab === S.adminTab ? 'active' : '' },
      `<i data-lucide="${icon}" style="width:18px;height:18px"></i> ${label}`,
      () => { S.adminTab = tab; render(); });
    a.innerHTML = `<i data-lucide="${icon}" style="width:18px;height:18px"></i> ${label}`;
    sidebar.appendChild(a);
  });

  const backLink = mkel('a', { href: '#', style: 'margin-top:24px' },
    '<i data-lucide="arrow-left" style="width:18px;height:18px"></i> Back to Site',
    () => navigate('home'));
  backLink.innerHTML = '<i data-lucide="arrow-left" style="width:18px;height:18px"></i> Back to Site';
  sidebar.appendChild(backLink);
  wrap.appendChild(sidebar);

  const content = el('div', 'admin-content');
  if (S.adminTab === 'dashboard') content.appendChild(renderAdminDashboard());
  else if (S.adminTab === 'orders') content.appendChild(renderAdminOrders());
  else if (S.adminTab === 'products') content.appendChild(renderAdminProducts());
  else if (S.adminTab === 'users') content.appendChild(renderAdminUsers());
  wrap.appendChild(content);
  return wrap;
}

function renderAdminDashboard() {
  const orders = S.orders || [];
  const users = S.users || [];
  const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const pending = orders.filter(o => o.status === 'processing').length;

  const dailyRev = orders.filter(o => {
    const d = new Date(o.createdAt);
    const today = new Date();
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).reduce((s, o) => s + (o.total || 0), 0);

  const monthRev = orders.filter(o => {
    const d = new Date(o.createdAt);
    const today = new Date();
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).reduce((s, o) => s + (o.total || 0), 0);

  const frag = document.createDocumentFragment();
  const hdr = document.createElement('div');
  hdr.style.marginBottom = '28px';
  hdr.style.display = 'flex';
  hdr.style.justifyContent = 'space-between';
  hdr.style.alignItems = 'center';
  hdr.innerHTML = `
    <div><h2 class="title">Dashboard</h2><p class="subtitle">Welcome back, ${S.user?.name}</p></div>
    <button class="btn btn-outline" onclick="adminExportData()"><i data-lucide="download"></i> Export Orders (CSV)</button>`;
  frag.appendChild(hdr);

  const statsGrid = document.createElement('div');
  statsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px';
  [
    ['Daily Revenue', dailyRev, 'calendar', 'rgba(209, 34, 0, 0.1)', '#D12200', true],
    ['Monthly Revenue', monthRev, 'pie-chart', '#fefce8', '#ca8a04', true],
    ['Total Revenue', revenue, 'trending-up', 'rgba(209, 34, 0, 0.15)', '#9e1900', true],
    ['Total Orders', orders.length, 'package', '#dbeafe', '#1e40af', false],
  ].forEach(([label, val, icon, bg, color, isCurrency]) => {
    const c = document.createElement('div');
    c.className = 'card'; c.style.padding = '20px';
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:0.08em;margin-bottom:8px">${label}</div>
        <div class="admin-counter" data-val="${val}" data-curr="${isCurrency}" style="font-size:24px;font-weight:800">${isCurrency ? '£0.00' : '0'}</div>
      </div>
      <div style="width:40px;height:40px;background:${bg};border-radius:12px;display:grid;place-items:center;color:${color}">
        <i data-lucide="${icon}" style="width:18px;height:18px"></i>
      </div>
    </div>`;
    statsGrid.appendChild(c);
  });
  frag.appendChild(statsGrid);

  const card = document.createElement('div');
  card.className = 'card'; card.style.padding = '24px';
  card.innerHTML = `<h3 style="margin:0 0 16px">Recent Orders</h3>
    <table class="table">
      <thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${orders.slice().reverse().slice(0, 10).map(o => `
        <tr>
          <td><strong>#${String(o.id).padStart(4, '0')}</strong></td>
          <td>${o.customerName}</td>
          <td>${o.items?.length} items</td>
          <td style="color:var(--emerald);font-weight:700">£${o.total?.toFixed(2)}</td>
          <td><span class="badge-status ${o.status === 'delivered' ? 'badge-emerald' : o.status === 'processing' ? 'badge-amber' : 'badge-blue'}">${o.status}</span></td>
          <td style="color:var(--muted);font-size:12px">${new Date(o.createdAt).toLocaleDateString()}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">No orders yet</td></tr>'}</tbody>
    </table>`;
  frag.appendChild(card);
  return frag;
}

function renderAdminOrders() {
  const orders = S.orders || [];
  const frag = document.createDocumentFragment();
  const hdr = document.createElement('div');
  hdr.style.marginBottom = '24px';
  hdr.innerHTML = `<h2 class="title">Orders</h2><p class="subtitle">${orders.length} total orders</p>`;
  frag.appendChild(hdr);

  const card = document.createElement('div');
  card.className = 'card'; card.style.overflow = 'hidden';
  card.innerHTML = `<table class="table">
    <thead><tr><th>Order ID</th><th>Customer</th><th>Email</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>${orders.slice().reverse().map(o => `
      <tr>
        <td><strong>#${String(o.id).padStart(4, '0')}</strong></td>
        <td>${o.customerName}</td>
        <td style="color:var(--muted);font-size:12px">${o.customerEmail}</td>
        <td style="color:var(--emerald);font-weight:700">£${o.total.toFixed(2)}</td>
        <td>
          <select class="input" style="padding:6px 10px;border-radius:8px;width:130px;font-size:12px;border:1px solid var(--line)" onchange="adminUpdateOrder(${o.id},this.value)">
            ${['processing', 'shipped', 'delivered', 'cancelled'].map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td style="color:var(--muted);font-size:12px">${new Date(o.createdAt).toLocaleDateString()}</td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">No orders</td></tr>'}</tbody>
  </table>`;
  frag.appendChild(card);
  return frag;
}

function renderAdminProducts() {
  const prods = S.products || [];
  const frag = document.createDocumentFragment();
  const hdr = document.createElement('div');
  hdr.style.marginBottom = '24px';
  hdr.style.display = 'flex';
  hdr.style.justifyContent = 'space-between';
  hdr.style.alignItems = 'flex-end';
  hdr.innerHTML = `
    <div><h2 class="title">Products</h2><p class="subtitle">${prods.length} products in catalogue</p></div>
    <button class="btn btn-primary" onclick="setState({modal:'product'})"><i data-lucide="plus"></i> Add Product</button>`;
  frag.appendChild(hdr);

  const card = document.createElement('div');
  card.className = 'card'; card.style.overflow = 'hidden';
  card.innerHTML = `<table class="table">
    <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
    <tbody>${prods.map(p => `
      <tr>
        <td><div style="display:flex;align-items:center;gap:12px">
          <img src="${p.image}" style="width:44px;height:44px;border-radius:10px;object-fit:cover">
          <div><div style="font-weight:700">${p.name}</div><div style="font-size:12px;color:var(--muted)">#${p.id}</div></div>
        </div></td>
        <td><span class="badge badge-blue">${p.category}</span></td>
        <td style="font-weight:700;color:var(--emerald)">£${p.price.toFixed(2)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <button class="btn btn-outline" style="padding:4px 8px;font-size:12px" onclick="adminUpdateStock('${p.id}',-1)">−</button>
            <span style="color:${p.stock < 1 ? 'var(--red)' : 'var(--emerald)'};font-weight:700;min-width:24px;text-align:center">${p.stock}</span>
            <button class="btn btn-outline" style="padding:4px 8px;font-size:12px" onclick="adminUpdateStock('${p.id}',1)">+</button>
          </div>
        </td>
        <td>
          <button class="btn" style="padding:6px;background:#fee2e2;color:#b91c1c;border-radius:8px" onclick="adminDeleteProduct('${p.id}')">
            <i data-lucide="trash-2" style="width:14px;height:14px"></i>
          </button>
        </td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--muted)">No products found</td></tr>'}</tbody>
  </table>`;
  frag.appendChild(card);
  return frag;
}

async function adminUpdateStock(id, delta) {
  const p = S.products.find(x => x.id === id);
  if (!p) return;
  p.stock = Math.max(0, p.stock + delta);
  await DB.put('products', p);
  S.products = await DB.getAll('products');
  render();
}

async function adminDeleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  await DB.del('products', id);
  S.products = await DB.getAll('products');
  showToast('Product deleted successfully');
  render();
}

function adminExportData() {
  const orders = S.orders || [];
  if (!orders.length) return showToast('No orders to export', 'error');
  let csv = 'OrderID,Customer,Email,Total,Status,Date,Items\n';
  orders.forEach(o => {
    const itemsStr = o.items.map(i => `${i.name} (x${i.qty})`).join('; ');
    csv += `${o.id},"${o.customerName}","${o.customerEmail}",${o.total.toFixed(2)},${o.status},${o.createdAt},"${itemsStr}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `MastermindzSportz_Orders_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function renderAdminUsers() {
  const admins = (S.users || []).filter(u => u.role === 'admin');
  const customers = (S.users || []).filter(u => u.role !== 'admin');
  const frag = document.createDocumentFragment();

  const hdr = document.createElement('div');
  hdr.style.marginBottom = '24px';
  hdr.innerHTML = `<h2 class="title">Members</h2><p class="subtitle">${admins.length + customers.length} total members</p>`;
  frag.appendChild(hdr);

  // Admin Table
  const adminCard = document.createElement('div');
  adminCard.className = 'card';
  adminCard.style.marginBottom = '24px';
  adminCard.innerHTML = `<h3 style="padding:20px;margin:0">Admins</h3>
    <table class="table" style="margin:0">
      <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th></tr></thead>
      <tbody>${admins.map(u => `
        <tr oncontextmenu="openUserMenu(event,'${u.email}','customer')">
          <td><div style="display:flex;align-items:center;gap:10px">
            <img src="${u.avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">
            <strong>${u.name}</strong>
          </div></td>
          <td style="color:var(--muted);font-size:13px">${u.email}</td>
          <td style="color:var(--muted);font-size:13px">${u.phone || '—'}</td>
          <td style="color:var(--muted);font-size:12px">${new Date(u.createdAt).toLocaleDateString()}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--muted)">No admins</td></tr>'}
      </tbody>
    </table>`;
  frag.appendChild(adminCard);

  // Customer Table
  const customerCard = document.createElement('div');
  customerCard.className = 'card';
  customerCard.innerHTML = `<h3 style="padding:20px;margin:0">Customers</h3>
    <table class="table" style="margin:0">
      <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th></tr></thead>
      <tbody>${customers.map(u => `
        <tr oncontextmenu="openUserMenu(event,'${u.email}','admin')">
          <td><div style="display:flex;align-items:center;gap:10px">
            <img src="${u.avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">
            <strong>${u.name}</strong>
          </div></td>
          <td style="color:var(--muted);font-size:13px">${u.email}</td>
          <td style="color:var(--muted);font-size:13px">${u.phone || '—'}</td>
          <td style="color:var(--muted);font-size:12px">${new Date(u.createdAt).toLocaleDateString()}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--muted)">No customers</td></tr>'}
      </tbody>
    </table>`;
  frag.appendChild(customerCard);

  return frag;
}

function openUserMenu(e, email, newRole) {
  e.preventDefault();

  const menu = document.createElement('div');
  menu.style.position = 'fixed';
  menu.style.top = e.clientY + 'px';
  menu.style.left = e.clientX + 'px';
  menu.style.background = 'white';
  menu.style.border = '1px solid #e2e8f0';
  menu.style.borderRadius = '10px';
  menu.style.boxShadow = '0 10px 20px rgba(0,0,0,0.1)';
  menu.style.padding = '6px';
  menu.style.zIndex = '9999';

  const btn = document.createElement('button');
  btn.className = 'btn btn-outline';
  btn.style.fontSize = '12px';
  btn.style.padding = '6px 12px';
  btn.textContent = newRole === 'admin' ? 'Promote to Admin' : 'Demote to Customer';

  btn.onclick = async () => {
    const user = await DB.getByIndex('users', 'email', email);
    if (!user) return;

    user.role = newRole;
    await DB.put('users', user);
    S.users = await DB.getAll('users');

    showToast('Role updated');
    document.body.removeChild(menu);
    render();
  };

  menu.appendChild(btn);
  document.body.appendChild(menu);

  document.addEventListener('click', () => {
    if (menu.parentNode) {
      document.body.removeChild(menu);
    }
  }, { once: true });
}

async function adminUpdateOrder(id, status) {
  const order = await DB.get('orders', id);
  if (!order) return;
  order.status = status;
  await DB.put('orders', order);
  S.orders = await DB.getAll('orders');
  showToast(`Order #${String(id).padStart(4, '0')} updated to "${status}"`);
}
// ── Right Click Role Menu ─────────────────────────────────────
let activeUserMenu = null;

function openUserMenu(e, email, newRole) {

  e.preventDefault();

  if (activeUserMenu) {
    activeUserMenu.remove();
    activeUserMenu = null;
  }

  const menu = document.createElement("div");

  menu.style.position = "fixed";
  menu.style.top = e.clientY + "px";
  menu.style.left = e.clientX + "px";
  menu.style.background = "white";
  menu.style.border = "1px solid #e2e8f0";
  menu.style.borderRadius = "10px";
  menu.style.boxShadow = "0 10px 20px rgba(0,0,0,0.15)";
  menu.style.padding = "6px";
  menu.style.zIndex = "9999";

  const btn = document.createElement("button");

  btn.className = "btn btn-outline";
  btn.style.fontSize = "12px";
  btn.style.padding = "6px 12px";

  btn.textContent =
    newRole === "admin"
      ? "Promote to Admin"
      : "Demote to Customer";

  btn.onclick = async () => {

    const user = await DB.getByIndex("users", "email", email);

    if (!user) return;

    user.role = newRole;

    await DB.put("users", user);

    S.users = await DB.getAll("users");

    showToast("Role updated");

    menu.remove();
    activeUserMenu = null;

    render();
  };

  menu.appendChild(btn);

  document.body.appendChild(menu);

  activeUserMenu = menu;

  document.addEventListener("click", () => {

    if (activeUserMenu) {
      activeUserMenu.remove();
      activeUserMenu = null;
    }

  }, { once: true });
}
// ── Modals ────────────────────────────────────────────────────
function renderModal(type) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.addEventListener('click', e => { if (e.target === overlay) setState({ modal: null, activeProduct: null }); });
  let card;
  if (type === 'login') card = buildLoginModal();
  else if (type === 'register') card = buildRegisterModal();
  else if (type === 'verify') card = buildVerifyModal();
  else if (type === 'checkout') card = buildCheckoutModal();
  else if (type === 'profile') card = buildProfileModal();
  else if (type === 'product') card = buildProductModal();
  else if (type === 'quickview') card = buildQuickViewModal();
  if (card) overlay.appendChild(card);
  return overlay;
}

function closeBtn() {
  const b = document.createElement('button');
  b.className = 'btn';
  b.style.cssText = 'background:#f1f5f9;padding:8px;border-radius:12px';
  b.innerHTML = '<i data-lucide="x" style="width:18px;height:18px"></i>';
  b.addEventListener('click', () => setState({ modal: null, activeProduct: null }));
  return b;
}

function openQuickView(id) {
  S.activeProduct = S.products.find(p => p.id === id);
  if (S.activeProduct) setState({ modal: 'quickview' });
}

function buildQuickViewModal() {
  const p = S.activeProduct;
  if (!p) return null;
  const card = document.createElement('div');
  card.className = 'modal-card';
  card.style.cssText = 'width:min(900px, 95vw);padding:0;overflow:hidden;background:#fff;border-radius:24px;display:grid;grid-template-columns:1fr 1fr;';

  if (window.innerWidth < 768) {
    card.style.gridTemplateColumns = '1fr';
  }

  card.innerHTML = `
    <div style="background:#f8fafc;display:flex;align-items:center;justify-content:center;padding:20px;position:relative;">
      <img src="${p.image}" style="width:100%;object-fit:cover;border-radius:16px;">
      <button class="btn" style="position:absolute;top:16px;left:16px;background:white;padding:8px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1)" onclick="setState({modal:null, activeProduct:null})">✕</button>
    </div>
    <div style="padding:40px;display:flex;flex-direction:column;justify-content:center">
      <div style="font-size:12px;color:var(--emerald);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;font-weight:800">${p.category}</div>
      <h2 style="margin:0 0 16px;font-size:32px">${p.name}</h2>
      <div style="font-size:16px;color:#f59e0b;margin-bottom:20px">★ ${p.rating} <span style="color:var(--muted)">(${p.reviews} reviews)</span></div>
      <div style="font-size:15px;color:var(--muted);line-height:1.6;margin-bottom:24px">${p.desc}</div>
      <div style="font-size:28px;font-weight:800;color:var(--emerald);margin-bottom:24px">£${p.price.toFixed(2)}</div>
      <button class="btn btn-primary" style="padding:16px;font-size:16px" onclick="addToCart('${p.id}', event); setState({modal:null, activeProduct:null})">
        <i data-lucide="shopping-cart"></i> Add to Cart
      </button>
      <div style="margin-top:16px;font-size:13px;color:${p.stock < 10 ? 'var(--red)' : 'var(--emerald)'};text-align:center">
        ${p.stock < 10 ? '⚠ Only ' + p.stock + ' units left in stock!' : '✓ In Stock and ready to ship'}
      </div>
    </div>
  `;
  return card;
}

function buildLoginModal() {

  const card = document.createElement('div');
  card.className = 'modal-card';

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="margin:0;font-size:24px">Sign In</h2>
      <button class="btn" style="background:#f1f5f9;padding:8px;border-radius:12px"
        onclick="setState({modal:null})">
        ✕
      </button>
    </div>

    <div id="login-err" style="display:none;background:#fee2e2;color:#b91c1c;padding:12px;border-radius:10px;margin-bottom:14px;font-size:13px"></div>

    <input id="login-email" class="input" placeholder="Email address" style="margin-bottom:10px">

    <input id="login-password" class="input" type="password" placeholder="Password" style="margin-bottom:14px">

    <button class="btn btn-primary" style="width:100%;padding:14px" onclick="doLogin()">
      Sign In
    </button>

    <hr style="margin:20px 0">

    <div style="text-align:center;font-size:13px;color:#64748b;margin-bottom:10px">
      Or continue with
    </div>

    <div id="google-signin" style="display:flex;justify-content:center;margin-bottom:18px"></div>

    <div style="text-align:center">
      <button class="btn btn-outline"
        style="width:100%;padding:12px"
        onclick="setState({modal:'register'})">
        Create Account
      </button>
    </div>
  `;

  setTimeout(() => {

    if (!window.google) return;

    google.accounts.id.initialize({
      client_id: "484090538674-krtmknjabld56t8goceuv7puo4c7ml9q.apps.googleusercontent.com",
      callback: googleLoginHandler
    });

    google.accounts.id.renderButton(
      document.getElementById("google-signin"),
      {
        theme: "outline",
        size: "large",
        width: 260
      }
    );

  }, 200);

  return card;
}
function buildRegisterModal() {
  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="margin:0;font-size:24px">Create Account</h2>
    </div>
    <div id="reg-err" style="display:none;background:#fee2e2;color:#b91c1c;padding:12px;border-radius:10px;font-size:13px;margin-bottom:16px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="grid-column:1/-1"><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Full Name *</label>
        <input class="input" id="reg-name" placeholder="John Doe" style="border:1px solid var(--line)"></div>
      <div style="grid-column:1/-1"><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Email Address *</label>
        <input class="input" id="reg-email" type="email" placeholder="you@example.com" style="border:1px solid var(--line)"></div>
      <div><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Phone Number</label>
        <input class="input" id="reg-phone" type="tel" placeholder="+44 7000 000000" style="border:1px solid var(--line)"></div>
      <div><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Password *</label>
        <input class="input" id="reg-pass" type="password" placeholder="Min 8 characters" style="border:1px solid var(--line)"></div>
      <div style="grid-column:1/-1"><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Confirm Password *</label>
        <input class="input" id="reg-pass2" type="password" placeholder="Repeat your password" style="border:1px solid var(--line)"></div>
    </div>
    <div style="margin-top:16px">
      <label style="display:flex;gap:10px;align-items:flex-start;font-size:13px;cursor:pointer">
        <input type="checkbox" id="reg-terms" style="margin-top:2px">
        <span>I agree to the <a href="#" style="color:var(--emerald);font-weight:700">Terms of Service</a> and <a href="#" style="color:var(--emerald);font-weight:700">Privacy Policy</a></span>
      </label>
    </div>
    <button class="btn btn-primary" id="reg-submit" style="width:100%;padding:14px;margin-top:20px">
      <i data-lucide="user-plus"></i> Create Account
    </button>
    <div style="text-align:center;font-size:13px;color:var(--muted);margin-top:12px">
      Already have an account? <a href="#" style="color:var(--emerald);font-weight:700" onclick="setState({modal:'login'})">Sign In</a>
    </div>`;
  const hdr = card.querySelector('div');
  hdr.appendChild(closeBtn());
  card.querySelector('#reg-submit').addEventListener('click', doRegister);
  return card;
}

function buildVerifyModal() {
  const { email, code } = S.pendingVerify || {};
  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `
    <div style="text-align:center;margin-bottom:24px">
      <div style="width:64px;height:64px;background:rgba(209, 34, 0, 0.15);border-radius:50%;display:grid;place-items:center;margin:0 auto 16px;font-size:28px">✉️</div>
      <h2 style="margin:0 0 8px">Verify Your Email</h2>
      <p style="color:var(--muted);font-size:14px;margin:0">A 6-digit code was sent to<br><strong>${email}</strong></p>
    </div>
    <div id="verify-err" style="display:none;background:#fee2e2;color:#b91c1c;padding:12px;border-radius:10px;font-size:13px;margin-bottom:16px"></div>
 
    <div style="margin-bottom:20px;background:#f8fafc;border-radius:14px;padding:16px;text-align:center">
      <div style="font-size:14px;color:var(--emerald);font-weight:700">✓ Code sent successfully!</div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">Please check your inbox and spam folder.</div>
    </div>
    <label style="font-size:13px;font-weight:700;display:block;margin-bottom:8px">Enter Verification Code</label>
    <input class="input" id="verify-code" type="text" placeholder="000000" maxlength="6"
      style="border:1px solid var(--line);font-size:28px;letter-spacing:0.25em;text-align:center;font-family:monospace">
    <button class="btn btn-primary" id="verify-submit" style="width:100%;padding:14px;margin-top:16px">
      <i data-lucide="check-circle"></i> Verify & Activate Account
    </button>
    <button class="btn btn-outline" style="width:100%;margin-top:8px" onclick="setState({modal:'register'})">← Back to Register</button>`;
  card.querySelector('#verify-submit').addEventListener('click', doVerify);
  card.querySelector('#verify-code').addEventListener('keydown', e => { if (e.key === 'Enter') doVerify(); });
  return card;
}

function buildCheckoutModal() {
  const sub = Cart.total(), ship = sub > 75 ? 0 : 6.99;
  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="margin:0;font-size:24px">Checkout</h2>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Delivery Address *</label>
        <input class="input" id="co-addr" placeholder="123 Main Street, City, Postcode" style="border:1px solid var(--line)"></div>
      <div><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Card Number</label>
        <input class="input" id="co-card" placeholder="4242 4242 4242 4242" maxlength="19" style="border:1px solid var(--line)" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim()"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Expiry</label>
          <input class="input" id="co-exp" placeholder="MM/YY" maxlength="5" style="border:1px solid var(--line)"></div>
        <div><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">CVV</label>
          <input class="input" id="co-cvv" placeholder="123" maxlength="3" style="border:1px solid var(--line)"></div>
      </div>
    </div>
    <div style="margin-top:20px;background:#f8fafc;border-radius:14px;padding:18px">
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span>Subtotal</span><strong>£${sub.toFixed(2)}</strong></div>
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span>Shipping</span><strong style="color:${ship === 0 ? 'var(--emerald)' : 'inherit'}">${ship === 0 ? 'FREE' : '£' + ship.toFixed(2)}</strong></div>
      <hr style="border:none;border-top:1px solid var(--line)">
      <div style="display:flex;justify-content:space-between;font-size:18px"><strong>Total</strong><strong style="color:var(--emerald)">£${(sub + ship).toFixed(2)}</strong></div>
    </div>
    <button class="btn btn-primary" id="co-submit" style="width:100%;padding:14px;margin-top:16px">
      <i data-lucide="lock"></i> Place Order — £${(sub + ship).toFixed(2)}
    </button>`;
  const hdr = card.querySelector('div');
  hdr.appendChild(closeBtn());
  card.querySelector('#co-submit').addEventListener('click', doPlaceOrder);
  return card;
}

function buildProductModal() {
  const card = el('div', 'modal-card');
  const cats = ['Cues', 'Balls', 'Tables', 'Accessories', 'Cases'];
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="margin:0;font-size:24px">Add New Product</h2>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div style="grid-column:1/-1">
        <label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Product Name *</label>
        <input class="input" id="p-name" placeholder="Pro Series Cue" style="border:1px solid var(--line)">
      </div>
      <div>
        <label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Category *</label>
        <select class="input" id="p-cat" style="border:1px solid var(--line)">
          ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Price (£) *</label>
        <input class="input" id="p-price" type="number" step="0.01" placeholder="49.99" style="border:1px solid var(--line)">
      </div>
      <div>
        <label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Initial Stock *</label>
        <input class="input" id="p-stock" type="number" placeholder="20" style="border:1px solid var(--line)">
      </div>
      <div>
        <label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Badge</label>
        <select class="input" id="p-badge" style="border:1px solid var(--line)">
          <option value="">None</option>
          <option value="new">New</option>
          <option value="bestseller">Bestseller</option>
          <option value="sale">Sale</option>
        </select>
      </div>
      <div style="grid-column:1/-1">
        <label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Product Image *</label>
        <div id="p-dropzone" style="border:2px dashed var(--line);border-radius:12px;padding:30px;text-align:center;cursor:pointer;background:#f8fafc;transition:0.2s">
          <div id="p-preview" style="display:none;margin-bottom:12px">
            <img id="p-img-tag" style="width:80px;height:80px;border-radius:10px;object-fit:cover;margin:0 auto">
          </div>
          <div id="p-prompt">
            <i data-lucide="upload-cloud" style="width:32px;height:32px;color:var(--muted);margin-bottom:8px"></i>
            <div style="font-size:14px;font-weight:600">Drag & Drop or Click to Upload</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">PNG, JPG or WebP (Max 2MB)</div>
          </div>
          <input type="file" id="p-file" accept="image/*" style="display:none">
          <input type="hidden" id="p-image-data">
        </div>
      </div>
      <div style="grid-column:1/-1">
        <label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px">Description</label>
        <textarea class="input" id="p-desc" style="border:1px solid var(--line);min-height:80px;resize:vertical"></textarea>
      </div>
    </div>
    <button class="btn btn-primary" id="p-submit" style="width:100%;padding:14px;margin-top:24px">
      <i data-lucide="plus"></i> Save Product
    </button>`;

  const hdr = card.querySelector('div');
  hdr.appendChild(closeBtn());

  const dz = card.querySelector('#p-dropzone');
  const fi = card.querySelector('#p-file');
  const id = card.querySelector('#p-image-data');
  const pr = card.querySelector('#p-preview');
  const pt = card.querySelector('#p-prompt');
  const it = card.querySelector('#p-img-tag');

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      id.value = e.target.result;
      it.src = e.target.result;
      pr.style.display = 'block';
      pt.style.display = 'none';
      dz.style.borderColor = 'var(--emerald)';
    };
    reader.readAsDataURL(file);
  };

  dz.onclick = () => fi.click();
  fi.onchange = (e) => handleFile(e.target.files[0]);
  dz.ondragover = (e) => { e.preventDefault(); dz.style.background = '#f1f5f9'; };
  dz.ondragleave = () => { dz.style.background = '#f8fafc'; };
  dz.ondrop = (e) => { e.preventDefault(); dz.style.background = '#f8fafc'; handleFile(e.dataTransfer.files[0]); };

  card.querySelector('#p-submit').addEventListener('click', doSaveProduct);
  return card;
}

async function doSaveProduct() {
  const name = document.getElementById('p-name')?.value.trim();
  const cat = document.getElementById('p-cat')?.value;
  const price = parseFloat(document.getElementById('p-price')?.value);
  const stock = parseInt(document.getElementById('p-stock')?.value);
  const badge = document.getElementById('p-badge')?.value;
  const image = document.getElementById('p-image-data')?.value; // Now uses Base64 data
  const desc = document.getElementById('p-desc')?.value.trim();

  if (!name || isNaN(price) || isNaN(stock) || !image) {
    showToast('Please fill all required fields and upload an image', 'error');
    return;
  }

  const newProd = {
    id: 'p' + Date.now(),
    name, category: cat, price, stock, badge, image, desc,
    rating: 5, reviews: 0
  };

  await DB.put('products', newProd);
  S.products = await DB.getAll('products');
  setState({ modal: null });
  showToast(`Product "${name}" added!`);
}

function buildProfileModal() {
  const u = S.user;
  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="margin:0;font-size:24px">My Profile</h2>
    </div>
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;padding:20px;background:#f8fafc;border-radius:16px">
      <img src="${u.avatar}" style="width:64px;height:64px;border-radius:50%;object-fit:cover">
      <div>
        <div style="font-size:20px;font-weight:700">${u.name}</div>
        <div style="color:var(--muted);font-size:14px">${u.email}</div>
        <span class="badge badge-emerald" style="margin-top:6px">${u.role === 'admin' ? '⚙ Admin' : '✓ Verified Customer'}</span>
      </div>
    </div>
    <div style="display:grid;gap:10px;font-size:14px">
      <div style="display:flex;justify-content:space-between;padding:12px;background:#f8fafc;border-radius:10px">
        <span style="color:var(--muted)">Phone</span><strong>${u.phone || '—'}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:12px;background:#f8fafc;border-radius:10px">
        <span style="color:var(--muted)">Member since</span><strong>${new Date(u.createdAt).toLocaleDateString()}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:12px;background:#f8fafc;border-radius:10px">
        <span style="color:var(--muted)">Orders placed</span><strong>${S.userOrders?.length || 0}</strong></div>
    </div>
    <button class="btn btn-outline" id="prof-orders" style="width:100%;margin-top:20px">View My Orders</button>
    <button class="btn" id="prof-logout" style="width:100%;margin-top:8px;background:#fee2e2;color:#b91c1c">Sign Out</button>`;
  const hdr = card.querySelector('div');
  hdr.appendChild(closeBtn());
  card.querySelector('#prof-orders').addEventListener('click', () => { navigate('orders'); setState({ modal: null }); });
  card.querySelector('#prof-logout').addEventListener('click', doLogout);
  return card;
}

function renderPolicies() {
  const wrap = el('div', 'container section');
  wrap.innerHTML = `
    <div style="max-width:800px;margin:0 auto;color:var(--text)">
      <h1 class="title" style="font-size:36px;margin-bottom:8px">Privacy Policy</h1>
      
      <p style="color:var(--muted);line-height:1.6;margin-bottom:20px">
        MasterMindz Sportz (referred to as “we”, “us”, “Company”) is authors and publishers of the website www.mastermindzsportz.com and its sub domains, if any, (collectively referred to as “Website”) and other applications, mobile applications (“Services”) has provided this privacy policy (“Policy”) to familiarise You with the manner in which the Company uses and discloses Your information collected for the same through the Website or its Services.
      </p>
      
      <p style="color:var(--muted);line-height:1.6;margin-bottom:20px">
        Company created this Privacy Policy to demonstrate its commitment to the protection of Users’ privacy and Users’ personal information. Users’ use of and access to the Services is subject to this Privacy Policy and the attached Terms of Use. Any term used but not defined in this Privacy Policy shall have the same meaning as attributed to it in the Terms of Use.
      </p>

      <p style="color:var(--muted);line-height:1.6;margin-bottom:20px;font-size:12px;text-transform:uppercase">
        BY CONFIRMING THAT YOU ARE BOUND BY THIS PRIVACY POLICY (BY THE MEANS PROVIDED ON THIS WEBSITE OR APPLICATION), BY USING THE SERVICES OR BY OTHERWISE GIVING US YOUR INFORMATION, YOU AGREE TO THE POLICIES AND PRACTICES OUTLINED IN THIS PRIVACY POLICY AND YOU HEREBY CONSENT TO OUR COLLECTION, USE AND SHARING OF YOUR INFORMATION AS DESCRIBED IN THIS PRIVACY POLICY AND TERMS OF USE. WE RESERVE THE RIGHT TO CHANGE, MODIFY, ADD OR DELETE PORTIONS OF THE TERMS OF THIS PRIVACY POLICY, AT OUR SOLE DISCRETION, AT ANY TIME AND PUBLISH THE SAME. IF YOU DO NOT AGREE WITH THIS PRIVACY POLICY AT ANY TIME, DO NOT USE ANY OF THE SERVICES OR GIVE US ANY OF YOUR INFORMATION. IF YOU USE THE SERVICES ON BEHALF OF SOMEONE ELSE (SUCH AS YOUR SPOUSE, CHILD OR OTHER CLOSE FAMILY MEMBER) OR AN ENTITY, YOU REPRESENT THAT YOU ARE AUTHORISED BY SUCH INDIVIDUAL OR ENTITY TO ACCEPT THIS PRIVACY POLICY ON SUCH INDIVIDUAL’S OR ENTITY’S BEHALF.<br><br>
        BY USING THE WEBSITE, YOU AGREE TO THE TERMS AND CONDITIONS OF THIS POLICY.
      </p>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">1. Scope of Policy</h2>
        <p style="color:var(--muted);line-height:1.6">1.1: When You use the Website or the Services, the Company may seek and collect certain personal and non-personal information classified as mandatory or voluntary (collectively “Information”). Accordingly, whenever You use the Website or the Services, You consent to the collection, use, and disclosure of the Information in accordance with this Policy.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">2. Collection and Use of Personal Information</h2>
        <p style="color:var(--muted);line-height:1.6">2.1: Personal information is data that can be used to uniquely identify or contact a single person. “Personal Information” for the purposes of this Policy shall include, but not be limited to, information regarding Your name, address, telephone number, date of birth, gender, e-mail address, image and video captures, biometric information, etc.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">2.2: Some of the Information that Company may ask You to provide may be identified as mandatory and some as voluntary. If You do not provide the mandatory Information, You will not be able to avail the services provided by Company.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">2.3: Company collects Personal Information that Company believes to be relevant and which is required to provide the Services to the User. The Company may share your Personal Information with non-affiliated entities to continuously improve the User experience with regards to the Service, to improve security measures and/or to provide offers and promotional materials.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">2.4: All the information provided to us by a User, including sensitive personal information, is voluntary. You understand that Company, either itself or with its Partners, may use certain information of yours, which has been designated as ‘sensitive personal data or information’:</p>
        <ul style="color:var(--muted);line-height:1.6;margin-top:12px;padding-left:20px">
          <li>for the purpose of providing you the Services,</li>
          <li>for commercial purposes and in an aggregated or non-personally identifiable form for research, statistical analysis and business intelligence purposes,</li>
          <li>for sale or transfer of such research, statistical or intelligence data in an aggregated or non-personally</li>
        </ul>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">2.5: You are responsible for maintaining the accuracy of the information you submit to us, such as your contact information provided as part of account registration. If your personal information changes, you may correct, delete inaccuracies, or amend information by making the change on your profile information page on the Websites or Application or by contacting Company authorised person at support@mastermindzsportz.com.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">2.6: Company may require the User to pay with a credit card, debit card, net banking, wallets or other online payment mechanisms for Services for which an amount(s) is/are payable. Company will collect such User’s credit card number and/or other financial institution information such as bank account numbers and will use that information for the billing and payment processes, including but not limited to the use and disclosure of such credit card number and information to third parties as necessary to complete such billing operation. Verification of credit information, however, is accomplished solely by the User through the authentication process offered by a third party payment gateway. User’s credit card/ debit card details are transacted upon secure sites of approved payment gateways which are digitally encrypted, thereby providing the highest possible degree of care as per latest technology currently available. User is cautioned, however, that internet technology is not fool proof or safe and User should exercise discretion on using the same.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">3. Disclosure of Personal Information</h2>
        <p style="color:var(--muted);line-height:1.6">3.1: Company will keep Your Personal Information confidential to the maximum possible extent. Company limits the disclosure of Personal Information to Company’s employees, independent contractors, affiliates, consultants, business associates, service providers on a need-to-know basis, and only for the purposes stated in Clause 2 above and only for the entities described below.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">3.2: In addition to the above, the Company may share Personal Information which the Company may believe to be necessary or appropriate: (i) under applicable law; (ii) to comply with any legal processes; (iii) to respond to requests from public and government authorities; (iv) to enforce the User Terms; (v) to protect Company’s operations or those of any of Company’s affiliates, consultants, business associates, service providers; (vi) to protect Company’s rights, privacy, safety or property, and/or that of Company’s affiliates, You or others; and (vii) to allow Company to pursue available remedies or limit the damages that Company may sustain.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">4. Collection and Use of Non-Personal Information</h2>
        <p style="color:var(--muted);line-height:1.6">4.1: Non-personal information is any information that does not reveal Your specific identity, such as, browser information, Internet protocol (IP) address, particulars of the accessing device, and other information collected through cookies (“Non-Personal Information”). The Website gathers some information automatically when You visit the URL of the Website and stores it in log files. Accordingly, when You use the Website, Company may collect certain information about Your computer or device to facilitate, evaluate and verify Your use of the Website. This information is generally collected in aggregate form, without identifying any user individually.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">4.2: As Non-Personal Information does not personally identify You, Company may use and disclose Non-Personal Information for any purpose. In some instances, Company may combine Non-Personal Information with Personal Information (such as combining Your name with Your geographical location). If Company combines any Non-Personal Information with Personal Information, the combined information will be treated by Company as Personal Information as long as it is combined.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">5. Third-Party Links to other Websites</h2>
        <p style="color:var(--muted);line-height:1.6">5.1: The Website or any other interface comprised in the Service may provide third-party advertisements and links to other websites. Company does not provide any Personal Information to these third-party websites or advertisers.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">5.2: The links to other websites on the Website are operated by third parties and are not controlled by, or affiliated to, or associated with, Company. Accordingly, Company does not make any representations concerning the privacy practices or policies of such third parties or terms of use of such websites, nor does Company control or guarantee the accuracy, integrity, or quality of the information, data, text, software, music, sound, photographs, graphics, videos, messages or other materials available on such websites. The inclusion or exclusion does not imply any endorsement by Company of such websites, such websites’ provider, or the information on such websites. The information provided by You to such third party websites shall be governed in accordance with the privacy policies of such websites and it is recommended that You review the privacy policy on any such websites prior to using such websites.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">6. User Discretion</h2>
        <p style="color:var(--muted);line-height:1.6">6.1: As stated earlier, You can always choose not to provide Information, even though it might be needed by the Company for its business purposes. In such cases, if the information required is classified as mandatory, You may not be able to avail the services provided by the Company.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">7. General Provisions</h2>
        <p style="color:var(--muted);line-height:1.6">7.1: Company may make changes to this Policy, from time to time at Company’s sole discretion or on account of changes in law. You are encouraged to check the Website frequently to see recent changes. Notwithstanding the above, Company shall not be required to notify You of any changes made to the Policy. The revised Policy shall be made available on the Website. Your continued use of the Website or the Services, following changes to the Policy, will constitute Your acceptance of those changes.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">7.2: This Privacy Policy is published in compliance with, inter alia; Section 43A of the Information Technology Act, 2000, Regulation 4 of the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Information) Rules, 2011 (the “SPI Rules”) and Regulation 3(1) of the Information Technology (Intermediaries Guidelines) Rules, 2011. if you have any grievances or concerns about Company’s Privacy Policy or if you would like to make a complaint about a possible breach of privacy in, you may contact the Grievance Officer, Mr. Vinay Katrela on 080-41248213.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">7.3: If You choose to visit the Website or avail the Services, Your visit and any dispute over privacy is subject to this Policy and the User Terms, and the application law shall be the law of the Republic of India.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">8. CONSENT TO THIS POLICY</h2>
        <p style="color:var(--muted);line-height:1.6">8.1: You acknowledge that this Privacy Policy is a part of the Terms of Use of the Website and the other Services, and you unconditionally agree that becoming a User of the Website, the Application and its Services signifies your assent to this Privacy Policy. Your visit to the Store, use of the website and use of the Services is subject to this Privacy Policy and the Terms of Use. This Policy should be at all times read along with the User Terms of the Website. Unless stated otherwise, the Policy applies to all Information that Company has about You.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">9. Governing Laws</h2>
        <p style="color:var(--muted);line-height:1.6">9.1: Use of www.mastermindzsportz.com shall in all respects be governed by the laws of India, regardless of the laws that might be applicable under principles of conflicts of law. These terms shall be governed by and constructed in accordance with the laws of India without reference to conflict of laws. Disputes arising in relation hereto shall be subject to the exclusive jurisdiction of the courts at Bengaluru.</p>
      </div>

      <div class="policy-section" style="margin-bottom:20px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">10. CONTACT INFORMATION</h2>
        <p style="color:var(--muted);line-height:1.6">10.1: If you have questions about this Privacy Policy or use and disclosure practices, you may contact us at support@mastermindzsportz.com.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">10.2: If you have any grievance with respect to our use of your information, you may communicate such grievance to us.</p>
      </div>

      <hr style="border:none;border-top:1px solid var(--line);margin:60px 0">

      <!-- Section 2: Shipping, Cancellation and Refund Policy -->
      <h1 class="title" style="font-size:36px;margin-bottom:32px">Shipping, Cancellation and Refund Policy</h1>
      
      <p style="color:var(--muted);line-height:1.6;margin-bottom:20px">
        This Policy defines the terms for shipping, cancellation of the Products ordered through Store and refund of the price paid for the products ordered. The terms and conditions mentioned under the Terms of Use published at www.mastermindzsportz.com shall be read along with this policy.
      </p>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">Shipping of Products</h2>
        <p style="color:var(--muted);line-height:1.6">
          Upon successful receipt of order from the User, We deliver your order as soon as possible through a third party courier service provider or any other mode of delivery of the products as deems fit by the Company. All other orders will be shipped as per the details of delivery mentioned against each of the product displayed at Store. After shipment of the Product, the tracking details of the product shall be displayed in the order page or shall be shared with the user by way of SMS or Email and estimated time for delivery of the product shall be informed to the Users.
        </p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">
          The product shall be shipped with proper packaging including the invoice details and delivery address as provided by the User at the time of order of the product.
        </p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">
          There is no online mechanism to track your orders currently. We normally deliver within the committed timelines. In case of any delays or enquiry on your order status, you can call us on 080-41248213 or write to us at support@mastermindzsportz.com.
        </p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">Cancellation and Refund</h2>
        <p style="color:var(--muted);line-height:1.6">
          Once Services are ordered at Store and Products are shipped, request for cancellations or replacement of orders shall not be entertained. Company may refund or replace only in case of faulty and damaged Products.
        </p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px;font-weight:700">Company provides refund only in case of:</p>
        <ul style="color:var(--muted);line-height:1.6;margin-top:8px;padding-left:20px">
          <li>Damaged or Faulty Product(s)</li>
          <li>Wrong Product(s) delivered which are not as per your order</li>
          <li>Cancellation of order before dispatch</li>
        </ul>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">
          Faulty or damaged Products must be returned within 14 days from the date of dispatch but with a prior intimation of such via email to support@mastermindzsportz.com and only after MasterMindz Sportz accepts the user’s request for return.
        </p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">
          The refund will be processed for the cancelled order only through the same mode of payment i.e. payment to same account which you used during the transaction. 
        </p>
        <ul style="color:var(--muted);line-height:1.6;margin-top:12px;padding-left:20px">
          <li><strong>Credit card/Debit card mode:</strong> Refund processing time as per bank’s standard time frame which is approximately 8-10 business days.</li>
          <li><strong>COD/cheque/DD mode:</strong> Refund processing time is 15-20 working days. Cheque will be made as per Billing Name provided.</li>
        </ul>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">
          For non delivered items, refund will be processed only on confirmation that the product was not delivered to you and you choose to take a refund and are not interested in any other product.
        </p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">
          The refund shall be processed with cancellation charges for all orders placed. Postage charges for return of products will not be refunded.
        </p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">
          The refunds will be credited to the original payment method in approximately 7-10 working days. Product will be delivered post shipping within 7-10 working days approximately.
        </p>
      </div>
      <hr style="border:none;border-top:1px solid var(--line);margin:60px 0">

      <!-- Section 3: Terms and Conditions -->
      <h1 class="title" style="font-size:36px;margin-bottom:32px">Terms and Conditions</h1>
      
      <p style="color:var(--muted);line-height:1.6;margin-bottom:20px;font-size:14px;font-style:italic">
        This document is an electronic record in terms of Information Technology Act, 2000 and rules thereunder as applicable and the amended provisions pertaining to electronic records in various statutes as amended by the Information Technology Act, 2000. This electronic record is generated by a computer system and does not require any physical or digital signatures.
      </p>

      <p style="color:var(--muted);line-height:1.6;margin-bottom:20px">
        The domain name www.mastermindzsportz.com (hereinafter referred to as the website or application) is owned by MasterMindz Sportz, a proprietorship concern having its office at 18/3, Andree Rd, Shanti Nagar, Bengaluru, Karnataka 560027 (hereinafter referred to as MasterMindz Sportz). Your use of website or application developed, managed and operated by MasterMindz Sportz (“us”, “we”, Company or “our”)are governed by these terms and conditions (“Terms”).
      </p>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">1. DEFINITIONS</h2>
        <p style="color:var(--muted);line-height:1.6">1.1: “Applicable Law” shall mean any statutes, laws, regulations, ordinances, rules, judgments, orders, decrees, by-laws, approval from the concerned authority, government resolution, orders, directives, guidelines, policy, requirement, or other governmental restriction.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">1.2: “Store” shall mean website or application developed, managed and hosted at the domain www.mastermindzsportz.com by the Company.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">1.3: “Services” shall mean supply of goods or services by Company to the Users at Store.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">2. USER ELIGIBILITY</h2>
        <p style="color:var(--muted);line-height:1.6">2.1: The Store is available only to the User who can form legally binding contracts under the Applicable Law.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">2.2: The User must be at least 18 (eighteen) years of age to be eligible to use the Store.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">2.3: Company reserves the right to deny the access to Store and Services if the User is found to be not eligible.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">3. COMMUNICATION</h2>
        <p style="color:var(--muted);line-height:1.6">3.1: You agree to receive communications via electronic records from us periodically. We may communicate with you by SMS, email or other modes.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">3.2: Electronic communications shall be deemed to have been received by you when we send it to the email address/mobile number provided by you.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">4. CONSENT TO THE TERMS</h2>
        <p style="color:var(--muted);line-height:1.6">4.1: You need to register on the website and provide accurate information to use the full spectrum of Services.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">4.2: By clicking "Accept", you confirm your eligibility and accept these Terms, Refund Policy and the Privacy Policy.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">5. USER INFORMATION</h2>
        <p style="color:var(--muted);line-height:1.6">5.1: Company may collect User data including name, email-id, and contact details to facilitate the Service.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">5.2: We reserve the right to terminate Service on account of misrepresentation of any information.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">5.3: Purpose of information collection includes: assist law enforcement, account management, targeted advertising, processing payments and refunds, and sending newsletters.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">6. DISCLAIMER OF WARRANTIES</h2>
        <p style="color:var(--muted);line-height:1.6">6.1: Services are provided on an “as is” and “as available” basis without any warranties.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">6.2: Company will not be liable for any damages arising from the use of the Store.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">7. USAGE CONDITIONS</h2>
        <p style="color:var(--muted);line-height:1.6">7.1: You agree not to authorize others to use your account or reverse engineer the Store.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">7.2: You are solely responsible for any breach of your obligations under these Terms.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">8. MODIFICATIONS</h2>
        <p style="color:var(--muted);line-height:1.6">8.1: Prices for products are subject to change without notice. We reserve the right to modify or discontinue products at any time.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">10. BILLING AND PAYMENT</h2>
        <p style="color:var(--muted);line-height:1.6">10.1: Options include credit cards, debit cards, cash on delivery, Wallets, and UPI.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">10.2: Redirection to bank websites for net-banking is normal. Never press the browser back button during transactions.</p>
        <p style="color:var(--muted);line-height:1.6;margin-top:12px">10.3: If your account is debited after a failure, it will be rolled back within 7-10 working days.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">13. LIMITATION OF LIABILITY</h2>
        <p style="color:var(--muted);line-height:1.6">Liability is limited to the consideration paid by the User in relation to access and use of the Service.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">15. GOVERNING LAW</h2>
        <p style="color:var(--muted);line-height:1.6">Governed by the laws of India and the courts of Bengaluru shall have exclusive jurisdiction.</p>
      </div>

      <div class="policy-section" style="margin-bottom:40px">
        <h2 style="font-size:20px;border-bottom:2px solid var(--emerald);display:inline-block;padding-bottom:4px;margin-bottom:16px">18. INTELLECTUAL PROPERTY</h2>
        <p style="color:var(--muted);line-height:1.6">All intellectual property rights arising from the domain names and Store vest in MasterMindz Sportz.</p>
      </div>
    </div>
  `;
  return wrap;
}

function renderFooter() {
  const foot = el('footer', 'footer', { background: '#f8fafc', padding: '60px 0 40px', borderTop: '1px solid var(--line)', marginTop: '60px' });
  foot.innerHTML = `
    <div class="container">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:40px;margin-bottom:40px">
        <div>
          <div class="nav-logo" style="margin-bottom:16px;">
            <img src="mmz%20logo%20fin%201.png" style="width:5cm;height:1cm;object-fit:contain;">
          </div>
          <p style="color:var(--muted);font-size:14px;line-height:1.6">Premium snooker and billiard equipment for professionals and enthusiasts.</p>
        </div>
        <div>
          <h4 style="margin-bottom:20px;font-size:16px">Shop</h4>
          <ul style="list-style:none;padding:0;font-size:14px;display:flex;flex-direction:column;gap:10px">
            <li><a href="#" onclick="navigate('shop')" style="color:var(--muted);text-decoration:none">All Products</a></li>
            <li><a href="#" onclick="navigate('shop')" style="color:var(--muted);text-decoration:none">New Arrivals</a></li>
            <li><a href="#" onclick="navigate('shop')" style="color:var(--muted);text-decoration:none">Cues</a></li>
          </ul>
        </div>
        <div>
          <h4 style="margin-bottom:20px;font-size:16px">Support</h4>
          <ul style="list-style:none;padding:0;font-size:14px;display:flex;flex-direction:column;gap:10px">
            <li><a href="#" onclick="navigate('policies')" style="color:var(--muted);text-decoration:none">Store Policies</a></li>
            <li><a href="#" onclick="navigate('policies')" style="color:var(--muted);text-decoration:none">Returns & Refunds</a></li>
            <li><a href="#" onclick="navigate('policies')" style="color:var(--muted);text-decoration:none">Shipping Info</a></li>
          </ul>
        </div>
        <div>
          <h4 style="margin-bottom:20px;font-size:16px">Contact</h4>
          <p style="color:var(--muted);font-size:14px;line-height:1.6">Email: support@mastermindzs.com<br>Phone: +44 20 7946 0000</p>
        </div>
      </div>
      <div style="border-top:1px solid var(--line);padding-top:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px">
        <p style="color:var(--muted);font-size:12px">© ${new Date().getFullYear()} MasterMindz Sportz. All rights reserved.</p>
        <div style="display:flex;gap:16px">
          <a href="#" onclick="navigate('policies')" style="color:var(--muted);font-size:12px;text-decoration:none">Privacy Policy</a>
          <a href="#" onclick="navigate('policies')" style="color:var(--muted);font-size:12px;text-decoration:none">Terms of Service</a>
        </div>
      </div>
    </div>
  `;
  return foot;
}

function renderToast() {
  return null;
}


// ── Action Handlers ───────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email')?.value.trim();
  const pass = document.getElementById('login-password')?.value;
  const err = document.getElementById('login-err');
  try {
    const user = await Auth.login(email, pass);
    S.user = user;
    S.modal = null;
    S.userOrders = await DB.getAll('orders', 'userId', user.id);
    showToast(`Welcome back, ${user.name}! 🎱`);
    render();
  } catch (e) {
    if (err) { err.textContent = e.message; err.style.display = 'block'; }
  }
}

async function handleGoogleLogin(response) {
  await googleLoginHandler(response);
}

async function doRegister() {
  const name = document.getElementById('reg-name')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const phone = document.getElementById('reg-phone')?.value.trim();
  const pass = document.getElementById('reg-pass')?.value;
  const pass2 = document.getElementById('reg-pass2')?.value;
  const terms = document.getElementById('reg-terms')?.checked;
  const err = document.getElementById('reg-err');
  const showErr = m => { if (err) { err.textContent = m; err.style.display = 'block'; } };

  if (!name || name.length < 2) return showErr('Please enter your full name');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr('Please enter a valid email address');
  if (!pass || pass.length < 8) return showErr('Password must be at least 8 characters');
  if (pass !== pass2) return showErr('Passwords do not match');
  if (!terms) return showErr('Please agree to the Terms of Service to continue');

  try {
    const code = await Auth.register({ name, email, password: pass, phone });
    S.pendingVerify = { email, code };

    // Disable the button and show loading state
    const btn = document.getElementById('reg-submit');
    if (btn) {
      btn.innerHTML = '<i data-lucide="loader"></i> Sending code...';
      btn.disabled = true;
    }

    // Send the email using EmailJS
    await emailjs.send("service_28ikxwu", "template_nekhgre", {
      to_name: name,
      to_email: email,
      verification_code: code
    });

    // Open the verification modal
    setState({ modal: 'verify' });

  } catch (e) {
    console.error("EmailJS Error:", e);

    // Reset the button so the user can try again
    const btn = document.getElementById('reg-submit');
    if (btn) {
      btn.innerHTML = '<i data-lucide="user-plus"></i> Create Account';
      btn.disabled = false;
    }
    showErr(e.text || e.message || 'Failed to send verification email. Please try again.');
  }
} // <--- THIS BRACE CLOSES doRegister() CORRECTLY

async function doVerify() {
  const code = document.getElementById('verify-code')?.value.trim();
  const { email } = S.pendingVerify || {};
  const err = document.getElementById('verify-err');

  if (!code || code.length !== 6) {
    if (err) { err.textContent = 'Please enter the 6-digit code'; err.style.display = 'block'; }
    return;
  }

  try {
    const user = await Auth.verify(email, code);
    S.user = user;
    S.pendingVerify = null;
    S.modal = null;
    S.userOrders = [];
    showToast(`Account verified! Welcome, ${user.name} 🎉`);
  } catch (e) {
    if (err) { err.textContent = e.message; err.style.display = 'block'; }
  }
}
async function doPlaceOrder() {
  const addr = document.getElementById('co-addr')?.value.trim();
  const card = document.getElementById('co-card')?.value.replace(/\s/g, '');
  const exp = document.getElementById('co-exp')?.value.trim();
  const cvv = document.getElementById('co-cvv')?.value.trim();
  if (!addr) return showToast('Please enter a delivery address', 'error');
  if (!card || card.length < 16) return showToast('Please enter a valid card number', 'error');
  if (!exp || !/^\d{2}\/\d{2}$/.test(exp)) return showToast('Please enter a valid expiry date (MM/YY)', 'error');
  if (!cvv || cvv.length < 3) return showToast('Please enter your CVV', 'error');

  const items = Cart.get();
  const sub = Cart.total();
  const ship = sub > 75 ? 0 : 6.99;
  const order = {
    userId: S.user.id,
    customerName: S.user.name,
    customerEmail: S.user.email,
    items: items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, image: i.image })),
    total: sub + ship, address: addr,
    status: 'processing',
    createdAt: new Date().toISOString()
  };

  // Decrement stock
  for (const item of items) {
    const p = S.products.find(x => x.id === item.id);
    if (p) {
      p.stock = Math.max(0, p.stock - item.qty);
      await DB.put('products', p);
    }
  }
  S.products = await DB.getAll('products');

  await DB.put('orders', order);
  Cart.clear();
  S.modal = null;
  S.userOrders = await DB.getAll('orders', 'userId', S.user.id);
  navigate('orders');

  showToast('Order placed successfully! 📦', 'success');
}

async function doLogout() {
  await Auth.logout();
  S.user = null; S.userOrders = []; S.modal = null;
  navigate('home');
  showToast('Signed out. See you soon!');
}

// ── Helpers ───────────────────────────────────────────────────
function el(tag, cls, styles) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (styles) Object.assign(e.style, styles);
  return e;
}

function mkel(tag, attrs, html, onclick) {
  const e = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  });
  if (html !== null && html !== undefined) e.innerHTML = String(html);
  if (onclick) e.addEventListener('click', onclick);
  return e;
}

// ── Init ──────────────────────────────────────────────────────
const styleTag = document.createElement('style');
styleTag.textContent = `
  @keyframes slideUp { from { transform:translateY(20px);opacity:0 } to { transform:translateY(0);opacity:1 } }
  @media(max-width:900px){
    [style*="grid-template-columns:1fr 340px"]{grid-template-columns:1fr!important}
    [style*="grid-template-columns:repeat(4,1fr)"]{grid-template-columns:repeat(2,1fr)!important}
  }
`;
document.head.appendChild(styleTag);

(async () => {
  await seedData();
  S.user = await Auth.currentUser();
  if (S.user) S.userOrders = await DB.getAll('orders', 'userId', S.user.id);
  S.products = await DB.getAll('products');
  render();
})();
// ── Google Sign In Setup ─────────────────────────────
window.addEventListener("load", () => {

  if (!window.google) return;

  google.accounts.id.initialize({
    client_id: "484090538674-krtmknjabld56t8goceuv7puo4c7ml9q.apps.googleusercontent.com",
    callback: googleLoginHandler
  });

  google.accounts.id.renderButton(
    document.getElementById("google-signin"),
    {
      theme: "outline",
      size: "large",
      width: 260
    }
  );

});
