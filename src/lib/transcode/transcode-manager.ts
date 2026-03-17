import { spawn, execFileSync, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getFfmpegPath, getTranscodeCacheDir } from "@/lib/paths";
import { buildFfmpegArgs } from "./ffmpeg-command";
import type { PlaybackDecision } from "./playback-decider";
import { detectBestEncoder, getLibx264Config, type EncoderConfig } from "./hw-accel";

export interface TranscodeSession {
  id: string;
  movieId: string;
  discNumber: number;
  filePath: string;
  decision: PlaybackDecision;
  outputDir: string;
  process: ChildProcess | null;
  startedAt: number;
  lastAccessedAt: number;
  seekToSeconds: number;
  maxWidth: number;
  sourceVideoCodec: string | null;
  sourceVideoWidth: number | null;
  retriedWithSoftware?: boolean;
  playlistLogged?: boolean;
}

const IDLE_TIMEOUT_MS = 90 * 1000; // 90 seconds (heartbeat keeps active sessions alive)
const CLEANUP_INTERVAL_MS = 15 * 1000; // 15 seconds

class TranscodeManager {
  private sessions = new Map<string, TranscodeSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private ffmpegAvailable: boolean | null = null;
  private encoderConfig: EncoderConfig | null = null;

  constructor() {
    this.startCleanupInterval();
    this.registerShutdownHandlers();
  }

  checkFfmpegAvailable(): boolean {
    if (this.ffmpegAvailable !== null) return this.ffmpegAvailable;
    try {
      execFileSync(getFfmpegPath(), ["-version"], { timeout: 5000, stdio: "ignore" });
      this.ffmpegAvailable = true;
    } catch {
      this.ffmpegAvailable = false;
    }
    return this.ffmpegAvailable;
  }

  getEncoderConfig(): EncoderConfig {
    if (this.encoderConfig) return this.encoderConfig;
    this.encoderConfig = detectBestEncoder(getFfmpegPath());
    console.log(`[transcode] Using encoder: ${this.encoderConfig.name}${this.encoderConfig.isHardware ? " (hardware)" : " (software)"}`);
    return this.encoderConfig;
  }

