// Decides how a music track should be delivered to the browser's <audio> element.
//
// "direct"    → serve the original file bytes (with HTTP 206 Range support so
//               seeking works). Only for codecs/containers browsers can decode.
// "transcode" → pipe the file through ffmpeg to mp3 on the fly, because no
//               mainstream browser can play the source format natively.

export type AudioMode = "direct" | "transcode";

// File extensions modern browsers can play natively via <audio>.
// mp3, aac (m4a/mp4 container), flac, ogg/vorbis, opus, wav/pcm.
const NATIVE_EXTS = new Set([
  ".mp3",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".wav",
]);

// Codecs known to be browser-native. Used only as a secondary signal when the
// extension is ambiguous or missing (e.g. an .m4a that actually holds AAC/ALAC).
// Kept intentionally small — ext is the primary, more reliable signal.
const NATIVE_CODECS = new Set([
  "mp3",
  "mpeg",
  "aac",
  "mp4a",
  "flac",
  "vorbis",
  "opus",
  "pcm",
  "wav",
]);

/**
 * Decide whether a track can be streamed directly or must be transcoded.
 *
 * Extension is the primary signal (lowercased, includes the dot — e.g. ".mp3").
 * Codec is a secondary hint used only when the extension is unknown/missing.
 * Anything not recognised as native → "transcode" (safe fallback), which covers
 * wma, aiff/aif, alac, ape, dsf/dff, and any unknown format.
 */
export function decideAudioPlayback(input: { codec: string | null; ext: string | null }): AudioMode {
  const ext = input.ext?.toLowerCase() ?? null;

  // Primary: trust a recognised extension.
  if (ext && NATIVE_EXTS.has(ext)) {
    return "direct";
  }

  // Secondary: if the extension is unknown/absent, fall back to the codec hint.
  if (!ext || !NATIVE_EXTS.has(ext)) {
    const codec = input.codec?.toLowerCase().trim() ?? null;
    if (codec) {
      // ALAC lives in an .m4a container but is NOT browser-native — never treat
      // it as direct even if a codec string sneaks through.
      if (codec.includes("alac")) {
        return "transcode";
      }
      for (const nativeCodec of NATIVE_CODECS) {
        if (codec.includes(nativeCodec)) {
          return "direct";
        }
      }
    }
  }

  // Everything else (wma, aiff/aif, ape, dsf/dff, unknown) → transcode.
  return "transcode";
}
