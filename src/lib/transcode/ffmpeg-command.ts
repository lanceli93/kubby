import type { PlaybackDecision } from "./playback-decider";

interface BuildArgs {
  inputPath: string;
  outputDir: string;
  decision: PlaybackDecision;
  seekToSeconds?: number;
}

export function buildFfmpegArgs({ inputPath, outputDir, decision, seekToSeconds }: BuildArgs): string[] {
  const args: string[] = [];

  // Fast input seeking (before -i)
  if (seekToSeconds && seekToSeconds > 0) {
    args.push("-ss", String(seekToSeconds));
  }

  args.push("-i", inputPath);

  // Video codec
  if (decision.videoAction === "copy") {
    args.push("-c:v", "copy");
  } else {
    // Scale down to max 1080p for real-time transcoding performance
    args.push("-vf", "scale='min(1920,iw)':-2");
    args.push(
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-maxrate", "4M",
      "-bufsize", "8M",
    );
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