  startSession(
    movieId: string,
    discNumber: number,
    filePath: string,
    decision: PlaybackDecision,
    seekToSeconds = 0,
    maxWidth = 0,
    sourceVideoCodec: string | null = null,
    sourceVideoWidth: number | null = null,
  ): string {
    const id = uuidv4();
    const outputDir = path.join(getTranscodeCacheDir(), id);
    fs.mkdirSync(outputDir, { recursive: true });

    const encoderConfig = this.getEncoderConfig();
    const isHevcCopy = decision.videoAction === "copy" && !!sourceVideoCodec && /^(hevc|h265)$/i.test(sourceVideoCodec);
    const args = buildFfmpegArgs({ inputPath: filePath, outputDir, decision, seekToSeconds, encoderConfig, maxWidth, sourceVideoCodec, sourceVideoWidth, forceHevcFmp4: isHevcCopy });
    const ffmpegProcess = spawn(getFfmpegPath(), args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    ffmpegProcess.stderr?.on("data", (data: Buffer) => {
      // Log FFmpeg progress sparingly
      const line = data.toString().trim();
      if (line.includes("time=") || line.includes("Error")) {
        console.log(`[transcode:${id.slice(0, 8)}] ${line.slice(0, 200)}`);
      }
    });

    ffmpegProcess.on("exit", (code) => {
      console.log(`[transcode:${id.slice(0, 8)}] FFmpeg exited with code ${code}`);
      const session = this.sessions.get(id);
      if (!session) return;

      // Runtime fallback: if hardware encoder failed, retry with libx264
      // Skip fallback for remux (stream copy) — no encoder involved
      const isStreamCopy = decision.videoAction === "copy";
      if (code !== 0 && encoderConfig.isHardware && !isStreamCopy && !session.retriedWithSoftware) {
        console.log(`[transcode] Hardware encoder failed, falling back to software`);
        session.retriedWithSoftware = true;

        // Clean up failed output
        this.cleanOutputDir(outputDir);
        fs.mkdirSync(outputDir, { recursive: true });

        const fallbackConfig = getLibx264Config();
        const fallbackArgs = buildFfmpegArgs({ inputPath: filePath, outputDir, decision, seekToSeconds, encoderConfig: fallbackConfig, maxWidth, sourceVideoCodec, sourceVideoWidth, forceHevcFmp4: isHevcCopy });
        const fallbackProcess = spawn(getFfmpegPath(), fallbackArgs, {
          stdio: ["ignore", "ignore", "pipe"],
        });

        fallbackProcess.stderr?.on("data", (data: Buffer) => {
          const line = data.toString().trim();
          if (line.includes("time=") || line.includes("Error")) {
            console.log(`[transcode:${id.slice(0, 8)}] ${line.slice(0, 200)}`);
          }
        });

        fallbackProcess.on("exit", (fallbackCode) => {
          console.log(`[transcode:${id.slice(0, 8)}] FFmpeg (fallback) exited with code ${fallbackCode}`);
          session.process = null;
        });

        session.process = fallbackProcess;
        return;
      }

      session.process = null;
    });

    const session: TranscodeSession = {
      id,
      movieId,
      discNumber,
      filePath,
      decision,
      outputDir,
      process: ffmpegProcess,
      startedAt: Date.now(),
      lastAccessedAt: Date.now(),
      seekToSeconds,
      maxWidth,
      sourceVideoCodec,
      sourceVideoWidth,
    };

    this.sessions.set(id, session);
    return id;
  }

  getSession(sessionId: string): TranscodeSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessedAt = Date.now();
    }
    return session;
  }

  async waitForPlaylist(sessionId: string, timeoutMs = 15000): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const playlistPath = path.join(session.outputDir, "playlist.m3u8");
    const firstSegTs = path.join(session.outputDir, "segment_0000.ts");
    const firstSegM4s = path.join(session.outputDir, "segment_0000.m4s");
    const deadline = Date.now() + timeoutMs;

    // Wait for both the playlist AND the first segment to exist.
    // The playlist can appear before any segments are written, which causes
    // hls.js to 404 on segment_0000 and trigger a fatal network error.
    // Supports both .ts (MPEG-TS) and .m4s (fMP4 for HEVC) segments.
    while (Date.now() < deadline) {
      if (fs.existsSync(playlistPath) && (fs.existsSync(firstSegTs) || fs.existsSync(firstSegM4s))) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }

  async seekSession(sessionId: string, seekToSeconds: number): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Kill existing process and wait for it to fully exit before spawning a new one
    // This prevents duplicate FFmpeg processes competing for GPU resources
    await this.killProcess(session);
    this.cleanOutputDir(session.outputDir);
    this.sessions.delete(sessionId);

    // Start new session from the seek point
    return this.startSession(
      session.movieId,
      session.discNumber,
      session.filePath,
      session.decision,
      seekToSeconds,
      session.maxWidth,
      session.sourceVideoCodec,
      session.sourceVideoWidth,
    );
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    await this.killProcess(session);
    this.cleanOutputDir(session.outputDir);
    this.sessions.delete(sessionId);
  }

  shutdownAll(): void {
    for (const [, session] of this.sessions) {
      // Fire-and-forget: best-effort kill during shutdown
      if (session.process && !session.process.killed) {
        try { session.process.kill(process.platform === "win32" ? undefined : "SIGKILL"); } catch { /* */ }
        session.process = null;
      }
      this.cleanOutputDir(session.outputDir);
    }
    this.sessions.clear();

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clean up the entire cache dir
    const cacheDir = getTranscodeCacheDir();
    try {
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
    } catch {
      // Best effort
    }
  }

  private killProcess(session: TranscodeSession): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!session.process || session.process.killed) {
        session.process = null;
        resolve();
        return;
      }

      const proc = session.process;
      session.process = null;

      // Resolve once the process actually exits
      const onExit = () => {
        clearTimeout(killTimer);
        clearTimeout(giveUpTimer);
        resolve();
      };
      proc.once("exit", onExit);

      try {
        if (process.platform === "win32") {
          // Windows: SIGTERM is unreliable, use TerminateProcess directly
          proc.kill();
        } else {
          proc.kill("SIGTERM");
        }
      } catch {
        proc.removeListener("exit", onExit);
        resolve();
        return;
      }

      // Unix: SIGKILL fallback if SIGTERM doesn't work within 2s
      const killTimer = setTimeout(() => {
        try {
          if (!proc.killed) proc.kill("SIGKILL");
        } catch {
          // Already dead
        }
      }, 2000);
      killTimer.unref?.();

      // Safety net: resolve after 3s even if exit event never fires
      const giveUpTimer = setTimeout(() => {
        proc.removeListener("exit", onExit);
        resolve();
      }, 3000);
      giveUpTimer.unref?.();
    });
  }

  private cleanOutputDir(outputDir: string): void {
    try {
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
    } catch {
      // Best effort
    }
  }

  private startCleanupInterval(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        if (now - session.lastAccessedAt > IDLE_TIMEOUT_MS) {
          console.log(`[transcode] Cleaning up idle session ${id.slice(0, 8)}`);
          void this.stopSession(id);
        }
      }
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private registerShutdownHandlers(): void {
    const handler = () => {
      this.shutdownAll();
    };

    process.on("SIGTERM", handler);
    process.on("SIGINT", handler);
    process.on("exit", handler);
  }
}

// Singleton via globalThis (survives Next.js dev hot reload).
// Version key ensures stale singletons from prior code are replaced.
const GLOBAL_KEY = "__kubby_transcode_manager__";
const GLOBAL_VERSION_KEY = "__kubby_transcode_manager_v__";
const MANAGER_VERSION = 3; // bump when class shape changes

export function getTranscodeManager(): TranscodeManager {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY] || g[GLOBAL_VERSION_KEY] !== MANAGER_VERSION) {
    // Shut down stale instance if it exists
    const old = g[GLOBAL_KEY] as TranscodeManager | undefined;
    if (old && typeof old.shutdownAll === "function") {
      old.shutdownAll();
    }
    g[GLOBAL_KEY] = new TranscodeManager();
    g[GLOBAL_VERSION_KEY] = MANAGER_VERSION;
  }
  return g[GLOBAL_KEY] as TranscodeManager;
}
