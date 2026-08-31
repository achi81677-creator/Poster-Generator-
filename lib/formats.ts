import type { FormatId } from "./types";

export type FormatDef = {
  id: FormatId;
  label: string;
  widthMm: number;
  heightMm: number;
};

export const FORMATS: FormatDef[] = [
  { id: "A5", label: "A5 · 148 × 210 mm", widthMm: 148, heightMm: 210 },
  { id: "A4", label: "A4 · 210 × 297 mm", widthMm: 210, heightMm: 297 },
  { id: "A3", label: "A3 · 297 × 420 mm", widthMm: 297, heightMm: 420 },
  { id: "A2", label: "A2 · 420 × 594 mm", widthMm: 420, heightMm: 594 },
  { id: "A1", label: "A1 · 594 × 841 mm", widthMm: 594, heightMm: 841 },
  { id: "letter", label: "US Letter · 8,5 × 11 in", widthMm: 215.9, heightMm: 279.4 },
  { id: "legal", label: "US Legal · 8,5 × 14 in", widthMm: 215.9, heightMm: 355.6 },
  { id: "5x7", label: "5 × 7 in · 127 × 178 mm", widthMm: 127, heightMm: 178 },
  { id: "8x10", label: "8 × 10 in · 203 × 254 mm", widthMm: 203.2, heightMm: 254 },
  { id: "11x14", label: "11 × 14 in · 279 × 356 mm", widthMm: 279.4, heightMm: 355.6 },
  { id: "12x18", label: "12 × 18 in · 305 × 457 mm", widthMm: 304.8, heightMm: 457.2 },
  { id: "square", label: "Square · 300 × 300 mm", widthMm: 300, heightMm: 300 },
  { id: "50x70", label: "50 × 70 cm", widthMm: 500, heightMm: 700 },
  { id: "custom", label: "Eigene Größe…", widthMm: 210, heightMm: 297 },
];

export const CUSTOM_MIN_MM = 50;
export const CUSTOM_MAX_MM = 1500;

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

export const MM_TO_PT = 2.834645669;

/** Effektive Cover-Auflösung in PPI bei gegebener gedruckter Breite. */
export function effectivePpi(coverPx: number, coverWidthMm: number): number {
  if (coverWidthMm <= 0) return 0;
  return Math.round(coverPx / (coverWidthMm / 25.4));
}

/** Anteil der Posterbreite, den das Cover im jeweiligen Layout einnimmt. */
export function coverShare(layoutId: string): number {
  switch (layoutId) {
    case "classic":
      return 0.86;
    case "gradient":
      return 0.62;
    case "vinyl":
      return 0.34;
    case "square":
      return 0.52;
    default:
      return 0; // minimal: kein Cover
  }
}
