// Deterministische Waveform: gesät mit der Album-ID, moduliert mit den
// Trackdauern — dieselbe Platte sieht immer gleich aus.
import type { Album } from "./types";

export function seededRandom(seed: string) {
  let h = 2166136261;
  for (const c of seed) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    return ((h >>> 16) & 0xffff) / 0xffff;
  };
}

/** Balkenhöhen 0–1. */
export function buildWaveform(album: Album, bars = 28): number[] {
  const rnd = seededRandom(album.id);
  const durations = album.tracks.map((t) => t.durationMs);
  const maxDur = Math.max(...durations, 1);

  return Array.from({ length: bars }, (_, i) => {
    const envelope = Math.sin((i / (bars - 1)) * Math.PI); // Mitte höher
    const track = durations.length
      ? durations[Math.floor((i / bars) * durations.length)] / maxDur
      : 1;
    const v = 0.22 + envelope * 0.5 * (0.45 + 0.3 * track + 0.25 * rnd());
    return Math.min(1, Math.max(0.12, v));
  });
}
