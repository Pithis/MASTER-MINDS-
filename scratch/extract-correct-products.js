const fs = require('fs');
const path = require('path');

const originalAppJsPath = '/Users/pithi/Desktop/MASTER-MINDS--main 4/app.js';
const appJsContent = fs.readFileSync(originalAppJsPath, 'utf8');

const startToken = 'const PRODUCTS = [';
const startIdx = appJsContent.indexOf(startToken);
if (startIdx === -1) {
  console.error('Could not find start of PRODUCTS array');
  process.exit(1);
}

// Find index of first opening bracket '['
const arrayStartIdx = startIdx + startToken.length - 1; // index of '['

let bracketCount = 0;
let endIdx = -1;

for (let i = arrayStartIdx; i < appJsContent.length; i++) {
  const char = appJsContent[i];
  if (char === '[') {
    bracketCount++;
  } else if (char === ']') {
    bracketCount--;
    if (bracketCount === 0) {
      endIdx = i;
      break;
    }
  }
}

if (endIdx === -1) {
  console.error('Could not find end of PRODUCTS array');
  process.exit(1);
}

const productsString = appJsContent.substring(arrayStartIdx, endIdx + 1);

// Write to server/products-seed.js
const seedContent = `// Master list of products seeded into SQLite database
module.exports = ${productsString};
`;

fs.writeFileSync(path.join(__dirname, '..', 'server', 'products-seed.js'), seedContent, 'utf8');
console.log('Successfully extracted full products array to server/products-seed.js');
