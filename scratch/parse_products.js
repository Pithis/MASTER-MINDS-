
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'products_data.txt');
const data = fs.readFileSync(filePath, 'utf8');

const lines = data.split('\n');
const products = lines.map(line => {
    const parts = line.split('\t');
    if (parts.length < 6) return null;
    const [name, id, fullCat, qty, unit, price, value] = parts;
    
    // Clean category
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

process.stdout.write(JSON.stringify(products, null, 2));
