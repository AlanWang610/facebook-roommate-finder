const fs = require('fs');
const { createCanvas } = require('canvas');

// Create icons of different sizes
const sizes = [16, 48, 128];

for (const size of sizes) {
  // Create canvas
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Draw background
  ctx.fillStyle = '#4267B2'; // Facebook blue
  ctx.fillRect(0, 0, size, size);
  
  // Draw "FB" text
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size * 0.5}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FB', size / 2, size / 2);
  
  // Save to file
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`images/icon${size}.png`, buffer);
  
  console.log(`Created icon${size}.png`);
} 
