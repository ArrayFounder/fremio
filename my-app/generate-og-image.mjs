// generate-og-image.mjs
// Script untuk membuat OG image 1200x630 menggunakan sharp
import sharp from 'sharp';
import { createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// SVG design: gradient ungu, logo teks Fremio, tagline
const svgContent = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background gradient ungu ke biru -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4c1d95;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#7c3aed;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#db2777;stop-opacity:1" />
    </linearGradient>
    <!-- Gradient untuk card/highlight -->
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.15" />
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0.05" />
    </linearGradient>
    <!-- Glow effect -->
    <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#c084fc;stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:0" />
    </radialGradient>
    <!-- Drop shadow filter -->
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
    <filter id="textShadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)"/>

  <!-- Subtle glow overlay -->
  <ellipse cx="600" cy="315" rx="500" ry="280" fill="url(#glowGrad)"/>

  <!-- Decorative circles (background) -->
  <circle cx="100" cy="100" r="180" fill="#ffffff" fill-opacity="0.04"/>
  <circle cx="1100" cy="530" r="220" fill="#ffffff" fill-opacity="0.04"/>
  <circle cx="1050" cy="80" r="120" fill="#db2777" fill-opacity="0.12"/>
  <circle cx="150" cy="550" r="100" fill="#c084fc" fill-opacity="0.12"/>

  <!-- Photo frame icons (decorative) -->
  <!-- Frame kiri atas -->
  <rect x="60" y="160" width="110" height="140" rx="12" fill="url(#cardGrad)" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1.5" filter="url(#shadow)"/>
  <rect x="72" y="172" width="86" height="90" rx="6" fill="#ffffff" fill-opacity="0.15"/>
  <circle cx="88" cy="188" r="8" fill="#fbbf24" fill-opacity="0.8"/>
  <rect x="72" y="276" width="86" height="12" rx="4" fill="#ffffff" fill-opacity="0.35"/>

  <!-- Frame kanan bawah -->
  <rect x="1030" y="330" width="110" height="140" rx="12" fill="url(#cardGrad)" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1.5" filter="url(#shadow)"/>
  <rect x="1042" y="342" width="86" height="90" rx="6" fill="#ffffff" fill-opacity="0.15"/>
  <circle cx="1058" cy="358" r="8" fill="#34d399" fill-opacity="0.8"/>
  <rect x="1042" y="446" width="86" height="12" rx="4" fill="#ffffff" fill-opacity="0.35"/>

  <!-- Frame kanan atas (kecil) -->
  <rect x="1060" y="120" width="80" height="100" rx="10" fill="url(#cardGrad)" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1.5" filter="url(#shadow)"/>
  <rect x="1070" y="130" width="60" height="60" rx="5" fill="#ffffff" fill-opacity="0.15"/>
  <circle cx="1082" cy="144" r="6" fill="#f472b6" fill-opacity="0.8"/>

  <!-- Frame kiri bawah (kecil) -->
  <rect x="60" y="380" width="80" height="100" rx="10" fill="url(#cardGrad)" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1.5" filter="url(#shadow)"/>
  <rect x="70" y="390" width="60" height="60" rx="5" fill="#ffffff" fill-opacity="0.15"/>
  <circle cx="82" cy="404" r="6" fill="#60a5fa" fill-opacity="0.8"/>

  <!-- Konten utama - centered -->
  <!-- Badge "Photo Booth Online" -->
  <rect x="400" y="140" width="400" height="36" rx="18" fill="#ffffff" fill-opacity="0.15" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1"/>
  <text x="600" y="163" font-family="Arial, sans-serif" font-size="15" font-weight="600" fill="#ffffff" fill-opacity="0.9" text-anchor="middle" letter-spacing="3">✦ PHOTO BOOTH ONLINE INDONESIA ✦</text>

  <!-- Logo utama: "fremio" -->
  <text x="600" y="310" font-family="Arial Black, Arial, sans-serif" font-size="120" font-weight="900" fill="#ffffff" text-anchor="middle" filter="url(#textShadow)" letter-spacing="-2">fremio</text>

  <!-- Underline dekoratif -->
  <rect x="420" y="325" width="360" height="4" rx="2" fill="#db2777" fill-opacity="0.9"/>
  <rect x="510" y="325" width="180" height="4" rx="2" fill="#f472b6"/>

  <!-- Tagline -->
  <text x="600" y="390" font-family="Arial, sans-serif" font-size="26" font-weight="400" fill="#ffffff" fill-opacity="0.9" text-anchor="middle" letter-spacing="0.5">Photo booth online &amp; photobox virtual terbaik</text>
  <text x="600" y="425" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#f9a8d4" text-anchor="middle" letter-spacing="0.5">Gratis · Mudah · Langsung Pakai</text>

  <!-- URL -->
  <text x="600" y="500" font-family="Arial, sans-serif" font-size="20" font-weight="400" fill="#ffffff" fill-opacity="0.6" text-anchor="middle" letter-spacing="1">fremio.id</text>

  <!-- Camera icon -->
  <g transform="translate(560, 460)">
    <rect x="0" y="4" width="80" height="56" rx="8" fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="2"/>
    <circle cx="40" cy="32" r="16" fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="2"/>
    <circle cx="40" cy="32" r="8" fill="#ffffff" fill-opacity="0.3"/>
    <rect x="28" y="0" width="24" height="12" rx="4" fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="2"/>
    <circle cx="64" cy="12" r="4" fill="#f472b6" fill-opacity="0.8"/>
  </g>
</svg>
`;

async function generateOgImage() {
  const outputPath = join(__dirname, 'public', 'og-image.png');
  
  try {
    await sharp(Buffer.from(svgContent))
      .resize(1200, 630)
      .png()
      .toFile(outputPath);
    
    console.log('✅ OG image berhasil dibuat:', outputPath);
    console.log('   Ukuran: 1200x630px');
    console.log('   Format: PNG');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

generateOgImage();
