import { execFileSync } from "child_process";
import { getFfmpegPath } from "@/lib/paths";

export interface EncoderConfig {
  name: string;
  hwaccel?: string;
  qualityArgs: string[];
  isHardware: boolean;
}

// Codecs that NVDEC can hardware-decode efficiently
const NVDEC_SUPPORTED_CODECS = new Set([
  "h264", "hevc", "h265", "vp8", "vp9", "av1",
  "mpeg1video", "mpeg2video",
]);

/** Check if NVDEC can hardware-decode this codec (mpeg4/divx/wmv etc. → false) */
export function isNvdecSupported(videoCodec: string | null | undefined): boolean {
  if (!videoCodec) return false;
  return NVDEC_SUPPORTED_CODECS.has(videoCodec.toLowerCase());
}

/** Resolution-based bitrate tiers */
export function getResolutionBitrate(outputWidth: number): { maxrate: string; bufsize: string } {
  if (outputWidth <= 854)  return { maxrate: "2M",  bufsize: "4M"  };  // 480p
  if (outputWidth <= 1280) return { maxrate: "4M",  bufsize: "8M"  };  // 720p
  if (outputWidth <= 1920) return { maxrate: "6M",  bufsize: "12M" };  // 1080p
  if (outputWidth <= 3840) return { maxrate: "12M", bufsize: "24M" };  // 4K
  if (outputWidth <= 5120) return { maxrate: "16M", bufsize: "32M" };  // 5K
  if (outputWidth <= 6144) return { maxrate: "20M", bufsize: "40M" };  // 6K
  return                          { maxrate: "25M", bufsize: "50M" };  // 7-8K+
}

const LIBX264_CONFIG: EncoderConfig = {
  name: "libx264",
  qualityArgs: ["-preset", "ultrafast", "-crf", "23"],
  isHardware: false,
};

const VIDEOTOOLBOX_CONFIG: EncoderConfig = {
  name: "h264_videotoolbox",
  qualityArgs: ["-q:v", "65"],
  isHardware: true,
};

const NVENC_CONFIG: EncoderConfig = {
  name: "h264_nvenc",
  hwaccel: "cuda",
  qualityArgs: ["-preset", "p4", "-cq", "23"],
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
