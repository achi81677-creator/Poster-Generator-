export type Track = {
  no: number;
  disc: number;
  title: string;
  durationMs: number;
  explicit: boolean;
};

export type Album = {
  id: string; // "spotify:<id>" | "deezer:<id>" | "demo:<id>"
  source: "spotify" | "deezer" | "demo";
  title: string;
  artist: string;
  releaseDate: string; // "2016-11-25" oder "2016"
  label?: string;
  coverUrl: string; // beste bekannte Quelle (nach iTunes-Upgrade)
  coverPx: number; // tatsächliche Pixelbreite des geladenen Covers
  spotifyUri?: string; // für den Scan-Code
  externalUrl?: string; // Album-Link (QR-Fallback)
  explicit: boolean;
  tracks: Track[];
  totalDurationMs: number;
  palette: string[]; // 5 Hex-Farben aus dem Cover
};

export type SearchResult = {
  id: string;
  title: string;
  artist: string;
  year?: string;
  thumb?: string;
  totalTracks?: number;
};

export type LayoutId = "classic" | "minimal" | "vinyl" | "gradient" | "square";

export type StyleId =
  | "classic"
  | "sand"
  | "onyx"
  | "mono"
  | "gallery"
  | "paper"
  | "noir"
  | "bloom";

export type FontPair = "modern" | "serif" | "condensed" | "mono";

export type FormatId =
  | "A5"
  | "A4"
  | "A3"
  | "A2"
  | "A1"
  | "letter"
  | "legal"
  | "5x7"
  | "8x10"
  | "11x14"
  | "12x18"
  | "square"
  | "50x70"
  | "custom";

export type PosterConfig = {
  albumId: string;

  layoutId: LayoutId;
  styleId: StyleId;
  fontPair: FontPair | "auto"; // auto = Default des Stils

  format: { id: FormatId; widthMm: number; heightMm: number };
  paddingScale: number; // 0.5–2.0

  dpi: 150 | 300 | 600;
  bleedMm: 0 | 3;
  cropMarks: boolean;

  show: {
    cover: boolean;
    palette: boolean;
    trackNumbers: boolean;
    trackDurations: boolean;
    releaseDate: boolean;
    totalRuntime: boolean;
    label: boolean;
    waveform: boolean;
    scanCode: boolean;
    parentalAdvisory: boolean;
  };

  customTitle?: string;
  customArtist?: string;
  trackColumns: 0 | 1 | 2 | 3; // 0 = automatisch
  stripFeatures: boolean;
};

export type StyleTokens = {
  background: string;
  backgroundImage?: string; // z. B. Verlauf bei Bloom (wird ggf. aus Palette gebaut)
  text: string;
  textMuted: string;
  rule: string; // Trennlinien
  accent: string;
  coverTreatment: "none" | "grayscale" | "border" | "shadow" | "matte";
  paletteMode: "cover" | "grayscale" | "mono" | "hidden" | "duo" | "dots";
  defaultFontPair: FontPair;
  paddingBase: number; // Anteil der Posterbreite, z. B. 0.07
};

export const DEFAULT_SHOW: PosterConfig["show"] = {
  cover: true,
  palette: true,
  trackNumbers: true,
  trackDurations: true,
  releaseDate: true,
  totalRuntime: true,
  label: true,
  waveform: true,
  scanCode: true,
  parentalAdvisory: false,
};

export function defaultConfig(albumId: string): PosterConfig {
  return {
    albumId,
    layoutId: "classic",
    styleId: "classic",
    fontPair: "auto",
    format: { id: "A4", widthMm: 210, heightMm: 297 },
    paddingScale: 1,
    dpi: 300,
    bleedMm: 0,
    cropMarks: false,
    show: { ...DEFAULT_SHOW },
    trackColumns: 0,
    stripFeatures: false,
  };
}
