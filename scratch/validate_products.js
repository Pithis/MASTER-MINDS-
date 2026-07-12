const fs = require('fs');

const appJs = fs.readFileSync('app.js', 'utf8');
const startMarker = 'const PRODUCTS = [';
const endMarker = '];';
const startIndex = appJs.indexOf(startMarker);
const endIndex = appJs.indexOf(endMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find PRODUCTS array.");
    process.exit(1);
}

const arrayStr = appJs.slice(startIndex + startMarker.length - 1, endIndex + 1);
const products = JSON.parse(arrayStr);

let errors = [];

products.forEach((p, index) => {
    if (!p.id) errors.push(`Product at index ${index} missing 'id'`);
    if (!p.name) errors.push(`Product '${p.id}' missing 'name'`);
    if (typeof p.price !== 'number') errors.push(`Product '${p.id}' missing or invalid 'price'`);
    if (!p.category) errors.push(`Product '${p.id}' missing 'category'`);
});

if (errors.length > 0) {
    console.error("Found errors in PRODUCTS:");
    errors.slice(0, 20).forEach(e => console.error(e));
    if (errors.length > 20) console.error(`...and ${errors.length - 20} more errors.`);
} else {
    console.log(`Successfully validated ${products.length} products. No missing required fields.`);
}
