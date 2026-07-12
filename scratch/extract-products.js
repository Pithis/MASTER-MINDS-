const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

// Find the start and end of the PRODUCTS array
// Line starts with: const PRODUCTS = [
// Line ends with: ]; followed by category taxonomy: // ── Shop Category Taxonomy ──────────────────────────────────── or similar.
const startIdx = appJsContent.indexOf('const PRODUCTS = [');
if (startIdx === -1) {
  console.error('Could not find const PRODUCTS');
  process.exit(1);
}

// Find the matching closing bracket or find the next section starting with "const SHOP_CATEGORIES"
const endToken = 'const SHOP_CATEGORIES = [';
const endIdxBefore = appJsContent.indexOf(endToken);
if (endIdxBefore === -1) {
  console.error('Could not find const SHOP_CATEGORIES');
  process.exit(1);
}

// Find the last ]; before SHOP_CATEGORIES
const productsSegment = appJsContent.substring(startIdx, endIdxBefore);
const lastClosingBracketIdx = productsSegment.lastIndexOf('];');
if (lastClosingBracketIdx === -1) {
  console.error('Could not find closing bracket of PRODUCTS');
  process.exit(1);
}

const productsArrayString = productsSegment.substring(0, lastClosingBracketIdx + 2);

// Let's create products-seed.js
const seedContent = `// Master list of products seeded into SQLite database
module.exports = ${productsArrayString.substring('const PRODUCTS = '.length)};
`;

fs.writeFileSync(path.join(__dirname, '..', 'server', 'products-seed.js'), seedContent, 'utf8');
console.log('Successfully extracted products to server/products-seed.js');
