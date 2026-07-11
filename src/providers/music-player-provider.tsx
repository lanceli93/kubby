"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/** A track as handed to the player. Kept minimal so any list can build one. */
export interface PlayerTrack {
  id: string;
  title: string;
  artistName?: string;
  albumId?: string | null;
  albumTitle?: string | null;
  coverPath?: string | null;
  coverBlur?: string | null;
  durationSeconds?: number | null;
}

export type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  queue: PlayerTrack[];
  index: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

// ─── External store (survives re-renders + route changes, shared everywhere) ───
// Mirrors scan-provider.tsx: a module-level state object, a listeners set, and
// emitChange() that swaps in a NEW reference so React's useSyncExternalStore
// detects the change. Playback lives here (above any page) so navigation never
// tears down the audio element.
let state: PlayerState = {
  queue: [],
  index: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  shuffle: false,
  repeat: "off",
};

const listeners = new Set<() => void>();

function getSnapshot(): PlayerState {
  return state;
}

function emitChange() {
  listeners.forEach((l) => l());
}

function setState(update: Partial<PlayerState>) {
  state = { ...state, ...update };
  emitChange();
}

// Module-level handle to the ONE persistent <audio>, set by the provider on
// mount. Actions drive it imperatively.
let audioEl: HTMLAudioElement | null = null;

// Web Audio graph for the frequency-spectrum visualiser. Built lazily and ONCE
// (createMediaElementSource is one-shot per element and reroutes its output),
// then kept forever — the <audio> is a persistent singleton, so we must NEVER
// disconnect this graph or all playback would be silenced.
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
// In-flight (or resolved) build promise. Memoised so concurrent callers — e.g.
// the desktop overlay mounts a mobile + desktop <AudioSpectrum> at once, both
// firing ensureAnalyser() — share ONE build. Without this they'd race past the
// `analyser` null-guard across the `await resume()` yield and both call the
// one-shot createMediaElementSource; the loser throws and its catch would null
// out the winner's valid node. Nulled again only if the build fails, so a later
// (successfully-gestured) call can retry.
let analyserBuild: Promise<AnalyserNode | null> | null = null;

// Guards a single play-count increment per track-start (so seeking/pausing
// while the same track plays never re-counts).
let countedTrackId: string | null = null;

/**
 * Lazily build (once) and return an AnalyserNode tapping the persistent
 * <audio>, for the spectrum visualiser. Safe sequencing is load-bearing —
 * audio must NEVER be silenced:
 *
 * - The idempotent `analyser` guard makes React StrictMode double-mount safe:
 *   the second call reuses the node and never calls createMediaElementSource
 *   twice (which throws + would leave the element rerouted).
 * - createMediaElementSource reroutes the element's output through the graph,
 *   so we only reach it once the context is actually `running` (else audio
 *   would play silently). Callers invoke this inside a user-gesture window
 *   (the overlay opens on a click), so `resume()` succeeds.
 * - On any failure we return null and leave no half-built graph, so audio keeps
 *   flowing through the element's default path.
 *
 * The stream is same-origin and the <audio> has no `crossOrigin`, so there is
 * no CORS taint — do NOT add `crossOrigin`, it would break the stream.
 */
export function ensureAnalyser(): Promise<AnalyserNode | null> {
  if (analyser) return Promise.resolve(analyser); // idempotent → StrictMode-safe
  // Coalesce concurrent callers onto one build (see analyserBuild comment).
  if (!analyserBuild) {
    analyserBuild = buildAnalyser().then((a) => {
      // On failure, clear the memo so a later user-gestured call can retry.
      if (!a) analyserBuild = null;
      return a;
    });
  }
  return analyserBuild;
}

async function buildAnalyser(): Promise<AnalyserNode | null> {
  if (!audioEl) return null;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch {
      return null;
    }
  }
  if (audioCtx.state !== "running") return null; // bail BEFORE rerouting
  try {
    mediaSource = audioCtx.createMediaElementSource(audioEl); // one-shot per element
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; // 128 bins
    analyser.smoothingTimeConstant = 0.8;
    mediaSource.connect(analyser);
    analyser.connect(audioCtx.destination); // re-route to speakers
  } catch {
    // If createMediaElementSource throws (already-created, etc.), don't leave a
    // half-built graph that could silence audio.
    analyser = null;
    mediaSource = null;
    return null;
  }
  return analyser;
}

function currentTrackOf(s: PlayerState): PlayerTrack | null {
  return s.index >= 0 && s.index < s.queue.length ? s.queue[s.index] : null;
}

function incrementPlayCount(trackId: string) {
  if (countedTrackId === trackId) return;
  countedTrackId = trackId;
  fetch(`/api/music/tracks/${trackId}/user-data`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ incrementPlay: true }),
  }).catch(() => {
    // best-effort — a failed count must never interrupt playback
  });
}

// Point the audio element at a track and start playing it. Resets the
// play-count guard so this track can be counted once when it starts.
function loadAndPlay(track: PlayerTrack) {
  if (!audioEl) return;
  countedTrackId = null;
  audioEl.src = `/api/music/tracks/${track.id}/stream`;
  audioEl.load();
  audioEl.play().catch(() => {
    // Autoplay/seek races can reject; state re-syncs from the play/pause events.
  });
}

// Compute the next index respecting shuffle/repeat. Returns -1 when playback
// should stop (repeat "off" past the end).
function computeNextIndex(s: PlayerState, wrapWhenOff: boolean): number {
  const n = s.queue.length;
  if (n === 0) return -1;
  if (s.repeat === "one") return s.index;
  if (s.shuffle) {
    if (n === 1) return 0;
    let r = s.index;
    while (r === s.index) r = Math.floor(Math.random() * n);
    return r;
  }
  if (s.index + 1 < n) return s.index + 1;
  // Past the end
  if (s.repeat === "all") return 0;
  return wrapWhenOff ? 0 : -1;
}

