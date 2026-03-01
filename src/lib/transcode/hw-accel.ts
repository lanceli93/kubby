import { execFileSync } from "child_process";
import { getFfmpegPath } from "@/lib/paths";

export interface EncoderConfig {
  name: string;
  hwaccel?: string;
  qualityArgs: string[];
  isHardware: boolean;
}

const LIBX264_CONFIG: EncoderConfig = {
  name: "libx264",
  qualityArgs: ["-preset", "ultrafast", "-crf", "23", "-maxrate", "4M", "-bufsize", "8M"],
  isHardware: false,
};

const VIDEOTOOLBOX_CONFIG: EncoderConfig = {
  name: "h264_videotoolbox",
  qualityArgs: ["-q:v", "65", "-maxrate", "4M", "-bufsize", "8M"],
  isHardware: true,
};

const NVENC_CONFIG: EncoderConfig = {
  name: "h264_nvenc",
  hwaccel: "cuda",
  qualityArgs: ["-preset", "p4", "-cq", "23", "-maxrate", "4M", "-bufsize", "8M"],
  isHardware: true,
};

export function getLibx264Config(): EncoderConfig {
  return LIBX264_CONFIG;
}

export function detectBestEncoder(ffmpegPath?: string): EncoderConfig {
  const ffmpeg = ffmpegPath ?? getFfmpegPath();

  try {
    const encoderOutput = execFileSync(ffmpeg, ["-encoders"], {
      timeout: 5000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const hasVideoToolbox = encoderOutput.includes("h264_videotoolbox");
    const hasNvenc = encoderOutput.includes("h264_nvenc");

    if (hasVideoToolbox) {
      return VIDEOTOOLBOX_CONFIG;
    }

    if (hasNvenc) {
      // Verify CUDA hwaccel is available
      try {
        const hwaccelOutput = execFileSync(ffmpeg, ["-hwaccels"], {
          timeout: 5000,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        if (hwaccelOutput.includes("cuda")) {
          return NVENC_CONFIG;
        }
      } catch {
        // cuda check failed, fall through to libx264
      }
    }
  } catch {
    // Detection failed entirely
  }

  return LIBX264_CONFIG;
}
