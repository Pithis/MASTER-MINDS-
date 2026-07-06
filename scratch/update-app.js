const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'app.js');
let appJsContent = fs.readFileSync(appJsPath, 'utf8');

// Find the start of DB module
const startToken = 'const DB = (() => {';
const startIdx = appJsContent.indexOf(startToken);
if (startIdx === -1) {
  console.error('Could not find start of DB module');
  process.exit(1);
}

// Find where state S starts
const endToken = 'let S = {';
const endIdx = appJsContent.indexOf(endToken);
if (endIdx === -1) {
  console.error('Could not find start of state S');
  process.exit(1);
}

// Define our new frontend REST-API DB & Auth modules
const replacement = `const DB = (() => {
  function getHeaders() {
    const token = localStorage.getItem('sa_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = \`Bearer \${token}\`;
    return headers;
  }

  async function getAll(store, indexName, key) {
    let url = \`/api/\${store}\`;
    if (store === 'orders' && indexName === 'userId') {
      url = \`/api/orders\`;
    } else if (store === 'orders' && !indexName) {
      url = \`/api/orders/all\`;
    }
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function get(store, key) {
    const res = await fetch(\`/api/\${store}/\${key}\`, { headers: getHeaders() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function put(store, val) {
    let url = \`/api/\${store}\`;
    let method = 'POST';

    if (store === 'products' && val.id) {
      const exists = S.products.some(p => p.id === val.id);
      if (exists) {
        url = \`/api/products/\${val.id}\`;
        method = 'PUT';
      }
    } else if (store === 'quotations' && val.id) {
      url = \`/api/quotations/\${val.id}\`;
      method = 'PUT';
    } else if (store === 'orders') {
      method = 'POST';
    } else if (store === 'users' && val.id) {
      url = \`/api/users/\${val.id}/role\`;
      method = 'PATCH';
    }

    const res = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(val)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function del(store, key) {
    const res = await fetch(\`/api/\${store}/\${key}\`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function getByIndex(store, index, key) {
    if (store === 'users' && index === 'email') {
      // Backend handles email uniqueness check during registration/login,
      // but let's mock the local check by returning null so validation passes on frontend
      return null;
    }
    return null;
  }

  async function clear(store) {
    return true;
  }

  return { open: () => Promise.resolve(), put, get, del, getAll, getByIndex, clear };
})();

// ── Auth ─────────────────────────────────────────────────────
const Auth = (() => {
  function getHeaders() {
    const token = localStorage.getItem('sa_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = \`Bearer \${token}\`;
    return headers;
  }

  async function currentUser() {
    const token = localStorage.getItem('sa_token');
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/me', { headers: getHeaders() });
      if (!res.ok) {
        localStorage.removeItem('sa_token');
        return null;
      }
      return await res.json();
    } catch (e) {
      localStorage.removeItem('sa_token');
      return null;
    }
  }

  async function register({ name, email, password, phone }) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    return data.code;
  }

  async function verify(email, code) {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Verification failed');
    localStorage.setItem('sa_token', data.token);
    return data.user;
  }

  async function login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('sa_token', data.token);
    return data.user;
  }

  async function logout() {
    localStorage.removeItem('sa_token');
  }

  return { currentUser, register, verify, login, logout, hashPass: (p) => p };
})();

// ── Google Authentication ─────────────────────────────
async function googleLoginHandler(response) {
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Google login failed');

    localStorage.setItem('sa_token', data.token);
    S.user = data.user;
    S.userOrders = await DB.getAll('orders', 'userId', data.user.id);
    S.modal = null;
    showToast("Signed in with Google 🎱");
    render();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Google Sign-In failed', 'error');
  }
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

// ── Address Store ─────────────────────────────────────────────
const AddressStore = (() => {
  let data = { addr: '', city: '', zip: '', phoneCode: '+91', phone: '' };
  try { data = { ...data, ...JSON.parse(localStorage.getItem('sa_addr') || '{}') }; } catch (e) { }
  const save = (patch) => { data = { ...data, ...patch }; localStorage.setItem('sa_addr', JSON.stringify(data)); };
  const get = () => data;
  return { get, save };
})();

function updateCartBadge() {
  const c = Cart.count();
  const b = document.getElementById('cart-badge');
  if (b) { b.textContent = c; b.style.display = c ? 'flex' : 'none'; }
  document.querySelectorAll('.nav-mobile-badge').forEach(mb => {
    mb.textContent = c;
    mb.style.display = c ? 'flex' : 'none';
  });
}

async function seedData() {
  // Seeding is now securely handled on the backend SQLite startup
}

`;

