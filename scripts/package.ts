#!/usr/bin/env npx tsx
/**
 * Kubby Packaging Script
 *
 * Assembles the distributable package:
 *   1. Build Next.js standalone
 *   2. Copy static assets + public
 *   3. Download Node.js runtime for target platform
 *   4. Download ffprobe for target platform
 *   5. Build Go launcher
 *   6. Assemble final directory
 *
 * Usage:
 *   npx tsx scripts/package.ts                    # Build for current platform
 *   npx tsx scripts/package.ts --platform darwin-arm64
 *   npx tsx scripts/package.ts --platform win-x64
 *   npx tsx scripts/package.ts --platform linux-x64
 *   npx tsx scripts/package.ts --skip-download    # Skip Node/ffprobe download (use cached)
 *   npx tsx scripts/package.ts --skip-build       # Skip Next.js build (use existing .next/)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";
import { Readable } from "stream";
import { fileURLToPath } from "url";

// ─── Configuration ───────────────────────────────────────────

// Use current Node.js version or override via NODE_VERSION env
const NODE_VERSION = process.env.KUBBY_NODE_VERSION || process.version.replace("v", "");
const __scriptDir = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__scriptDir, "..");
const DIST_DIR = path.join(PROJECT_ROOT, "dist");
const DOWNLOAD_CACHE = path.join(PROJECT_ROOT, ".download-cache");

type Platform = "darwin-arm64" | "darwin-x64" | "win-x64" | "linux-x64";

interface PlatformConfig {
  nodeUrl: string;
  nodeArchiveType: "tar.gz" | "zip" | "tar.xz";
  nodeDirName: string;
  ffprobeUrl: string;
  ffprobeArchiveType: "zip" | "tar.xz" | "7z";
  goOs: string;
  goArch: string;
  launcherBin: string;
  ffprobeBin: string;
}

const PLATFORMS: Record<Platform, PlatformConfig> = {
  "darwin-arm64": {
    nodeUrl: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    nodeArchiveType: "tar.gz",
    nodeDirName: `node-v${NODE_VERSION}-darwin-arm64`,
    ffprobeUrl:
      "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffprobe-darwin-arm64.gz",
    ffprobeArchiveType: "zip", // actually .gz, handled specially
    goOs: "darwin",
    goArch: "arm64",
    launcherBin: "kubby",
    ffprobeBin: "ffprobe",
  },
  "darwin-x64": {
    nodeUrl: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    nodeArchiveType: "tar.gz",
    nodeDirName: `node-v${NODE_VERSION}-darwin-x64`,
    ffprobeUrl:
      "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffprobe-darwin-x64.gz",
    ffprobeArchiveType: "zip",
    goOs: "darwin",
    goArch: "amd64",
    launcherBin: "kubby",
    ffprobeBin: "ffprobe",
  },
  "win-x64": {
    nodeUrl: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`,
    nodeArchiveType: "zip",
    nodeDirName: `node-v${NODE_VERSION}-win-x64`,
    ffprobeUrl:
      "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffprobe-win32-x64.gz",
    ffprobeArchiveType: "zip",
    goOs: "windows",
    goArch: "amd64",
    launcherBin: "kubby.exe",
    ffprobeBin: "ffprobe.exe",
  },
  "linux-x64": {
    nodeUrl: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz`,
    nodeArchiveType: "tar.xz",
    nodeDirName: `node-v${NODE_VERSION}-linux-x64`,
    ffprobeUrl:
      "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffprobe-linux-x64.gz",
    ffprobeArchiveType: "zip",
    goOs: "linux",
    goArch: "amd64",
    launcherBin: "kubby",
    ffprobeBin: "ffprobe",
  },
};

// ─── Helpers ─────────────────────────────────────────────────

function run(cmd: string, opts?: { cwd?: string; env?: Record<string, string> }) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, {
    stdio: "inherit",
    cwd: opts?.cwd || PROJECT_ROOT,
    env: { ...process.env, ...opts?.env },
  });
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDirRecursive(src: string, dest: string) {
  fs.cpSync(src, dest, { recursive: true });
}

async function downloadFile(url: string, dest: string): Promise<void> {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`  [cached] ${path.basename(dest)}`);
    return;
  }
  console.log(`  Downloading ${url}...`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error(`No response body for ${url}`);
  ensureDir(path.dirname(dest));
  const arrayBuf = await res.arrayBuffer();
  fs.writeFileSync(dest, new Uint8Array(arrayBuf));
  console.log(`  Saved to ${dest} (${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)} MB)`);
}

// Download a .gz file and decompress it to dest
async function downloadAndGunzip(url: string, cachePath: string, dest: string, skipDownload: boolean): Promise<void> {
  if (!skipDownload) {
    await downloadFile(url, cachePath);
  } else if (!fs.existsSync(cachePath)) {
    throw new Error(`--skip-download specified but cache missing: ${cachePath}`);
  }

  ensureDir(path.dirname(dest));
  const input = fs.createReadStream(cachePath);
  const gunzip = createGunzip();
  const output = createWriteStream(dest);
  await pipeline(input, gunzip, output);
}

function detectPlatform(): Platform {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  switch (process.platform) {
    case "darwin":
      return `darwin-${arch}` as Platform;
    case "win32":
      return "win-x64";
    case "linux":
      return "linux-x64";
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

// ─── Build Steps ─────────────────────────────────────────────

function buildNextjs() {
  console.log("\n[1/6] Building Next.js standalone...");
  run("npm run build");
}

function findStandaloneRoot(): string {
  // Next.js standalone mirrors the project path under .next/standalone/
  const standaloneBase = path.join(PROJECT_ROOT, ".next", "standalone");

  // Find the directory containing both server.js AND node_modules/
  // (to avoid matching stale copies in dist/)
  function findServerJS(dir: string): string | null {
    const hasServerJS = fs.existsSync(path.join(dir, "server.js"));
    const hasNodeModules = fs.existsSync(path.join(dir, "node_modules"));
    if (hasServerJS && hasNodeModules) {
      return dir;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== "dist") {
        const found = findServerJS(path.join(dir, entry.name));
        if (found) return found;
      }
    }
    return null;
  }

  const root = findServerJS(standaloneBase);
  if (!root) {
    throw new Error("Could not find server.js + node_modules in .next/standalone/");
  }
  return root;
}

function assembleServer(outputDir: string) {
  console.log("\n[2/6] Assembling server directory...");

  const serverDir = path.join(outputDir, "server");
  const standaloneRoot = findStandaloneRoot();
  ensureDir(serverDir);

  console.log(`  Standalone root: ${standaloneRoot}`);

  // Only copy essential files from standalone (skip project config, docs, etc.)
  const essentials = ["server.js", "package.json", "node_modules", ".next"];
  for (const name of essentials) {
    const src = path.join(standaloneRoot, name);
    if (fs.existsSync(src)) {
      copyDirRecursive(src, path.join(serverDir, name));
      console.log(`  Copied ${name}`);
    }
  }

  // Copy static assets (not included in standalone by default)
  const staticSrc = path.join(PROJECT_ROOT, ".next", "static");
  const staticDest = path.join(serverDir, ".next", "static");
  if (fs.existsSync(staticSrc)) {
    copyDirRecursive(staticSrc, staticDest);
    console.log("  Copied .next/static/");
  }

  // Copy public directory
  const publicSrc = path.join(PROJECT_ROOT, "public");
  const publicDest = path.join(serverDir, "public");
  if (fs.existsSync(publicSrc)) {
    copyDirRecursive(publicSrc, publicDest);
    console.log("  Copied public/");
  }
}

// Map platform to npm/prebuild naming
const NATIVE_PLATFORM_MAP: Record<Platform, { npm: string; prebuildOs: string; prebuildArch: string }> = {
  "darwin-arm64": { npm: "darwin-arm64", prebuildOs: "darwin", prebuildArch: "arm64" },
  "darwin-x64": { npm: "darwin-x64", prebuildOs: "darwin", prebuildArch: "x64" },
  "win-x64": { npm: "win32-x64", prebuildOs: "win32", prebuildArch: "x64" },
  "linux-x64": { npm: "linux-x64", prebuildOs: "linux", prebuildArch: "x64" },
};

async function swapNativeModules(platform: Platform, outputDir: string, skipDownload: boolean) {
  const hostPlatform = detectPlatform();
  const native = NATIVE_PLATFORM_MAP[platform];
  const hostNative = NATIVE_PLATFORM_MAP[hostPlatform];

  if (native.npm === hostNative.npm) {
    console.log("  Native modules match host platform, no swap needed");
    return;
  }

  console.log(`  Swapping native modules: ${hostNative.npm} → ${native.npm}`);
  const serverNodeModules = path.join(outputDir, "server", "node_modules");

  // --- sharp ---
  // Remove host platform sharp, install target platform
  const hostSharpDir = path.join(serverNodeModules, `@img/sharp-${hostNative.npm}`);
  const hostSharpLibvipsDir = path.join(serverNodeModules, `@img/sharp-libvips-${hostNative.npm}`);
  const targetSharpPkg = `@img/sharp-${native.npm}`;
  const targetLibvipsPkg = `@img/sharp-libvips-${native.npm}`;

  if (fs.existsSync(hostSharpDir)) {
    fs.rmSync(hostSharpDir, { recursive: true });
    console.log(`  Removed @img/sharp-${hostNative.npm}`);
  }
  if (fs.existsSync(hostSharpLibvipsDir)) {
    fs.rmSync(hostSharpLibvipsDir, { recursive: true });
    console.log(`  Removed @img/sharp-libvips-${hostNative.npm}`);
  }

  // Download target sharp packages from npm registry
  for (const pkg of [targetSharpPkg, targetLibvipsPkg]) {
    const tarballUrl = await getNpmTarballUrl(pkg);
    if (!tarballUrl) {
      console.warn(`  WARNING: Could not find ${pkg} on npm`);
      continue;
    }
    const cachePath = path.join(DOWNLOAD_CACHE, `${pkg.replace("/", "-")}.tgz`);
    if (!skipDownload) {
      await downloadFile(tarballUrl, cachePath);
    }
    if (fs.existsSync(cachePath)) {
      const extractDir = path.join(DOWNLOAD_CACHE, "npm-extract");
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
      ensureDir(extractDir);
      execSync(`tar xzf "${cachePath}" -C "${extractDir}"`, { stdio: "ignore" });
      // npm tarballs extract to a "package/" directory
      const pkgDir = path.join(extractDir, "package");
      const targetDir = path.join(serverNodeModules, pkg);
      ensureDir(path.dirname(targetDir));
      if (fs.existsSync(pkgDir)) {
        copyDirRecursive(pkgDir, targetDir);
        console.log(`  Installed ${pkg}`);
      }
      fs.rmSync(extractDir, { recursive: true });
    }
  }

  // --- better-sqlite3 ---
  // Download prebuilt .node binary for target platform
  const bs3Dir = path.join(serverNodeModules, "better-sqlite3");
  if (fs.existsSync(bs3Dir)) {
    const bs3Version = JSON.parse(fs.readFileSync(path.join(bs3Dir, "package.json"), "utf-8")).version;
    // better-sqlite3 prebuild URL format:
    // https://github.com/JoshuaWise/better-sqlite3/releases/download/v{ver}/better-sqlite3-v{ver}-node-v{abi}-{os}-{arch}.tar.gz
    const nodeABI = process.versions.modules; // e.g. "127"
    const prebuildName = `better-sqlite3-v${bs3Version}-node-v${nodeABI}-${native.prebuildOs}-${native.prebuildArch}.tar.gz`;
    const prebuildUrl = `https://github.com/JoshuaWise/better-sqlite3/releases/download/v${bs3Version}/${prebuildName}`;
    const prebuildCache = path.join(DOWNLOAD_CACHE, prebuildName);

    if (!skipDownload) {
      try {
        await downloadFile(prebuildUrl, prebuildCache);
      } catch (e) {
        console.warn(`  WARNING: Could not download better-sqlite3 prebuild: ${e}`);
      }
    }

    if (fs.existsSync(prebuildCache)) {
      // Extract and replace the .node file
      const extractDir = path.join(DOWNLOAD_CACHE, "bs3-extract");
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
      ensureDir(extractDir);
      execSync(`tar xzf "${prebuildCache}" -C "${extractDir}"`, { stdio: "ignore" });
      // The prebuild tarball contains build/Release/better_sqlite3.node
      const srcNode = path.join(extractDir, "build", "Release", "better_sqlite3.node");
      if (fs.existsSync(srcNode)) {
        // Replace in top-level node_modules
        const destNode = path.join(bs3Dir, "build", "Release", "better_sqlite3.node");
        ensureDir(path.dirname(destNode));
        fs.cpSync(srcNode, destNode);

        // Also replace in .next/node_modules/ (Next.js standalone copies native modules there too)
        const dotNextNodeModules = path.join(serverNodeModules, "..", ".next", "node_modules");
        if (fs.existsSync(dotNextNodeModules)) {
          const entries = fs.readdirSync(dotNextNodeModules);
          for (const entry of entries) {
            if (entry.startsWith("better-sqlite3")) {
              const innerNode = path.join(dotNextNodeModules, entry, "build", "Release", "better_sqlite3.node");
              if (fs.existsSync(innerNode)) {
                fs.cpSync(srcNode, innerNode);
                console.log(`  Replaced .next/node_modules/${entry} binary`);
              }
            }
          }
        }

        console.log(`  Replaced better-sqlite3 binary (${native.npm})`);
      }
      fs.rmSync(extractDir, { recursive: true });
    }
  }
}

async function getNpmTarballUrl(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
    if (!res.ok) return null;
    const data = await res.json() as { dist?: { tarball?: string } };
    return data.dist?.tarball || null;
  } catch {
    return null;
  }
}

async function downloadNode(platform: Platform, outputDir: string, skipDownload: boolean) {
  console.log("\n[3/6] Setting up Node.js runtime...");
  const cfg = PLATFORMS[platform];

  const archiveName = path.basename(new URL(cfg.nodeUrl).pathname);
  const archivePath = path.join(DOWNLOAD_CACHE, archiveName);

  if (!skipDownload) {
    await downloadFile(cfg.nodeUrl, archivePath);
  } else if (!fs.existsSync(archivePath)) {
    throw new Error(`--skip-download specified but cache missing: ${archivePath}`);
  }

  const nodeDir = path.join(outputDir, "node");
  ensureDir(nodeDir);

  // Extract based on archive type
  const extractDir = path.join(DOWNLOAD_CACHE, "node-extract");
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  ensureDir(extractDir);

  if (cfg.nodeArchiveType === "zip") {
    run(`unzip -q "${archivePath}" -d "${extractDir}"`);
  } else if (cfg.nodeArchiveType === "tar.gz") {
    run(`tar xzf "${archivePath}" -C "${extractDir}"`);
  } else if (cfg.nodeArchiveType === "tar.xz") {
    run(`tar xJf "${archivePath}" -C "${extractDir}"`);
  }

  // Copy node binary (and lib for non-Windows)
  const extracted = path.join(extractDir, cfg.nodeDirName);
  if (platform === "win-x64") {
    // Windows: just copy node.exe
    fs.cpSync(path.join(extracted, "node.exe"), path.join(nodeDir, "node.exe"));
  } else {
    // Unix: copy bin/node and lib/
    const binDir = path.join(nodeDir, "bin");
    ensureDir(binDir);
    fs.cpSync(path.join(extracted, "bin", "node"), path.join(binDir, "node"));
    fs.chmodSync(path.join(binDir, "node"), 0o755);
  }

  // Cleanup
  fs.rmSync(extractDir, { recursive: true });
  console.log("  Node.js runtime ready");
}

async function downloadFfprobe(platform: Platform, outputDir: string, skipDownload: boolean) {
  console.log("\n[4/6] Setting up ffprobe...");
  const cfg = PLATFORMS[platform];

  const archiveName = path.basename(new URL(cfg.ffprobeUrl).pathname);
  const archivePath = path.join(DOWNLOAD_CACHE, archiveName);

  const binDir = path.join(outputDir, "bin");
  ensureDir(binDir);
  const ffprobeDest = path.join(binDir, cfg.ffprobeBin);

  // Download and decompress .gz → binary using Node.js zlib
  await downloadAndGunzip(cfg.ffprobeUrl, archivePath, ffprobeDest, skipDownload);

  if (platform !== "win-x64") {
    fs.chmodSync(ffprobeDest, 0o755);
  }

  console.log("  ffprobe ready");
}

function buildLauncher(platform: Platform, outputDir: string) {
  console.log("\n[5/6] Building Go launcher...");
  const cfg = PLATFORMS[platform];
  const launcherDir = path.join(PROJECT_ROOT, "launcher");

  const ldflags = platform === "win-x64" ? '-ldflags "-H=windowsgui"' : "";
  const cgoEnabled = platform === "win-x64" ? "0" : "1";

  const binDest = path.join(outputDir, cfg.launcherBin);

  run(
    `GOOS=${cfg.goOs} GOARCH=${cfg.goArch} CGO_ENABLED=${cgoEnabled} GOPROXY=direct go build ${ldflags} -o "${binDest}" .`,
    { cwd: launcherDir }
  );

  if (platform !== "win-x64") {
    fs.chmodSync(binDest, 0o755);
  }

  console.log(`  Launcher built: ${cfg.launcherBin}`);
}

function createMacOSApp(platform: Platform, flatDir: string, distDir: string) {
  if (!platform.startsWith("darwin")) return flatDir;

  console.log("\n[6/7] Creating macOS .app bundle...");
  const cfg = PLATFORMS[platform];

  const appDir = path.join(distDir, "Kubby.app");
  const contentsDir = path.join(appDir, "Contents");
  const macosDir = path.join(contentsDir, "MacOS");
  const resourcesDir = path.join(contentsDir, "Resources");

  // Clean previous .app
  if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true });

  ensureDir(macosDir);
  ensureDir(resourcesDir);

  // Copy Info.plist
  const plistSrc = path.join(PROJECT_ROOT, "launcher", "assets", "Info.plist");
  fs.cpSync(plistSrc, path.join(contentsDir, "Info.plist"));

  // Move launcher binary → Contents/MacOS/
  const launcherSrc = path.join(flatDir, cfg.launcherBin);
  const launcherDest = path.join(macosDir, cfg.launcherBin);
  fs.renameSync(launcherSrc, launcherDest);

  // Move resources → Contents/Resources/
  for (const name of ["server", "node", "bin"]) {
    const src = path.join(flatDir, name);
    if (fs.existsSync(src)) {
      fs.renameSync(src, path.join(resourcesDir, name));
    }
  }

  // Copy pre-generated .icns icon
  const icnsSrc = path.join(PROJECT_ROOT, "launcher", "assets", "kubby.icns");
  if (fs.existsSync(icnsSrc)) {
    fs.cpSync(icnsSrc, path.join(resourcesDir, "kubby.icns"));
    console.log("  Copied kubby.icns");
  }

  // Remove the now-empty flat directory
  try { fs.rmSync(flatDir, { recursive: true }); } catch { /* might not be empty */ }

  console.log(`  Created: ${appDir}`);
  return appDir;
}

