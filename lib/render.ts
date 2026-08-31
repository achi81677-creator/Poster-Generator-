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
import { readBuffer, writeBuffer } from "./cache";

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
 * Scan-Code neben der Tracklist.
 *
 * Wenn das Album eine Spotify-URI hat, wird der **echte** Spotify-Code über
 * scannables.scdn.co geholt — der ist mit der Spotify-App wirklich scanbar und
 * führt zum Album. Das Strichmuster lässt sich nicht selbst berechnen: die
 * Balkenhöhen kodieren eine Referenz-ID, die nur Spotifys Server kennt.
 *
 * Ohne URI (Deezer, Demo) oder wenn der Endpunkt nicht erreichbar ist, wird
 * ein optisch gleichwertiges, rein dekoratives Muster lokal gezeichnet.
 */
async function scanDataUrl(
  album: Album,
  config: PosterConfig
): Promise<{ url: string; aspect: number; real: boolean } | null> {
  if (!config.show.scanCode) return null;
  const tokens = resolveTokensBg(album, config);
  const dark = luminance(tokens.bg) <= 0.5;

  if (album.spotifyUri) {
    const key = `scan:${album.spotifyUri}:${tokens.bg}:${dark}`;
    const cached = readBuffer("scan", key);
    if (cached) {
      try {
        return JSON.parse(cached.toString("utf8"));
      } catch {
        // Cache-Eintrag unbrauchbar → neu holen
      }
    }
    try {
      const bgHex = tokens.bg.replace("#", "");
      const bars = dark ? "white" : "black";
      const url = `https://scannables.scdn.co/uri/plain/svg/${bgHex}/${bars}/640/${album.spotifyUri}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        let svg = await res.text();
        if (svg.includes("<svg")) {
          // Hintergrundfläche entfernen, damit der Code auf Verläufen und
          // Texturen nicht als Farbblock aufliegt
          svg = svg.replace(
            new RegExp(`<rect[^>]*fill="${tokens.bg}"[^>]*/>`, "gi"),
            ""
          );
          const w = Number(svg.match(/width="([\d.]+)"/)?.[1] ?? 640);
          const h = Number(svg.match(/height="([\d.]+)"/)?.[1] ?? 160);
          const result = {
            url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
            aspect: h > 0 && w > 0 ? h / w : 0.25,
            real: true,
          };
          writeBuffer("scan", key, Buffer.from(JSON.stringify(result), "utf8"));
          return result;
        }
      }
    } catch {
      // Endpunkt nicht erreichbar → dekoratives Muster
    }
  }

  return decorativeScan(album, tokens.bg, dark);
}

/** Rein dekoratives Scan-Code-Motiv: Spotify-Logo plus Strichmuster. */
function decorativeScan(
  album: Album,
  bg: string,
  dark: boolean
): { url: string; aspect: number; real: boolean } {
  const fg = dark ? "#FFFFFF" : "#000000";

  const W = 640;
  const H = 160;
  const cx = 80;
  const cy = H / 2;

  // 23 Balken mit runden Enden, Höhen in 8 Stufen wie beim Original
  const rnd = seededRandom(`scan:${album.id}`);
  const bars: string[] = [];
  const count = 23;
  const barW = 9;
  const gap = (W - 176 - 24 - count * barW) / (count - 1);
  for (let i = 0; i < count; i++) {
    const h = 24 + Math.round(rnd() * 7) * 16;
    const x = 176 + i * (barW + gap);
    bars.push(
      `<rect x="${x.toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${barW}" height="${h}" rx="${barW / 2}" fill="${fg}"/>`
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <circle cx="${cx}" cy="${cy}" r="56" fill="${fg}"/>
  <g stroke="${bg}" fill="none" stroke-linecap="round">
    <path d="M 52,${cy - 16} C 72,${cy - 24} 96,${cy - 22} 112,${cy - 12}" stroke-width="9.5"/>
    <path d="M 55,${cy + 2} C 73,${cy - 5} 94,${cy - 3} 108,${cy + 5}" stroke-width="8.5"/>
    <path d="M 58,${cy + 19} C 73,${cy + 13} 91,${cy + 15} 103,${cy + 21}" stroke-width="7.5"/>
  </g>
  ${bars.join("\n  ")}
</svg>`;

  return {
    url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    aspect: H / W,
    real: false,
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
  const scan = await scanDataUrl(album, config);
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
