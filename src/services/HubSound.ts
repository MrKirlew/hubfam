import { createAudioPlayer, type AudioPlayer } from "expo-audio";

// Reuse the alarm sound assets. "alert" for alert messages, "chime" for loud notes.
const SOUNDS = {
  alert: require("../../assets/sounds/alert.mp3"),
  chime: require("../../assets/sounds/chime.mp3"),
};

// Safety cap so a runaway soundSeconds from a phone can't beep forever.
const MAX_SECONDS = 300;
// One-shot players are released after this long (covers the longest clip).
const ONESHOT_RELEASE_MS = 10_000;

let active: AudioPlayer | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

export interface HubSoundOpts {
  /** 0–1 playback volume; defaults to full volume. */
  volume?: number;
  /** Loop the sound for this many seconds; omitted/0 = play once. */
  seconds?: number;
}

/** Play a hub sound for an incoming alert / loud message. Best-effort. */
export function playHubSound(kind: "alert" | "loud", opts: HubSoundOpts = {}): void {
  try {
    stopHubSound(); // one sound at a time — a new message takes over
    const player = createAudioPlayer(kind === "alert" ? SOUNDS.alert : SOUNDS.chime);
    player.volume = Math.min(1, Math.max(0, opts.volume ?? 1));
    const seconds = Math.min(Math.max(0, opts.seconds ?? 0), MAX_SECONDS);
    player.loop = seconds > 0;
    player.play();
    active = player;
    stopTimer = setTimeout(stopHubSound, seconds > 0 ? seconds * 1000 : ONESHOT_RELEASE_MS);
  } catch (err) {
    console.log("[HubSound] play failed:", err);
  }
}

/** Stop + release the current sound (message dismissed, or its time is up). */
export function stopHubSound(): void {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (active) {
    try {
      active.pause();
      active.remove();
    } catch {
      /* already released */
    }
    active = null;
  }
}