// Perform the replacement
appJsContent = appJsContent.substring(0, startIdx) + replacement + appJsContent.substring(endIdx);

// Let's also rewrite openUserMenu functions to fetch from S.users
// First, find the first openUserMenu definition:
// function openUserMenu(e, email, newRole) { ... }
// We can locate openUserMenu and replace its body or just replace both instances with a standardized one.
// Let's write a robust replacement for both openUserMenu definitions.
const originalOpenUserMenu = `function openUserMenu(e, email, newRole) {
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
}`;

const updatedOpenUserMenu = `function openUserMenu(e, email, newRole) {
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
    const user = S.users.find(u => u.email === email);
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
}`;

// Replacing the first openUserMenu
appJsContent = appJsContent.replace(originalOpenUserMenu, updatedOpenUserMenu);

// Replacing the second openUserMenu (which had slightly different spacing/newlines)
const originalOpenUserMenu2 = `function openUserMenu(e, email, newRole) {

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
}`;

const updatedOpenUserMenu2 = `function openUserMenu(e, email, newRole) {
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
  btn.textContent = newRole === "admin" ? "Promote to Admin" : "Demote to Customer";

  btn.onclick = async () => {
    const user = S.users.find(u => u.email === email);
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
}`;

appJsContent = appJsContent.replace(originalOpenUserMenu2, updatedOpenUserMenu2);

// Also replace adminUpdateOrder(id, status)
// Original:
// async function adminUpdateOrder(id, status) {
//   const order = await DB.get('orders', id);
//   if (!order) return;
//   order.status = status;
//   await DB.put('orders', order);
//   S.orders = await DB.getAll('orders');
//   showToast(`Order #${String(id).padStart(4, '0')} updated to "${status}"`);
// }
// Let's rewrite it to use PATCH /api/orders/:id/status
const originalAdminUpdateOrder = `async function adminUpdateOrder(id, status) {
  const order = await DB.get('orders', id);
  if (!order) return;
  order.status = status;
  await DB.put('orders', order);
  S.orders = await DB.getAll('orders');
  showToast(\`Order #\${String(id).padStart(4, '0')} updated to "\${status}"\`);
}`;

const updatedAdminUpdateOrder = `async function adminUpdateOrder(id, status) {
  try {
    const res = await fetch(\`/api/orders/\${id}/status\`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${localStorage.getItem('sa_token')}\`
      },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error(await res.text());
    S.orders = await DB.getAll('orders');
    showToast(\`Order #\${String(id).padStart(4, '0')} updated to "\${status}"\`);
    render();
  } catch (err) {
    console.error(err);
    showToast('Failed to update order status', 'error');
  }
}`;

appJsContent = appJsContent.replace(originalAdminUpdateOrder, updatedAdminUpdateOrder);

// Also rewrite adminUpdateStock(id, delta)
// Original:
// async function adminUpdateStock(id, delta) {
//   const p = S.products.find(x => x.id === id);
//   if (!p) return;
//   p.stock = Math.max(0, p.stock + delta);
//   await DB.put('products', p);
//   S.products = await DB.getAll('products');
//   render();
// }
// Let's rewrite it to use PATCH /api/products/:id/stock
const originalAdminUpdateStock = `async function adminUpdateStock(id, delta) {
  const p = S.products.find(x => x.id === id);
  if (!p) return;
  p.stock = Math.max(0, p.stock + delta);
  await DB.put('products', p);
  S.products = await DB.getAll('products');
  render();
}`;

