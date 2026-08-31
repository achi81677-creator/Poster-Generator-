// Rendering: Assets vorbereiten, Satori → SVG, resvg → PNG.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import QRCode from "qrcode";
import type { Album, PosterConfig } from "./types";
import { getCoverBuffer } from "./album";
import { buildPosterDoc, resolveTokens, type PosterAssets } from "./poster";
import { fontsForPair } from "./fonts";
import { STYLES, luminance } from "./styles";
import { mmToPx } from "./formats";
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
 * Spotify-Scan-Code (inoffizieller Endpunkt) als Data-URL;
 * Fallback: QR-Code auf die Album-URL. Bei Fehler `null` —
 * das Layout lässt den Bereich dann einfach weg.
 */
async function scanDataUrl(
  album: Album,
  config: PosterConfig
): Promise<{ url: string; aspect: number } | null> {
  if (!config.show.scanCode) return null;
  const tokens = resolveTokensBg(album, config);
  const dark = luminance(tokens.bg) <= 0.5;
  const cacheKey = `scan:${album.id}:${tokens.bg}:${dark}`;

  const cached = readBuffer("scan", cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached.toString("utf8"));
    } catch {
      // Cache-Eintrag im alten Format → neu holen
    }
  }

  let result: { url: string; aspect: number } | null = null;

  if (album.spotifyUri) {
    try {
      const bgHex = tokens.bg.replace("#", "");
      const bars = dark ? "white" : "black";
      const url = `https://scannables.scdn.co/uri/plain/svg/${bgHex}/${bars}/640/${album.spotifyUri}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const svg = await res.text();
        if (svg.includes("<svg")) {
          result = {
            url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
            aspect: 0.25,
          };
        }
      }
    } catch {
      // weiter zum QR-Fallback
    }
  }

  if (!result && album.externalUrl) {
    try {
      const url = await QRCode.toDataURL(album.externalUrl, {
        margin: 0,
        width: 320,
        color: {
          dark: dark ? "#FFFFFFFF" : "#000000FF",
          light: "#00000000",
        },
      });
      result = { url, aspect: 1 };
    } catch {
      result = null;
    }
  }

  if (result) writeBuffer("scan", cacheKey, Buffer.from(JSON.stringify(result), "utf8"));
  return result;
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
