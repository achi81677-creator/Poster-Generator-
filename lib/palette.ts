// Farbpalette aus dem Cover: Median-Cut mit Sättigungsgewichtung.
import sharp from "sharp";

type Px = [number, number, number];

function hex([r, g, b]: Px): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function saturation([r, g, b]: Px): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return max === 0 ? 0 : (max - min) / max;
}

function lightness([r, g, b]: Px): number {
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
}

function dist(a: Px, b: Px): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function medianCut(pixels: Px[], depth: number): Px[][] {
  if (depth === 0 || pixels.length === 0) return [pixels];
  const ranges = [0, 1, 2].map((c) => {
    let min = 255,
      max = 0;
    for (const p of pixels) {
      if (p[c] < min) min = p[c];
      if (p[c] > max) max = p[c];
    }
    return max - min;
  });
  const channel = ranges.indexOf(Math.max(...ranges));
  const sorted = [...pixels].sort((a, b) => a[channel] - b[channel]);
  const mid = Math.floor(sorted.length / 2);
  return [
    ...medianCut(sorted.slice(0, mid), depth - 1),
    ...medianCut(sorted.slice(mid), depth - 1),
  ];
}

/** Extrahiert 5 gut unterscheidbare Farben aus einem Bild-Buffer. */
export async function extractPalette(image: Buffer, count = 5): Promise<string[]> {
  const { data, info } = await sharp(image)
    .resize(64, 64, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: Px[] = [];
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  const boxes = medianCut(pixels, 4); // 16 Boxen
  const candidates = boxes
    .filter((b) => b.length > 0)
    .map((b) => {
      const avg: Px = [0, 0, 0];
      for (const p of b) {
        avg[0] += p[0];
        avg[1] += p[1];
        avg[2] += p[2];
      }
      avg[0] /= b.length;
      avg[1] /= b.length;
      avg[2] /= b.length;
      return { color: avg, weight: b.length * (0.4 + saturation(avg)) };
    })
    .sort((a, b) => b.weight - a.weight);

  const isMonochrome = candidates.every((c) => saturation(c.color) < 0.12);

  const picked: Px[] = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    // extreme Helligkeiten raus, außer das Cover ist wirklich monochrom
    if (!isMonochrome) {
      const l = lightness(c.color);
      if (l < 0.06 || l > 0.96) continue;
    }
    if (picked.some((p) => dist(p, c.color) < 42)) continue;
    picked.push(c.color);
  }
  // auffüllen, falls zu streng gefiltert
  for (const c of candidates) {
    if (picked.length >= count) break;
    if (picked.some((p) => dist(p, c.color) < 12)) continue;
    picked.push(c.color);
  }
  while (picked.length < count) picked.push([128, 128, 128]);

  // dunkel → hell sortieren wirkt auf dem Poster ruhiger
  picked.sort((a, b) => lightness(a) - lightness(b));
  return picked.map(hex);
}
