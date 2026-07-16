import { createAudioPlayer } from "expo-audio";

// Reuse the alarm sound assets. "alert" for alert messages, "chime" for loud notes.
const SOUNDS = {
  alert: require("../../assets/sounds/alert.mp3"),
  chime: require("../../assets/sounds/chime.mp3"),
};

/** Play a hub sound for an incoming alert / loud message. Best-effort. */
export function playHubSound(kind: "alert" | "loud"): void {
  try {
    const player = createAudioPlayer(kind === "alert" ? SOUNDS.alert : SOUNDS.chime);
    player.play();
  } catch (err) {
    console.log("[HubSound] play failed:", err);
  }
}
