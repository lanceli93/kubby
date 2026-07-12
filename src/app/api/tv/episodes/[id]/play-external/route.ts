import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { existsSync } from "fs";
import os from "os";
import { db } from "@/lib/db";
import { tvEpisodes, userPreferences, userEpisodeData } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: episodeId } = await params;
    const body = await request.json().catch(() => ({}));
    const overrideStartSeconds = body.startSeconds as number | undefined;

    // Get user's external player config
    const prefs = db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, session.user.id))
      .get();

    if (!prefs?.externalPlayerEnabled || !prefs.externalPlayerName) {
      return NextResponse.json(
        { error: "External player not configured" },
        { status: 400 }
      );
    }

    // Get episode file path
    const episode = db
      .select({ filePath: tvEpisodes.filePath })
      .from(tvEpisodes)
      .where(eq(tvEpisodes.id, episodeId))
      .get();
    const filePath = episode?.filePath ?? null;

    if (!filePath) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    // Validate file exists on disk
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: "Media file not found on disk" },
        { status: 404 }
      );
    }

    // Get playback position
    const userData = db
      .select()
      .from(userEpisodeData)
      .where(
        and(
          eq(userEpisodeData.userId, session.user.id),
          eq(userEpisodeData.episodeId, episodeId)
        )
      )
      .get();

    const startSeconds = overrideStartSeconds ?? userData?.playbackPositionSeconds ?? 0;
    const playerName = prefs.externalPlayerName;
    const playerPath = prefs.externalPlayerPath;
    const platform = os.platform();

    // Build and execute launch command
    try {
      if (platform === "darwin") {
        launchMac(playerName, playerPath, filePath, startSeconds);
      } else if (platform === "win32") {
        launchWindows(playerName, playerPath, filePath, startSeconds);
      } else {
        return NextResponse.json(
          { error: "Unsupported platform" },
          { status: 400 }
        );
      }
    } catch (launchError) {
      console.error("Failed to launch external player:", launchError);
      return NextResponse.json(
        { error: "Failed to launch external player" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      startPosition: startSeconds,
      player: playerName,
      cmd: lastLaunchCmd,
    });
  } catch (error) {
    console.error("Play external error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** Track last launched command for debug response */
let lastLaunchCmd = "";

function launchPlayer(exe: string, args: string[]) {
  lastLaunchCmd = `"${exe}" ${args.map((a) => `"${a}"`).join(" ")}`;
  console.log("[play-external] exec:", lastLaunchCmd);
  execFile(exe, args, (error) => {
    if (error) console.error("[play-external] launch error:", error.message);
  });
}

function launchMac(
  playerName: string,
  playerPath: string | null,
  filePath: string,
  startSeconds: number
) {
  if (playerName === "IINA") {
    // IINA: use iina-cli which works whether IINA is already running or not
    const appPath = playerPath || "/Applications/IINA.app";
    const cli = appPath.replace(/\/?$/, "/Contents/MacOS/iina-cli");
    const args: string[] = [];
    if (startSeconds > 0) args.push(`--mpv-start=+${startSeconds}`);
    args.push(filePath);
    launchPlayer(cli, args);
  } else {
    // Generic macOS player: use "open -a" to launch the app with the file
    const exe = playerPath || playerName;
    execFile("open", ["-a", exe, filePath], (error) => {
      if (error) console.error("[play-external] launch error:", error.message);
    });
  }
}

function launchWindows(
  playerName: string,
  playerPath: string | null,
  filePath: string,
  startSeconds: number
) {
  if (playerName === "PotPlayer") {
    const exe = playerPath || "C:\\Program Files\\PotPlayer\\PotPlayerMini64.exe";
    const args: string[] = [];
    if (startSeconds > 0) args.push(`/seek=${Math.round(startSeconds)}`);
    args.push(filePath);
    launchPlayer(exe, args);
  } else if (playerName === "VLC") {
    const exe = playerPath || "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe";
    const args: string[] = [];
    if (startSeconds > 0) args.push(`--start-time=${startSeconds}`);
    args.push(filePath);
    launchPlayer(exe, args);
  } else {
    // Generic Windows player: just pass the file path
    const exe = playerPath || playerName;
    const args: string[] = [filePath];
    launchPlayer(exe, args);
  }
}
