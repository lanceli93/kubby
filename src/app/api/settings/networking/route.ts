import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const dataDir = process.env.KUBBY_DATA_DIR || "./data";
const configPath = path.join(dataDir, "config.json");

interface ConfigJson {
  port: number;
  allowRemoteAccess?: boolean;
}

function readConfig(): ConfigJson {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { port: 3000 };
  }
}

function writeConfig(cfg: ConfigJson) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");
}

// GET /api/settings/networking
export async function GET() {
  try {
    const cfg = readConfig();
    const isDocker = process.env.KUBBY_DOCKER === "1";

    // Runtime values reflect what the server is actually using right now
    const runtimeHostname = process.env.HOSTNAME || "127.0.0.1";
    const runtimePort = parseInt(process.env.PORT || "3000", 10);

    return NextResponse.json({
      port: cfg.port || 3000,
      allowRemoteAccess: cfg.allowRemoteAccess ?? false,
      runtime: {
        hostname: runtimeHostname,
        port: runtimePort,
      },
      isDocker,
    });
  } catch (error) {
    console.error("Get networking settings error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/settings/networking
export async function PUT(request: NextRequest) {
  try {
    const isDocker = process.env.KUBBY_DOCKER === "1";
    if (isDocker) {
      return NextResponse.json(
        { error: "Networking settings cannot be changed in Docker mode. Use environment variables instead." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { port, allowRemoteAccess } = body;

    // Validate port
    if (port !== undefined) {
      if (typeof port !== "number" || !Number.isInteger(port) || port < 1024 || port > 65535) {
        return NextResponse.json(
          { error: "Port must be an integer between 1024 and 65535" },
          { status: 400 }
        );
      }
    }

    // Validate allowRemoteAccess
    if (allowRemoteAccess !== undefined && typeof allowRemoteAccess !== "boolean") {
      return NextResponse.json(
        { error: "allowRemoteAccess must be a boolean" },
        { status: 400 }
      );
    }

    const cfg = readConfig();

    if (port !== undefined) {
      cfg.port = port;
    }
    if (allowRemoteAccess !== undefined) {
      cfg.allowRemoteAccess = allowRemoteAccess;
    }

    writeConfig(cfg);

    return NextResponse.json({ restartRequired: true });
  } catch (error) {
    console.error("Update networking settings error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