const updatedAdminUpdateStock = `async function adminUpdateStock(id, delta) {
  try {
    const res = await fetch(\`/api/products/\${id}/stock\`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${localStorage.getItem('sa_token')}\`
      },
      body: JSON.stringify({ delta })
    });
    if (!res.ok) throw new Error(await res.text());
    S.products = await DB.getAll('products');
    render();
  } catch (err) {
    console.error(err);
    showToast('Failed to update stock', 'error');
  }
}`;

appJsContent = appJsContent.replace(originalAdminUpdateStock, updatedAdminUpdateStock);

// Also rewrite adminSubmitInStoreSale()
// Original POS sale handles stock reduction locally and saves order.
// Let's update it to call POST /api/instore/sale
const originalAdminSubmitInStoreSale = `window.adminSubmitInStoreSale = async function() {
  const sel = document.getElementById('is-product');
  const pid = sel.value;
  if (!pid) return showToast('Please select a product', 'error');
  
  const opt = sel.options[sel.selectedIndex];
  const maxStock = parseInt(opt.dataset.stock);
  const qty = parseInt(document.getElementById('is-qty').value);
  if (isNaN(qty) || qty < 1) return showToast('Invalid quantity', 'error');
  if (qty > maxStock) return showToast('Not enough stock available', 'error');
  
  const price = parseFloat(document.getElementById('is-price').value);
  if (isNaN(price) || price < 0) return showToast('Invalid price', 'error');

  const cname = document.getElementById('is-customer').value.trim() || 'Offline Customer';
  
  // Deduct stock
  const p = S.products.find(x => x.id === pid);
  p.stock -= qty;
  await DB.put('products', p);
  
  // Create order equivalent
  const order = {
    userId: 'offline', 
    customerName: cname + ' (In-Store)',
    customerEmail: 'in-store@mastermindzsportz.local',
    address: 'In-Store Purchase',
    items: [{ id: p.id, name: p.name, price: price, qty: qty, image: p.image }],
    total: qty * price,
    status: 'delivered',
    createdAt: new Date().toISOString()
  };
  
  await DB.put('orders', order);
  
  S.products = await DB.getAll('products');
  S.orders = await DB.getAll('orders');
  
  showToast('In-Store sale logged successfully!');
  render(); 
};`;

const updatedAdminSubmitInStoreSale = `window.adminSubmitInStoreSale = async function() {
  const sel = document.getElementById('is-product');
  const pid = sel.value;
  if (!pid) return showToast('Please select a product', 'error');
  
  const opt = sel.options[sel.selectedIndex];
  const qty = parseInt(document.getElementById('is-qty').value);
  if (isNaN(qty) || qty < 1) return showToast('Invalid quantity', 'error');
  
  const price = parseFloat(document.getElementById('is-price').value);
  if (isNaN(price) || price < 0) return showToast('Invalid price', 'error');

  const cname = document.getElementById('is-customer').value.trim() || 'Offline Customer';

  try {
    const res = await fetch('/api/instore/sale', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${localStorage.getItem('sa_token')}\`
      },
      body: JSON.stringify({
        productId: pid,
        qty,
        price,
        customerName: cname
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'POS sale failed');

    S.products = await DB.getAll('products');
    S.orders = await DB.getAll('orders');
    
    showToast('In-Store sale logged successfully!');
    render(); 
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to complete In-Store sale', 'error');
  }
};`;

appJsContent = appJsContent.replace(originalAdminSubmitInStoreSale, updatedAdminSubmitInStoreSale);

fs.writeFileSync(appJsPath, appJsContent, 'utf8');
console.log('Successfully updated app.js with REST API modules!');
