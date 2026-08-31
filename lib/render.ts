// Rendering: Assets vorbereiten, Satori → SVG, resvg → PNG.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import type { Album, PosterConfig } from "./types";
import { getCoverBuffer } from "./album";
import { buildPosterDoc, resolveTokens, type PosterAssets } from "./poster";
import { fontsForPair } from "./fonts";
import { STYLES, luminance } from "./styles";
import { mmToPx } from "./formats";
import { seededRandom } from "./waveform";

/** Cover als Data-URL — Vorschau klein, Export in voller Auflösung. */
async function coverDataUrl(
  album: Album,
  config: PosterConfig,
  maxPx: number
): Promise<string | null> {
  try {
    const buf = await getCoverBuffer(album);
    const tokens = STYLES[config.styleId];
    let pipeline = sharp(buf);
    const meta = await pipeline.metadata();
    if ((meta.width ?? 0) > maxPx) pipeline = pipeline.resize(maxPx, maxPx, { fit: "inside" });
    if (tokens.coverTreatment === "grayscale") pipeline = pipeline.grayscale();
    const jpeg = await pipeline.jpeg({ quality: 90 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Scan-Code als rein dekoratives Element: Spotify-Logo plus Strichmuster,
 * lokal als SVG gezeichnet (kein echter Link, kein Netzwerk). Das Muster ist
 * mit der Album-ID gesät — dieselbe Platte sieht immer gleich aus.
 */
function scanDataUrl(
  album: Album,
  config: PosterConfig
): { url: string; aspect: number } | null {
  if (!config.show.scanCode) return null;
  const tokens = resolveTokensBg(album, config);
  const dark = luminance(tokens.bg) <= 0.5;
  const fg = dark ? "#FFFFFF" : "#000000";

  const W = 640;
  const H = 160;
  const cx = 80;
  const cy = H / 2;

  // Strichmuster: 23 Balken mit runden Enden, vertikal zentriert
  const rnd = seededRandom(`scan:${album.id}`);
  const bars: string[] = [];
  const count = 23;
  const barW = 9;
  const gap = (W - 176 - 24 - count * barW) / (count - 1);
  for (let i = 0; i < count; i++) {
    const h = 24 + Math.round(rnd() * 104);
    const x = 176 + i * (barW + gap);
    bars.push(
      `<rect x="${x.toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${barW}" height="${h}" rx="${barW / 2}" fill="${fg}"/>`
    );
  }

  // Spotify-Logo: gefüllter Kreis, drei Bögen in der Hintergrundfarbe
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <circle cx="${cx}" cy="${cy}" r="56" fill="${fg}"/>
  <g stroke="${tokens.bg}" fill="none" stroke-linecap="round">
    <path d="M 52,${cy - 16} C 72,${cy - 24} 96,${cy - 22} 112,${cy - 12}" stroke-width="9.5"/>
    <path d="M 55,${cy + 2} C 73,${cy - 5} 94,${cy - 3} 108,${cy + 5}" stroke-width="8.5"/>
    <path d="M 58,${cy + 19} C 73,${cy + 13} 91,${cy + 15} 103,${cy + 21}" stroke-width="7.5"/>
  </g>
  ${bars.join("\n  ")}
</svg>`;

  return {
    url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    aspect: H / W,
  };
}

function resolveTokensBg(album: Album, config: PosterConfig): { bg: string } {
  if (config.layoutId === "gradient") {
    return { bg: album.palette[0] ?? "#111111" };
  }
  const t = resolveTokens(album, config);
  return { bg: t.background.startsWith("#") ? t.background : "#111111" };
}

export async function renderSvg(
  album: Album,
  config: PosterConfig,
  opts: { preview: boolean }
): Promise<{ svg: string; doc: ReturnType<typeof buildPosterDoc> }> {
  const pair =
    config.fontPair === "auto" ? STYLES[config.styleId].defaultFontPair : config.fontPair;
  const fonts = fontsForPair(pair);

  // Vorschau: Cover auf 700 px begrenzen, Export: volle Auflösung
  const scan = scanDataUrl(album, config);
  const assets: PosterAssets = {
    coverDataUrl: await coverDataUrl(album, config, opts.preview ? 700 : 4000),
    scanDataUrl: scan?.url ?? null,
    scanAspect: scan?.aspect ?? 0.25,
  };

  const doc = buildPosterDoc(album, config, assets, fonts);

  const svg = await satori(doc.element as any, {
    width: doc.width,
    height: doc.height,
    fonts: fonts.fonts as any,
  });

  return { svg, doc };
}

export async function renderPng(
  album: Album,
  config: PosterConfig
): Promise<{ png: Buffer; pxWidth: number; pxHeight: number }> {
  const { svg, doc } = await renderSvg(album, config, { preview: false });

  // Zielbreite in px inkl. Beschnitt/Schnittmarken
  const pxWidth = mmToPx(doc.totalWidthMm, config.dpi);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: pxWidth },
    font: { loadSystemFonts: false },
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  return { png: Buffer.from(png), pxWidth: rendered.width, pxHeight: rendered.height };
}
