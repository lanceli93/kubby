import { execFile } from "child_process";
import path from "path";

export interface ProbeResult {
  videoCodec: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  audioCodec: string | null;
  audioChannels: number | null;
  durationSeconds: number | null;
  container: string;
}

export function probeVideo(filePath: string): Promise<ProbeResult | null> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      [
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        filePath,
      ],
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          // ffprobe not available or failed — gracefully return null
          console.warn(`ffprobe failed for ${filePath}:`, error.message);
          resolve(null);
          return;
        }

        try {
          const data = JSON.parse(stdout);
          const streams: Array<Record<string, unknown>> = data.streams || [];

          const videoStream = streams.find((s) => s.codec_type === "video");
          const audioStream = streams.find((s) => s.codec_type === "audio");

          const ext = path.extname(filePath).toLowerCase().replace(".", "");

          const format = data.format || {};
          const duration = format.duration ? parseFloat(format.duration) : null;

          resolve({
            videoCodec: videoStream?.codec_name ? String(videoStream.codec_name) : null,
            videoWidth: videoStream?.width ? Number(videoStream.width) : null,
            videoHeight: videoStream?.height ? Number(videoStream.height) : null,
            audioCodec: audioStream?.codec_name ? String(audioStream.codec_name) : null,
            audioChannels: audioStream?.channels ? Number(audioStream.channels) : null,
            durationSeconds: duration && !isNaN(duration) ? Math.round(duration) : null,
            container: ext,
          });
        } catch {
          console.warn(`Failed to parse ffprobe output for ${filePath}`);
          resolve(null);
        }
      }
    );
  });
}
