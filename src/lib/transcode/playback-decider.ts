export type PlaybackMode = "direct" | "remux" | "transcode";
export type StreamAction = "copy" | "transcode" | "none";

export interface PlaybackDecision {
  mode: PlaybackMode;
  videoAction: StreamAction;
  audioAction: StreamAction;
}

interface DecideInput {
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
}

// Codecs that browsers can play natively
const BROWSER_VIDEO_CODECS = new Set(["h264", "hevc", "h265", "vp8", "vp9", "av1"]);
const BROWSER_AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis", "flac"]);

// Containers browsers handle natively with matching codecs
const DIRECT_PLAY_CONTAINERS: Record<string, { video: Set<string>; audio: Set<string> }> = {
  mp4: { video: new Set(["h264", "hevc", "h265", "av1"]), audio: new Set(["aac", "mp3", "flac"]) },
  m4v: { video: new Set(["h264"]), audio: new Set(["aac"]) },
  webm: { video: new Set(["vp8", "vp9", "av1"]), audio: new Set(["opus", "vorbis"]) },
};

export function decidePlayback({ container, videoCodec, audioCodec }: DecideInput): PlaybackDecision {
  const c = container?.toLowerCase() ?? "";
  const vc = videoCodec?.toLowerCase() ?? "";
  const ac = audioCodec?.toLowerCase() ?? "";

  // Check direct play
  const directContainer = DIRECT_PLAY_CONTAINERS[c];
  if (directContainer) {
    const videoOk = !vc || directContainer.video.has(vc);
    const audioOk = !ac || directContainer.audio.has(ac);
    if (videoOk && audioOk) {
      return { mode: "direct", videoAction: "copy", audioAction: ac ? "copy" : "none" };
    }
  }

  // Video codec is browser-compatible → remux (copy streams, change container to HLS)
  if (vc && BROWSER_VIDEO_CODECS.has(vc)) {
    const audioNeedsTranscode = ac && !BROWSER_AUDIO_CODECS.has(ac);
    return {
      mode: "remux",
      videoAction: "copy",
      audioAction: !ac ? "none" : audioNeedsTranscode ? "transcode" : "copy",
    };
  }

  // Video codec is not browser-compatible → full transcode
  return {
    mode: "transcode",
    videoAction: "transcode",
    audioAction: !ac ? "none" : "transcode",
  };
}
