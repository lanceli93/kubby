import type { PlaybackDecision } from "./playback-decider";
import type { EncoderConfig } from "./hw-accel";

interface BuildArgs {
  inputPath: string;
  outputDir: string;
  decision: PlaybackDecision;
  seekToSeconds?: number;
  encoderConfig?: EncoderConfig;
  maxWidth?: number;
}

export function buildFfmpegArgs({ inputPath, outputDir, decision, seekToSeconds, encoderConfig, maxWidth }: BuildArgs): string[] {
  const args: string[] = [];

  // Fast input seeking (before -i)
  if (seekToSeconds && seekToSeconds > 0) {
    args.push("-ss", String(seekToSeconds));
  }

  // Hardware acceleration input flag (before -i)
  if (decision.videoAction !== "copy" && encoderConfig?.hwaccel) {
    args.push("-hwaccel", encoderConfig.hwaccel);
  }

  args.push("-i", inputPath);

  // Video codec
  if (decision.videoAction === "copy") {
    args.push("-c:v", "copy");
  } else {
    const enc = encoderConfig;
    if (!enc || enc.name === "libx264") {
      args.push("-threads", "0");
    }
    if (maxWidth && maxWidth > 0) {
      args.push("-vf", `scale='min(${maxWidth},iw)':-2`);
    }
    args.push("-c:v", enc?.name ?? "libx264", ...( enc?.qualityArgs ?? ["-preset", "ultrafast", "-crf", "23", "-maxrate", "4M", "-bufsize", "8M"]));
  }

  // Audio codec
  if (decision.audioAction === "none") {
    args.push("-an");
  } else if (decision.audioAction === "copy") {
    args.push("-c:a", "copy");
  } else {
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  // HLS output
  args.push(
    "-f", "hls",
    "-hls_time", "6",
    "-hls_list_size", "0",
    "-hls_segment_filename", `${outputDir}/segment_%04d.ts`,
    `${outputDir}/playlist.m3u8`,
  );

  return args;
}
