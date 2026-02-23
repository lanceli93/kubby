/**
 * Generate Kubby app icon as a 1024x1024 PNG, then convert to .icns via iconutil.
 * Uses sharp to create a blue circle with a white "K" letter.
 *
 * Usage: npx tsx scripts/generate-icon.ts [output-dir]
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.argv[2] || path.resolve(__dirname, "..", "launcher", "assets");

async function createIconPNG(size: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;

  // Create SVG with a rounded square background and "K" letter
  const svg = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F6AFF"/>
      <stop offset="100%" style="stop-color:#3B45CC"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" ry="${size * 0.22}" fill="url(#bg)"/>
  <text
    x="50%" y="54%"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif"
    font-weight="700"
    font-size="${size * 0.55}"
    fill="white"
    letter-spacing="-${size * 0.02}"
  >K</text>
</svg>`;

  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Generate 1024px master icon
  const masterPng = await createIconPNG(1024);
  const masterPath = path.join(OUTPUT_DIR, "icon_1024.png");
  fs.writeFileSync(masterPath, masterPng);
  console.log(`Generated: ${masterPath}`);

  // Create .iconset directory for macOS
  const iconsetDir = path.join(OUTPUT_DIR, "kubby.iconset");
  if (fs.existsSync(iconsetDir)) fs.rmSync(iconsetDir, { recursive: true });
  fs.mkdirSync(iconsetDir, { recursive: true });

  const sharp = (await import("sharp")).default;
  const sizes = [16, 32, 128, 256, 512];
  for (const s of sizes) {
    // 1x
    const buf1x = await sharp(masterPng).resize(s, s).png().toBuffer();
    fs.writeFileSync(path.join(iconsetDir, `icon_${s}x${s}.png`), buf1x);
    // 2x
    const buf2x = await sharp(masterPng).resize(s * 2, s * 2).png().toBuffer();
    fs.writeFileSync(path.join(iconsetDir, `icon_${s}x${s}@2x.png`), buf2x);
  }

  // Convert to .icns
  const icnsPath = path.join(OUTPUT_DIR, "kubby.icns");
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: "inherit" });
    console.log(`Generated: ${icnsPath}`);
  } catch {
    console.error("iconutil failed — .icns not created (macOS only)");
  }

  // Cleanup iconset
  fs.rmSync(iconsetDir, { recursive: true });

  // Also generate a 32x32 PNG for the system tray
  const trayPng = await createIconPNG(32);
  const trayPath = path.join(OUTPUT_DIR, "tray_icon.png");
  fs.writeFileSync(trayPath, trayPng);
  console.log(`Generated: ${trayPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
