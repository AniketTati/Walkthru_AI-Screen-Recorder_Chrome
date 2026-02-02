const fs = require('fs');
const { execSync } = require('child_process');

// Check if sharp is available, if not install it
try {
  require.resolve('sharp');
} catch (e) {
  console.log('Installing sharp...');
  execSync('npm install sharp --no-save', { stdio: 'inherit' });
}

const sharp = require('sharp');

const sizes = [16, 48, 128];
const svgFile = 'icon.svg';

async function generateIcons() {
  console.log(`Generating icons from ${svgFile}...\n`);

  const svgBuffer = fs.readFileSync(svgFile);

  for (const size of sizes) {
    const outputFile = `icon${size}.png`;
    
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputFile);
    
    console.log(`✓ Created ${outputFile}`);
  }

  console.log('\nAll 3 icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
