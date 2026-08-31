import type { StyleId, StyleTokens } from "./types";

export const STYLES: Record<StyleId, StyleTokens> = {
  classic: {
    background: "#FAF9F6",
    text: "#111111",
    textMuted: "#666666",
    rule: "#111111",
    accent: "#111111",
    coverTreatment: "border",
    paletteMode: "cover",
    defaultFontPair: "modern",
    paddingBase: 0.07,
  },
  sand: {
    background: "#E8DFD3",
    text: "#3A322A",
    textMuted: "#7A6E5E",
    rule: "#3A322A",
    accent: "#3A322A",
    coverTreatment: "matte",
    paletteMode: "cover",
    defaultFontPair: "serif",
    paddingBase: 0.075,
  },
  onyx: {
    background: "#141414",
    text: "#F2F0EC",
    textMuted: "#8C8C8C",
    rule: "#3A3A3A",
    accent: "#F2F0EC",
    coverTreatment: "none",
    paletteMode: "cover",
    defaultFontPair: "modern",
    paddingBase: 0.07,
  },
  mono: {
    background: "#FFFFFF",
    text: "#000000",
    textMuted: "#555555",
    rule: "#000000",
    accent: "#000000",
    coverTreatment: "grayscale",
    paletteMode: "grayscale",
    defaultFontPair: "mono",
    paddingBase: 0.07,
  },
  gallery: {
    background: "#FFFFFF",
    text: "#1A1A1A",
    textMuted: "#8A8A8A",
    rule: "#DDDDDD",
    accent: "#1A1A1A",
    coverTreatment: "shadow",
    paletteMode: "dots",
    defaultFontPair: "modern",
    paddingBase: 0.11,
  },
  paper: {
    background: "#F5F0E6",
    text: "#1C1A17",
    textMuted: "#6E6659",
    rule: "#1C1A17",
    accent: "#1C1A17",
    coverTreatment: "matte",
    paletteMode: "cover",
    defaultFontPair: "serif",
    paddingBase: 0.08,
  },
  noir: {
    background: "#000000",
    text: "#FFFFFF",
    textMuted: "#777777",
    rule: "#333333",
    accent: "#FFFFFF",
    coverTreatment: "none",
    paletteMode: "duo",
    defaultFontPair: "condensed",
    paddingBase: 0.07,
  },
  bloom: {
    background: "#202020", // wird zur Laufzeit durch Verlauf aus der Palette ersetzt
    text: "#FFFFFF",
    textMuted: "#DDDDDD",
    rule: "#FFFFFF",
    accent: "#FFFFFF",
    coverTreatment: "shadow",
    paletteMode: "cover",
    defaultFontPair: "modern",
    paddingBase: 0.08,
  },
};

export const STYLE_LABELS: Record<StyleId, string> = {
  classic: "Classic",
  sand: "Sand",
  onyx: "Onyx",
  mono: "Mono",
  gallery: "Gallery",
  paper: "Paper",
  noir: "Noir",
  bloom: "Bloom",
};

/** Relative Luminanz einer Hex-Farbe (0–1). */
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Schwarz oder Weiß, je nachdem was auf `bg` lesbar ist. */
export function contrastText(bg: string): string {
  return luminance(bg) > 0.5 ? "#111111" : "#FFFFFF";
}