// ─── Actions (mutate store + drive the audio element) ───

function playTrack(track: PlayerTrack, queue?: PlayerTrack[]) {
  const q = queue && queue.length > 0 ? queue : [track];
  const idx = q.findIndex((t) => t.id === track.id);
  const index = idx >= 0 ? idx : 0;
  setState({ queue: q, index });
  loadAndPlay(q[index]);
}

function playAlbum(tracks: PlayerTrack[], startIndex = 0) {
  if (tracks.length === 0) return;
  const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
  setState({ queue: tracks, index });
  loadAndPlay(tracks[index]);
}

function toggle() {
  if (!audioEl) return;
  if (state.index < 0) return;
  if (audioEl.paused) {
    audioEl.play().catch(() => {});
  } else {
    audioEl.pause();
  }
}

// Stop playback entirely and clear the queue. `currentTrack` becomes null, so
// the NowPlayingBar unmounts itself — this is the "close the player" action.
function stop() {
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute("src");
    audioEl.load();
  }
  countedTrackId = null;
  setState({
    queue: [],
    index: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });
}

function playPauseTrack(track: PlayerTrack) {
  // Convenience: toggle if it's already the current track, else start it.
  if (currentTrackOf(state)?.id === track.id) {
    toggle();
  } else {
    playTrack(track);
  }
}

function next() {
  const idx = computeNextIndex(state, /* wrapWhenOff */ true);
  if (idx < 0) return;
  setState({ index: idx });
  loadAndPlay(state.queue[idx]);
}

function prev() {
  if (!audioEl) return;
  // Restart the current track if we're >3s in (standard music-player UX),
  // otherwise step to the previous track.
  if (audioEl.currentTime > 3 || state.index <= 0) {
    audioEl.currentTime = 0;
    return;
  }
  const idx = state.index - 1;
  setState({ index: idx });
  loadAndPlay(state.queue[idx]);
}

function seek(seconds: number) {
  if (!audioEl) return;
  const d = audioEl.duration;
  const clamped = Number.isFinite(d) ? Math.min(Math.max(seconds, 0), d) : Math.max(seconds, 0);
  audioEl.currentTime = clamped;
  setState({ currentTime: clamped });
}

function setVolume(v: number) {
  const clamped = Math.min(Math.max(v, 0), 1);
  if (audioEl) audioEl.volume = clamped;
  setState({ volume: clamped });
}

function toggleShuffle() {
  setState({ shuffle: !state.shuffle });
}

function cycleRepeat() {
  const order: RepeatMode[] = ["off", "all", "one"];
  const nextMode = order[(order.indexOf(state.repeat) + 1) % order.length];
  setState({ repeat: nextMode });
}

// Fired by the audio element's "ended" event: advance respecting repeat/shuffle.
function handleEnded() {
  const idx = computeNextIndex(state, /* wrapWhenOff */ false);
  if (idx < 0) {
    // Repeat "off" and we're at the end — stop.
    setState({ isPlaying: false });
    return;
  }
  if (idx === state.index && state.repeat === "one") {
    // Replay the same track from the top.
    if (audioEl) {
      countedTrackId = null;
      audioEl.currentTime = 0;
      audioEl.play().catch(() => {});
    }
    return;
  }
  setState({ index: idx });
  loadAndPlay(state.queue[idx]);
}

/**
 * MusicPlayerProvider — mounts the single persistent <audio> element and wires
 * its events to the module store. Must be mounted ONCE in the main layout,
 * unconditionally, so playback survives route navigation.
 */
export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    audioEl = el;
    el.volume = state.volume;

    const onTimeUpdate = () => setState({ currentTime: el.currentTime });
    const onDuration = () =>
      setState({ duration: Number.isFinite(el.duration) ? el.duration : 0 });
    const onPlay = () => {
      const cur = currentTrackOf(state);
      if (cur) incrementPlayCount(cur.id);
      setState({ isPlaying: true });
    };
    const onPause = () => setState({ isPlaying: false });
    const onEnded = () => handleEnded();

    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("loadedmetadata", onDuration);
    el.addEventListener("durationchange", onDuration);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onDuration);
      el.removeEventListener("durationchange", onDuration);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      audioEl = null;
    };
  }, []);

  return (
    <>
      {children}
      {/* The ONE source of truth — hidden, never unmounted. */}
      <audio ref={ref} preload="auto" hidden aria-hidden />
    </>
  );
}

interface MusicPlayerHook extends PlayerState {
  currentTrack: PlayerTrack | null;
  currentTrackId: string | null;
  playTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  playAlbum: (tracks: PlayerTrack[], startIndex?: number) => void;
  toggle: () => void;
  stop: () => void;
  playPauseTrack: (track: PlayerTrack) => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

/**
 * useMusicPlayer — read live playback state (via useSyncExternalStore) plus the
 * stable action functions. Actions are module-level singletons, so callers can
 * depend on their identity without memoization.
 */
export function useMusicPlayer(): MusicPlayerHook {
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot,
    getSnapshot
  );

  const currentTrack = currentTrackOf(snapshot);

  return {
    ...snapshot,
    currentTrack,
    currentTrackId: currentTrack?.id ?? null,
    playTrack,
    playAlbum,
    toggle,
    stop,
    playPauseTrack,
    next,
    prev,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
  };
}