function createDMG(appDir: string, distDir: string) {
  if (!appDir.endsWith(".app")) return;

  console.log("\n[7/7] Creating DMG installer...");

  const dmgPath = path.join(distDir, "Kubby.dmg");
  if (fs.existsSync(dmgPath)) fs.unlinkSync(dmgPath);

  // Create a temporary directory for DMG contents
  const dmgStaging = path.join(distDir, ".dmg-staging");
  if (fs.existsSync(dmgStaging)) fs.rmSync(dmgStaging, { recursive: true });
  ensureDir(dmgStaging);

  // Copy .app into staging
  copyDirRecursive(appDir, path.join(dmgStaging, "Kubby.app"));

  // Create a symlink to /Applications (the drag-to-install target)
  fs.symlinkSync("/Applications", path.join(dmgStaging, "Applications"));

  // Copy .icns as volume icon
  const icnsSrc = path.join(PROJECT_ROOT, "launcher", "assets", "kubby.icns");
  if (fs.existsSync(icnsSrc)) {
    fs.cpSync(icnsSrc, path.join(dmgStaging, ".VolumeIcon.icns"));
  }

  // Create read-write DMG first, set volume icon, then convert to compressed
  const dmgRW = path.join(distDir, "Kubby-rw.dmg");
  if (fs.existsSync(dmgRW)) fs.unlinkSync(dmgRW);

  try {
    // Create read-write DMG
    run(`hdiutil create -volname "Kubby" -srcfolder "${dmgStaging}" -ov -format UDRW "${dmgRW}"`);

    // Mount it, set custom icon flag, unmount
    run(`hdiutil attach "${dmgRW}" -mountpoint /tmp/kubby-dmg-mount -nobrowse`);
    try {
      // SetFile -a C sets the "custom icon" flag on the volume
      execSync(`SetFile -a C /tmp/kubby-dmg-mount`, { stdio: "ignore" });
    } catch { /* SetFile may not be available, icon still works in most cases */ }
    run(`hdiutil detach /tmp/kubby-dmg-mount`);

    // Convert to compressed read-only DMG
    run(`hdiutil convert "${dmgRW}" -format UDZO -o "${dmgPath}"`);
    fs.unlinkSync(dmgRW);

    // Set DMG file icon visible in Finder (via resource fork)
    try {
      const pngSrc = path.join(PROJECT_ROOT, "launcher", "assets", "icon_1024.png");
      const tmpIcon = "/tmp/kubby_tmpicon.png";
      fs.cpSync(pngSrc, tmpIcon);
      execSync(`sips -i "${tmpIcon}"`, { stdio: "ignore" });
      execSync(`DeRez -only icns "${tmpIcon}" > /tmp/kubby_icon.rsrc`, { stdio: "ignore", shell: "/bin/bash" });
      execSync(`Rez -append /tmp/kubby_icon.rsrc -o "${dmgPath}"`, { stdio: "ignore" });
      execSync(`SetFile -a C "${dmgPath}"`, { stdio: "ignore" });
      fs.unlinkSync(tmpIcon);
      fs.unlinkSync("/tmp/kubby_icon.rsrc");
      console.log("  DMG file icon set");
    } catch { /* icon on DMG file is optional */ }

    console.log(`  Created: ${dmgPath} (${(fs.statSync(dmgPath).size / 1024 / 1024).toFixed(1)} MB)`);
  } catch (e) {
    console.error("  DMG creation failed:", e);
    // Fallback: simple DMG without custom icon
    if (!fs.existsSync(dmgPath)) {
      try {
        run(`hdiutil create -volname "Kubby" -srcfolder "${dmgStaging}" -ov -format UDZO "${dmgPath}"`);
      } catch { /* give up */ }
    }
    if (fs.existsSync(dmgRW)) fs.unlinkSync(dmgRW);
  }

  // Cleanup staging
  fs.rmSync(dmgStaging, { recursive: true });
}

