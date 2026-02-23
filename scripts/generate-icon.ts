/**
 * Generate Kubby app icon matching the header logo (rounded square + K strokes).
 * Outputs .icns (macOS), 1024px PNG, and 32px tray PNG.
 *
 * Usage: npx tsx scripts/generate-icon.ts [output-dir]
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.argv[2] || path.resolve(__dirname, "..", "launcher", "assets");

function kubbyLogoSVG(size: number): string {
  // Matches the KubbyLogo component in app-header.tsx:
  //   rounded square frame + K letter strokes, transparent background
  // Scaled from viewBox 28x28 to target size
  // Minimal padding — macOS applies its own superellipse mask
  const padding = size * 0.02;
  const inner = size - padding * 2;

  const s = (v: number) => padding + (v / 28) * inner;
  const sw = (v: number) => (v / 28) * inner;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Rounded square frame with white fill -->
  <rect x="${s(2)}" y="${s(2)}" width="${sw(24)}" height="${sw(24)}" rx="${sw(6)}"
        fill="#0f0f1a" stroke="#3b82f6" stroke-width="${sw(2.5)}"/>
  <!-- Letter K -->
  <path d="M${s(10)} ${s(8)}v${sw(12)}M${s(10)} ${s(14)}l${sw(8)} ${sw(-6)}M${s(10)} ${s(14)}l${sw(8)} ${sw(6)}"
        stroke="#3b82f6" stroke-width="${sw(2.8)}"
        stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
}

async function main() {
  const sharp = (await import("sharp")).default;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Generate 1024px master
  const svg1024 = kubbyLogoSVG(1024);
  const masterPng = await sharp(Buffer.from(svg1024)).resize(1024, 1024).png().toBuffer();
  const masterPath = path.join(OUTPUT_DIR, "icon_1024.png");
  fs.writeFileSync(masterPath, masterPng);
  console.log(`Generated: ${masterPath}`);

  // 2. Generate .iconset for macOS
  const iconsetDir = path.join(OUTPUT_DIR, "kubby.iconset");
  if (fs.existsSync(iconsetDir)) fs.rmSync(iconsetDir, { recursive: true });
  fs.mkdirSync(iconsetDir, { recursive: true });

  for (const s of [16, 32, 128, 256, 512]) {
    fs.writeFileSync(
      path.join(iconsetDir, `icon_${s}x${s}.png`),
      await sharp(masterPng).resize(s, s).png().toBuffer()
    );
    fs.writeFileSync(
      path.join(iconsetDir, `icon_${s}x${s}@2x.png`),
      await sharp(masterPng).resize(s * 2, s * 2).png().toBuffer()
    );
  }

  // 3. Convert to .icns
  const icnsPath = path.join(OUTPUT_DIR, "kubby.icns");
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: "inherit" });
    console.log(`Generated: ${icnsPath}`);
  } catch {
    console.error("iconutil failed — .icns not created (macOS only)");
  }
  fs.rmSync(iconsetDir, { recursive: true });

  // 4. Generate tray icons
  // macOS: white on transparent (menu bar is light or dark)
  const trayMacSvg = `<svg width="32" height="32" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="24" height="24" rx="6" fill="none" stroke="white" stroke-width="2.2"/>
  <path d="M10 8v12M10 14l8-6M10 14l8 6" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
  const trayMacPng = await sharp(Buffer.from(trayMacSvg)).resize(32, 32).png().toBuffer();
  fs.writeFileSync(path.join(OUTPUT_DIR, "tray_icon.png"), trayMacPng);
  console.log(`Generated: tray_icon.png (macOS)`);

  // Windows: full-color icon (blue K on dark background, visible on any taskbar)
  const trayWinSvg = kubbyLogoSVG(64);
  const trayWinPng = await sharp(Buffer.from(trayWinSvg)).resize(64, 64).png().toBuffer();
  fs.writeFileSync(path.join(OUTPUT_DIR, "tray_icon_win.png"), trayWinPng);
  console.log(`Generated: tray_icon_win.png (Windows)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
