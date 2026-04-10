
const fs = require('fs');
const path = require('path');

// 1. Parse the product data
const dataPath = path.join(__dirname, 'products_data.txt');
const data = fs.readFileSync(dataPath, 'utf8');

const lines = data.split('\n');
const products = lines.map(line => {
    const parts = line.split('\t');
    if (parts.length < 6) return null;
    const [name, id, fullCat, qty, unit, price, value] = parts;
    
    let category = 'Accessories';
    if (fullCat.includes('Cue')) category = 'Cues';
    else if (fullCat.includes('Ball')) category = 'Balls';
    else if (fullCat.includes('Table')) category = 'Tables';
    else if (fullCat.includes('Case')) category = 'Cases';
    else if (fullCat.includes('Cloth')) category = 'Cloth';
    
    return {
        id: id.trim(),
        name: name.trim(),
        price: parseFloat(price.replace(/,/g, '')),
        category: category,
        stock: parseInt(qty),
        gst: 18, 
        badge: '',
        rating: 4.5,
        reviews: Math.floor(Math.random() * 50) + 10,
        image: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=400&q=80',
        desc: name.trim() + ' - Premium quality ' + category.toLowerCase() + ' equipment.'
    };
}).filter(p => p !== null);

const productsStr = JSON.stringify(products, null, 2);

// 2. Read app.js
const appJsPath = path.join(__dirname, '..', 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');

// 3. Replace the PRODUCTS array
const startMarker = 'const PRODUCTS = [';
const endMarker = '];';

const startIndex = appJs.indexOf(startMarker);
if (startIndex === -1) {
    console.error('Could not find start of PRODUCTS array');
    process.exit(1);
}

// Find the matching closing bracket for the array
// This is a bit naive but since we know the structure it should work
// Actually, let's find the first ]; after the startIndex
const endIndex = appJs.indexOf(endMarker, startIndex);
if (endIndex === -1) {
    console.error('Could not find end of PRODUCTS array');
    process.exit(1);
}

const newProductsCode = `const PRODUCTS = ${productsStr};`;
const updatedAppJs = appJs.slice(0, startIndex) + newProductsCode + appJs.slice(endIndex + endMarker.length);

// 4. Update seedData to refresh products if they changed
// We want seedData to refresh the products store if the hardcoded list is different from IDB
// Currently it is:
/*
  const existing = await DB.getAll('products');
  if (!existing.length) {
    for (const p of PRODUCTS) await DB.put('products', p);
  }
*/
// We'll change it to:
/*
  const existing = await DB.getAll('products');
  if (existing.length !== PRODUCTS.length) {
    await DB.clear('products');
    for (const p of PRODUCTS) await DB.put('products', p);
  }
*/

const oldSeedLogic = `  const existing = await DB.getAll('products');\n  if (!existing.length) {\n    for (const p of PRODUCTS) await DB.put('products', p);\n  }`;
const newSeedLogic = `  const existing = await DB.getAll('products');\n  // Refresh products if counts differ or if we want to force update\n  if (existing.length !== PRODUCTS.length) {\n    await DB.clear('products');\n    for (const p of PRODUCTS) await DB.put('products', p);\n  }`;

const finalAppJs = updatedAppJs.replace(oldSeedLogic, newSeedLogic);

// 5. Update categories in buildProductModal
const oldCats = "const cats = ['Cues', 'Balls', 'Tables', 'Accessories', 'Cases'];";
const newCats = "const cats = ['Cues', 'Balls', 'Tables', 'Accessories', 'Cases', 'Cloth'];";
const finalAppJsWithCats = finalAppJs.replace(oldCats, newCats);

fs.writeFileSync(appJsPath, finalAppJsWithCats, 'utf8');
console.log('Successfully updated app.js with ' + products.length + ' products.');
