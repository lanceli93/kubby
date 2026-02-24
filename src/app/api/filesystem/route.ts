import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { count } from "drizzle-orm";

// Enumerate available Windows drive letters
function getWindowsDrives(): { name: string; path: string }[] {
  try {
    const output = execSync(
      "wmic logicaldisk get name",
      { encoding: "utf-8", timeout: 5000 }
    );
    const drives: { name: string; path: string }[] = [];
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (/^[A-Z]:$/.test(trimmed)) {
        drives.push({ name: `${trimmed}\\`, path: `${trimmed}\\` });
      }
    }
    return drives.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // Fallback: check common drive letters
    const drives: { name: string; path: string }[] = [];
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const drivePath = `${letter}:\\`;
      try {
        fs.accessSync(drivePath, fs.constants.R_OK);
        drives.push({ name: drivePath, path: drivePath });
      } catch {
        // Drive not available
      }
    }
    return drives;
  }
}

// GET /api/filesystem?path=/some/dir - List directories at given path
export async function GET(request: NextRequest) {
  // Allow access if: user is logged in, OR no users exist (setup mode)
  const session = await auth();
  const userCount = db.select({ count: count() }).from(users).get();
  const isSetupMode = userCount?.count === 0;

  if (!session?.user && !isSetupMode) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path");

  // Special case: on Windows, if no path or path is "drives", show drive list
  if (process.platform === "win32" && (!requestedPath || requestedPath === "drives")) {
    const drives = getWindowsDrives();
    return NextResponse.json({
      current: "My Computer",
      parent: null,
      directories: drives,
      isDriveList: true,
    });
  }

  const dirPath = requestedPath || os.homedir();

  try {
    const normalized = path.resolve(dirPath);

    if (!fs.existsSync(normalized)) {
      return NextResponse.json({ error: "Path does not exist" }, { status: 404 });
    }

    const stat = fs.statSync(normalized);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    }

    const entries = fs.readdirSync(normalized, { withFileTypes: true });
    const directories = entries
      .filter((e) => {
        // Only show directories, skip hidden and system dirs
        if (!e.isDirectory()) return false;
        if (e.name.startsWith(".")) return false;
        // Check if we can access the directory
        try {
          fs.accessSync(path.join(normalized, e.name), fs.constants.R_OK);
          return true;
        } catch {
          return false;
        }
      })
      .map((e) => ({
        name: e.name,
        path: path.join(normalized, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(normalized);
    // On Windows, if at drive root (e.g. C:\), parent should go to drive list
    const isAtDriveRoot = process.platform === "win32" && /^[A-Z]:\\$/.test(normalized);

    return NextResponse.json({
      current: normalized,
      parent: isAtDriveRoot ? "drives" : parent !== normalized ? parent : null,
      directories,
    });
  } catch (error) {
    console.error("Filesystem browse error:", error);
    return NextResponse.json(
      { error: "Cannot read directory" },
      { status: 500 }
    );
  }
}