function createWindowsInstaller(flatDir: string, distDir: string) {
  console.log("\n[6/6] Creating Windows installer (NSIS)...");

  const nsiScript = path.join(PROJECT_ROOT, "installer", "windows", "kubby.nsi");
  if (!fs.existsSync(nsiScript)) {
    console.warn("  NSIS script not found, skipping installer creation");
    return;
  }

  // Check makensis is available
  try {
    execSync("which makensis", { stdio: "ignore" });
  } catch {
    console.warn("  makensis not found. Install via: brew install nsis");
    return;
  }

  // Run makensis from project root; INPUTDIR points to the flat build dir
  // -NOCD prevents makensis from changing to the .nsi file's directory
  const relFlatDir = path.relative(PROJECT_ROOT, flatDir);
  run(`makensis -NOCD -DINPUTDIR="${relFlatDir}" "${path.relative(PROJECT_ROOT, nsiScript)}"`);

  const exePath = path.join(distDir, "KubbySetup.exe");
  if (fs.existsSync(exePath)) {
    console.log(`  Created: ${exePath} (${(fs.statSync(exePath).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

function finalReport(outputDir: string) {
  console.log("\n[6/6] Package complete!");
  console.log(`  Output: ${outputDir}`);

  // Calculate total size
  let totalSize = 0;
  function calcSize(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        calcSize(fullPath);
      } else {
        totalSize += fs.statSync(fullPath).size;
      }
    }
  }
  calcSize(outputDir);

  console.log(`  Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log("\n  Directory structure:");

  // Show top-level contents
  const entries = fs.readdirSync(outputDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(outputDir, entry.name);
    if (entry.isDirectory()) {
      let dirSize = 0;
      calcSize(fullPath);
      console.log(`    ${entry.name}/`);
    } else {
      const size = fs.statSync(fullPath).size;
      console.log(`    ${entry.name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const skipDownload = args.includes("--skip-download");
  const skipBuild = args.includes("--skip-build");

  let platform: Platform;
  const platformFlag = args.indexOf("--platform");
  if (platformFlag >= 0 && args[platformFlag + 1]) {
    platform = args[platformFlag + 1] as Platform;
  } else {
    platform = detectPlatform();
  }

  if (!PLATFORMS[platform]) {
    console.error(`Unknown platform: ${platform}`);
    console.error(`Available: ${Object.keys(PLATFORMS).join(", ")}`);
    process.exit(1);
  }

  console.log(`\nKubby Packaging Script`);
  console.log(`  Platform: ${platform}`);
  console.log(`  Node.js: v${NODE_VERSION}`);
  console.log(`  Project: ${PROJECT_ROOT}`);

  const outputDir = path.join(DIST_DIR, `kubby-${platform}`);

  // Clean previous build
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  ensureDir(outputDir);
  ensureDir(DOWNLOAD_CACHE);

  // Run build steps
  if (!skipBuild) {
    buildNextjs();
  } else {
    console.log("\n[1/7] Skipping Next.js build (--skip-build)");
  }
  assembleServer(outputDir);
  await swapNativeModules(platform, outputDir, skipDownload);
  await downloadNode(platform, outputDir, skipDownload);
  await downloadFfprobe(platform, outputDir, skipDownload);
  buildLauncher(platform, outputDir);

  // Platform-specific installer
  let finalDir = outputDir;
  if (platform.startsWith("darwin")) {
    finalDir = createMacOSApp(platform, outputDir, DIST_DIR);
    createDMG(finalDir, DIST_DIR);
  } else if (platform === "win-x64") {
    createWindowsInstaller(outputDir, DIST_DIR);
  }
  finalReport(platform.startsWith("darwin") ? finalDir : outputDir);

  // Print final output path
  if (platform.startsWith("darwin")) {
    const dmgPath = path.join(DIST_DIR, "Kubby.dmg");
    console.log(`\nDone! Distribute: ${fs.existsSync(dmgPath) ? dmgPath : finalDir}`);
  } else if (platform === "win-x64") {
    const exePath = path.join(DIST_DIR, "KubbySetup.exe");
    console.log(`\nDone! Distribute: ${fs.existsSync(exePath) ? exePath : outputDir}`);
  } else {
    console.log(`\nDone! To test: cd ${outputDir} && ./${PLATFORMS[platform].launcherBin}`);
  }
}

main().catch((e) => {
  console.error("\nFatal error:", e);
  process.exit(1);
});
