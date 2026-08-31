// Das Layout-Modul: baut aus Album + Config einen Satori-Elementbaum.
// Vorschau (SVG) und Export (PNG/PDF) laufen beide durch diesen Code —
// dadurch sehen sie garantiert identisch aus.
//
// Alles rechnet relativ zur logischen Posterbreite W = 1000. Kein fester
// Pixelwert bezieht sich auf die Ausgabegröße; hochskaliert wird erst
// beim Rastern (resvg fitTo).

import type { Album, PosterConfig, StyleTokens, Track } from "./types";
import { STYLES, contrastText, luminance } from "./styles";
import { buildWaveform } from "./waveform";
import type { FontSpec } from "./fonts";

export type PosterAssets = {
  coverDataUrl: string | null;
  scanDataUrl: string | null;
  /** Höhe/Breite des Scan-Code-Elements (Logo + Striche), i. d. R. 0.25. */
  scanAspect: number;
};

type El = { type: string; props: Record<string, unknown> };

const div = (style: Record<string, unknown>, ...children: unknown[]): El => ({
  type: "div",
  props: {
    style: { display: "flex", ...style },
    children: children.flat(Infinity).filter(Boolean),
  },
});

const txt = (style: Record<string, unknown>, text: string): El => ({
  type: "div",
  props: { style, children: text },
});

const img = (src: string, style: Record<string, unknown>): El => ({
  type: "img",
  props: { src, style },
});

// ---------------------------------------------------------------------------
// Format-Helfer
// ---------------------------------------------------------------------------

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtTotal(ms: number): string {
  return `${Math.round(ms / 60000)} min`;
}

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${parseInt(m[3], 10)}. ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

function stripFeat(title: string): string {
  return title
    .replace(/\s*[([](?:feat|ft|with|mit)\.?\s[^)\]]*[)\]]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function grayHex(hex: string): string {
  const l = Math.round(luminance(hex) ** 0.45 * 255);
  const h = l.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

// ---------------------------------------------------------------------------
// Tokens auflösen (Bloom baut seinen Verlauf aus der Palette)
// ---------------------------------------------------------------------------

export function resolveTokens(album: Album, config: PosterConfig): StyleTokens {
  const base = STYLES[config.styleId];
  if (config.styleId !== "bloom") return base;

  const p = album.palette;
  const c1 = p[Math.min(1, p.length - 1)] ?? "#303030";
  const c2 = p[Math.min(3, p.length - 1)] ?? "#101010";
  const text = contrastText(luminance(c1) > luminance(c2) ? c1 : c2);
  const muted = text === "#FFFFFF" ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.6)";
  return {
    ...base,
    background: c2,
    backgroundImage: `linear-gradient(160deg, ${c1} 0%, ${c2} 100%)`,
    text,
    textMuted: muted,
    rule: text,
    accent: text,
  };
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

type Ctx = {
  W: number; // logische Breite (1000)
  H: number;
  album: Album;
  config: PosterConfig;
  tokens: StyleTokens;
  fonts: FontSpec;
  assets: PosterAssets;
  pad: number;
  title: string;
  artist: string;
  tracks: Track[];
};

function paletteColors(ctx: Ctx): string[] {
  const { tokens, album } = ctx;
  switch (tokens.paletteMode) {
    case "grayscale":
      return album.palette.map(grayHex);
    case "mono":
      return album.palette.map(() => tokens.text);
    case "duo":
      return [album.palette[0], album.palette[album.palette.length - 1]];
    default:
      return album.palette;
  }
}

function paletteRow(ctx: Ctx, size: number): El | null {
  if (!ctx.config.show.palette || ctx.tokens.paletteMode === "hidden") return null;
  const colors = paletteColors(ctx);
  const dots = ctx.tokens.paletteMode === "dots";
  const s = dots ? size * 0.45 : size;
  return div(
    { flexDirection: "row", alignItems: "center" },
    colors.map((c, i) =>
      div({
        width: s,
        height: s,
        backgroundColor: c,
        borderRadius: dots ? s / 2 : 0,
        marginLeft: i === 0 ? 0 : dots ? s * 0.7 : 0,
        border: dots ? "none" : `1px solid ${ctx.tokens.rule}`,
      })
    )
  );
}

function advisoryBadge(ctx: Ctx, coverW: number): El {
  const w = coverW * 0.14;
  const h = w * 0.62;
  return div(
    {
      position: "absolute",
      right: coverW * 0.03,
      bottom: coverW * 0.03,
      width: w,
      height: h,
      backgroundColor: "#FFFFFF",
      border: `${Math.max(1, w * 0.03)}px solid #000000`,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    },
    txt(
      {
        fontFamily: "Inter",
        fontWeight: 900,
        fontSize: w * 0.105,
        color: "#000000",
        letterSpacing: w * 0.002,
      },
      "PARENTAL"
    ),
    txt(
      {
        fontFamily: "Inter",
        fontWeight: 900,
        fontSize: w * 0.105,
        color: "#000000",
      },
      "ADVISORY"
    ),
    txt(
      {
        fontFamily: "Inter",
        fontWeight: 400,
        fontSize: w * 0.075,
        color: "#000000",
        marginTop: h * 0.08,
      },
      "EXPLICIT CONTENT"
    )
  );
}

function coverBlock(ctx: Ctx, width: number): El | null {
  const { tokens, config, assets } = ctx;
  if (!config.show.cover || !assets.coverDataUrl) return null;

  const style: Record<string, unknown> = { width, height: width };
  if (tokens.coverTreatment === "border") style.border = `2px solid ${tokens.rule}`;
  if (tokens.coverTreatment === "shadow")
    style.boxShadow = "0 14px 46px rgba(0,0,0,0.38)";
  if (tokens.coverTreatment === "matte") style.opacity = 0.96;

  return div(
    { position: "relative", width, height: width },
    img(assets.coverDataUrl, style),
    config.show.parentalAdvisory ? advisoryBadge(ctx, width) : null
  );
}

function waveformBlock(ctx: Ctx, width: number, height: number): El | null {
  if (!ctx.config.show.waveform) return null;
  const bars = buildWaveform(ctx.album, 26);
  const gap = width * 0.014;
  const bw = (width - gap * (bars.length - 1)) / bars.length;
  return div(
    {
      flexDirection: "row",
      alignItems: "flex-end",
      width,
      height,
    },
    bars.map((v, i) =>
      div({
        width: bw,
        height: Math.max(2, v * height),
        backgroundColor: ctx.tokens.accent,
        marginLeft: i === 0 ? 0 : gap,
      })
    )
  );
}

function metaBlock(ctx: Ctx, label: string, value: string, fs: number): El {
  return div(
    { flexDirection: "column", marginTop: fs * 1.1 },
    txt(
      {
        fontFamily: ctx.fonts.body.family,
        fontWeight: 700,
        fontSize: fs * 0.78,
        letterSpacing: fs * 0.14,
        color: ctx.tokens.textMuted,
      },
      label.toUpperCase()
    ),
    txt(
      {
        fontFamily: ctx.fonts.body.family,
        fontWeight: 400,
        fontSize: fs,
        color: ctx.tokens.text,
        marginTop: fs * 0.25,
      },
      value
    )
  );
}

function metaBlocks(ctx: Ctx, fs: number): El[] {
  const { album, config } = ctx;
  const blocks: El[] = [];
  if (config.show.releaseDate && album.releaseDate)
    blocks.push(metaBlock(ctx, "Released", fmtDate(album.releaseDate), fs));
  if (config.show.totalRuntime)
    blocks.push(metaBlock(ctx, "Length", fmtTotal(album.totalDurationMs), fs));
  if (config.show.label && album.label)
    blocks.push(metaBlock(ctx, "Label", album.label, fs));
  return blocks;
}

function scanBlock(ctx: Ctx, width: number): El | null {
  if (!ctx.config.show.scanCode || !ctx.assets.scanDataUrl) return null;
  const aspect = ctx.assets.scanAspect || 0.25;
  return img(ctx.assets.scanDataUrl, {
    width,
    height: width * aspect,
    marginTop: width * 0.06,
  });
}

// ---------------------------------------------------------------------------
// Tracklist mit automatischer Verkleinerung
// ---------------------------------------------------------------------------

function pickColumns(n: number, forced: 0 | 1 | 2 | 3): number {
  if (forced) return forced;
  if (n <= 8) return 1;
  if (n <= 21) return 2;
  return 3;
}

/** Schriftgröße schrittweise verkleinern, bis die Liste in die Höhe passt. */
function fitTracklist(
  n: number,
  cols: number,
  availableH: number,
  baseFs: number,
  minFs: number,
  lineH: number
): { fs: number; cols: number } {
  let c = cols;
  for (;;) {
    let fs = baseFs;
    const rows = Math.ceil(n / c);
    while (rows * fs * lineH > availableH && fs > minFs) fs -= 0.4;
    if (rows * fs * lineH <= availableH || c >= 3) return { fs, cols: c };
    c += 1;
  }
}

function trackLine(ctx: Ctx, t: Track, fs: number, lineH: number, showDisc: boolean): El {
  const { config, fonts, tokens } = ctx;
  const num = showDisc ? `${t.disc}-${String(t.no).padStart(2, "0")}` : String(t.no).padStart(2, "0");
  return div(
    {
      flexDirection: "row",
      alignItems: "baseline",
      height: fs * lineH,
    },
    config.show.trackNumbers
      ? txt(
          {
            fontFamily: fonts.body.family,
            fontWeight: 700,
            fontSize: fs * 0.82,
            color: tokens.textMuted,
            width: fs * (showDisc ? 2.8 : 1.9),
            flexShrink: 0,
          },
          num
        )
      : null,
    txt(
      {
        fontFamily: fonts.body.family,
        fontWeight: 400,
        fontSize: fs,
        color: tokens.text,
        flexGrow: 1,
        flexShrink: 1,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        paddingRight: fs * 0.6,
      },
      config.stripFeatures ? stripFeat(t.title) : t.title
    ),
    config.show.trackDurations
      ? txt(
          {
            fontFamily: fonts.body.family,
            fontWeight: 400,
            fontSize: fs * 0.85,
            color: tokens.textMuted,
            flexShrink: 0,
          },
          fmtDuration(t.durationMs)
        )
      : null
  );
}

function tracklist(
  ctx: Ctx,
  width: number,
  availableH: number,
  baseScale = 1,
  colsOverride?: number
): El {
  const { tracks, config, W } = ctx;
  const n = tracks.length;
  const lineH = 1.38;
  const cols0 = config.trackColumns || colsOverride || pickColumns(n, 0);
  const { fs, cols } = fitTracklist(
    n,
    cols0,
    availableH,
    W * 0.0155 * baseScale,
    W * 0.009,
    lineH
  );

  const showDisc = tracks.some((t) => t.disc > 1);
  const rows = Math.ceil(n / cols);
  const colGap = W * 0.028;
  const colW = (width - colGap * (cols - 1)) / cols;

  const columns: El[] = [];
  for (let c = 0; c < cols; c++) {
    const slice = tracks.slice(c * rows, (c + 1) * rows);
    columns.push(
      div(
        {
          flexDirection: "column",
          width: colW,
          marginLeft: c === 0 ? 0 : colGap,
        },
        slice.map((t) => trackLine(ctx, t, fs, lineH, showDisc))
      )
    );
  }

  return div(
    { flexDirection: "row", width, maxHeight: availableH, overflow: "hidden" },
    columns
  );
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

function titleBlock(ctx: Ctx, opts?: { center?: boolean; scale?: number }): El {
  const { W, fonts, tokens } = ctx;
  const scale = opts?.scale ?? 1;
  const upper = fonts.headline.family !== "Playfair Display";
  const title = upper ? ctx.title.toUpperCase() : ctx.title;
  let fs = W * 0.052 * scale;
  if (title.length > 16) fs = Math.min(fs, (W * 0.92 * scale) / (title.length * 0.62));
  fs = Math.max(fs, W * 0.024);

  return div(
    {
      flexDirection: "column",
      alignItems: opts?.center ? "center" : "flex-start",
    },
    txt(
      {
        fontFamily: fonts.headline.family,
        fontWeight: fonts.headline.weight,
        fontSize: fs,
        color: tokens.text,
        letterSpacing: upper ? fs * 0.01 : 0,
        lineHeight: 1.06,
        textAlign: opts?.center ? "center" : "left",
      },
      title
    ),
    txt(
      {
        fontFamily: fonts.body.family,
        fontWeight: 400,
        fontSize: fs * 0.34,
        color: tokens.textMuted,
        marginTop: fs * 0.18,
        letterSpacing: fs * 0.02,
      },
      ctx.artist
    )
  );
}

function rule(ctx: Ctx, marginY: number): El {
  return div({
    height: Math.max(1.2, ctx.W * 0.0016),
    backgroundColor: ctx.tokens.rule,
    marginTop: marginY,
    marginBottom: marginY,
    width: "100%",
  });
}

/** Rechte Info-Spalte: Waveform, Scan-Code, Metadaten-Blöcke. */
function infoColumn(ctx: Ctx, width: number): El | null {
  const { W } = ctx;
  const fs = W * 0.0145;
  const children: (El | null)[] = [
    waveformBlock(ctx, width, W * 0.045),
    scanBlock(ctx, width),
    div({ flexGrow: 1 }),
    div({ flexDirection: "column" }, metaBlocks(ctx, fs)),
  ];
  const real = children.filter(Boolean) as El[];
  if (real.length === 0) return null;
  return div(
    { flexDirection: "column", width, flexShrink: 0, marginLeft: W * 0.035 },
    real
  );
}

function layoutClassic(ctx: Ctx): El {
  const { W, H, pad } = ctx;
  const CW = W - 2 * pad;
  const showCover = ctx.config.show.cover && ctx.assets.coverDataUrl;
  const coverH = showCover ? CW : 0;
  const titleH = W * 0.09;
  const infoW = W * 0.2;
  const hasInfo = infoColumn(ctx, infoW) !== null;
  const availableH =
    H - pad * 2.05 - coverH - titleH - W * 0.05;

  return div(
    { flexDirection: "column", width: W, height: H, padding: pad, paddingBottom: pad * 1.05 },
    coverBlock(ctx, CW),
    div(
      {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        marginTop: showCover ? W * 0.032 : 0,
      },
      titleBlock(ctx),
      paletteRow(ctx, W * 0.034)
    ),
    rule(ctx, W * 0.02),
    div(
      { flexDirection: "row", flexGrow: 1 },
      tracklist(ctx, hasInfo ? CW - infoW - W * 0.035 : CW, Math.max(availableH, W * 0.05)),
      infoColumn(ctx, infoW)
    )
  );
}

function layoutMinimal(ctx: Ctx): El {
  const { W, H, pad } = ctx;
  const CW = W - 2 * pad;
  const availableH = H - pad * 2.05 - W * 0.2 - W * 0.09;

  return div(
    { flexDirection: "column", width: W, height: H, padding: pad, paddingBottom: pad * 1.05 },
    titleBlock(ctx, { scale: 1.7 }),
    rule(ctx, W * 0.03),
    div(
      { flexDirection: "row", flexGrow: 1 },
      tracklist(ctx, CW, Math.max(availableH, W * 0.05), 1.12)
    ),
    div(
      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: W * 0.02 },
      div({ flexDirection: "row" }, metaBlocks(ctx, W * 0.0145).map((b, i) =>
        div({ marginRight: W * 0.05 }, b)
      )),
      paletteRow(ctx, W * 0.03)
    )
  );
}

function layoutVinyl(ctx: Ctx): El {
  const { W, H, pad, tokens } = ctx;
  const CW = W - 2 * pad;
  const D = Math.min(CW * 0.68, H * 0.42); // Plattendurchmesser
  const label = D * 0.42;
  const availableH = H - pad * 2.05 - D - W * 0.16;

  const ringColor =
    luminance(tokens.background) > 0.5 ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.12)";
  const discBase = luminance(tokens.background) > 0.5 ? "#1A1A1A" : "#0A0A0A";

  const rings: El[] = [];
  for (let i = 0; i < 7; i++) {
    const rd = D * (0.94 - i * 0.075);
    rings.push(
      div({
        position: "absolute",
        left: (D - rd) / 2,
        top: (D - rd) / 2,
        width: rd,
        height: rd,
        borderRadius: rd / 2,
        border: `1.4px solid ${ringColor}`,
      })
    );
  }

  return div(
    { flexDirection: "column", width: W, height: H, padding: pad, paddingBottom: pad * 1.05, alignItems: "center" },
    div(
      { position: "relative", width: D, height: D },
      div({
        width: D,
        height: D,
        borderRadius: D / 2,
        backgroundColor: discBase,
        boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
      }),
      rings,
      ctx.assets.coverDataUrl && ctx.config.show.cover
        ? img(ctx.assets.coverDataUrl, {
            position: "absolute",
            left: (D - label) / 2,
            top: (D - label) / 2,
            width: label,
            height: label,
            borderRadius: label / 2,
          })
        : div({
            position: "absolute",
            left: (D - label) / 2,
            top: (D - label) / 2,
            width: label,
            height: label,
            borderRadius: label / 2,
            backgroundColor: ctx.album.palette[2] ?? "#888888",
          }),
      div({
        position: "absolute",
        left: D / 2 - D * 0.012,
        top: D / 2 - D * 0.012,
        width: D * 0.024,
        height: D * 0.024,
        borderRadius: D * 0.012,
        backgroundColor: discBase,
      })
    ),
    div(
      { flexDirection: "column", width: CW, marginTop: W * 0.045, alignItems: "center" },
      titleBlock(ctx, { center: true })
    ),
    rule(ctx, W * 0.022),
    div(
      { flexDirection: "row", width: CW, flexGrow: 1 },
      tracklist(ctx, CW, Math.max(availableH, W * 0.05))
    ),
    div(
      { flexDirection: "row", width: CW, justifyContent: "space-between", alignItems: "flex-end" },
      div({ flexDirection: "row" }, metaBlocks(ctx, W * 0.014).map((b) =>
        div({ marginRight: W * 0.05 }, b)
      )),
      paletteRow(ctx, W * 0.028)
    )
  );
}

function layoutGradient(ctx: Ctx): El {
  const { W, H, pad, album, tokens } = ctx;
  const CW = W - 2 * pad;
  const p = album.palette;
  const c1 = p[Math.min(2, p.length - 1)] ?? "#444444";
  const c2 = p[0] ?? "#111111";
  const text = contrastText(c2);
  const muted = text === "#FFFFFF" ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.58)";

  const g = {
    ...ctx,
    tokens: {
      ...tokens,
      background: c2,
      backgroundImage: `linear-gradient(165deg, ${c1} 0%, ${c2} 100%)`,
      text,
      textMuted: muted,
      rule: text,
      accent: text,
    },
  };

  const coverW = W * 0.62;
  const showCover = g.config.show.cover && g.assets.coverDataUrl;
  const availableH = H - pad * 2.05 - (showCover ? coverW : 0) - W * 0.2;

  return div(
    { flexDirection: "column", width: W, height: H, padding: pad, paddingBottom: pad * 1.05, alignItems: "center" },
    showCover
      ? div(
          { position: "relative", width: coverW, height: coverW, marginTop: W * 0.01 },
          img(g.assets.coverDataUrl as string, {
            width: coverW,
            height: coverW,
            boxShadow: "0 22px 70px rgba(0,0,0,0.5)",
          }),
          g.config.show.parentalAdvisory ? advisoryBadge(g, coverW) : null
        )
      : null,
    div({ marginTop: W * 0.04, flexDirection: "column", alignItems: "center" }, titleBlock(g, { center: true })),
    div(
      { flexDirection: "row", width: CW, flexGrow: 1, marginTop: W * 0.025 },
      tracklist(g, CW, Math.max(availableH, W * 0.05))
    ),
    div(
      { flexDirection: "row", width: CW, justifyContent: "space-between", alignItems: "flex-end" },
      div({ flexDirection: "row" }, metaBlocks(g, W * 0.014).map((b) =>
        div({ marginRight: W * 0.05 }, b)
      )),
      waveformBlock(g, W * 0.18, W * 0.04)
    )
  );
}

/** Für quadratische und querformatige Formate: Cover links, Liste rechts. */
function layoutSquare(ctx: Ctx): El {
  const { W, H, pad } = ctx;
  const CW = W - 2 * pad;
  const coverW = Math.min(W * 0.52, H - 2 * pad - W * 0.1);
  const rightW = CW - coverW - W * 0.04;
  const availableH = H - pad * 2.05 - W * 0.12;

  return div(
    { flexDirection: "column", width: W, height: H, padding: pad, paddingBottom: pad * 1.05 },
    div(
      { flexDirection: "row", flexGrow: 1 },
      div(
        { flexDirection: "column", width: coverW, flexShrink: 0 },
        coverBlock(ctx, coverW),
        div({ marginTop: W * 0.022 }, paletteRow(ctx, W * 0.03) ?? div({})),
        div({ flexGrow: 1 }),
        div({ flexDirection: "column" },
          waveformBlock(ctx, coverW * 0.7, W * 0.035),
          scanBlock(ctx, coverW * 0.45)
        )
      ),
      div(
        { flexDirection: "column", width: rightW, marginLeft: W * 0.04 },
        titleBlock(ctx),
        rule(ctx, W * 0.018),
        // schmale Spalte: einspaltig bis 18 Tracks, sonst zweispaltig
        tracklist(
          ctx,
          rightW,
          Math.max(availableH - W * 0.14, W * 0.05),
          1,
          ctx.tracks.length <= 18 ? 1 : 2
        ),
        div({ flexGrow: 1 }),
        div(
          { flexDirection: "row" },
          metaBlocks(ctx, W * 0.014).map((b) => div({ marginRight: W * 0.045 }, b))
        )
      )
    )
  );
}

// ---------------------------------------------------------------------------
// Einstieg: Poster + optionale Beschnittzone mit Schnittmarken
// ---------------------------------------------------------------------------

export type PosterDoc = {
  element: El;
  width: number; // logische Canvas-Breite inkl. Beschnitt/Marken
  height: number;
  posterWidth: number; // logische Breite nur des Endformats
  totalWidthMm: number; // physische Canvas-Breite inkl. Beschnitt/Marken
  totalHeightMm: number;
};

export function buildPosterDoc(
  album: Album,
  config: PosterConfig,
  assets: PosterAssets,
  fonts: FontSpec
): PosterDoc {
  const W = 1000;
  const { widthMm, heightMm } = config.format;
  const H = Math.round((W * heightMm) / widthMm);
  const s = W / widthMm; // logische px pro mm

  const tokens = resolveTokens(album, config);
  const ctx: Ctx = {
    W,
    H,
    album,
    config,
    tokens,
    fonts,
    assets,
    pad: W * tokens.paddingBase * config.paddingScale,
    title: config.customTitle?.trim() || album.title,
    artist: config.customArtist?.trim() || album.artist,
    tracks: album.tracks,
  };

  let inner: El;
  const isWide = heightMm / widthMm < 1.12;
  if (config.layoutId === "square" || (isWide && config.layoutId === "classic")) {
    inner = layoutSquare(ctx);
  } else {
    switch (config.layoutId) {
      case "minimal":
        inner = layoutMinimal(ctx);
        break;
      case "vinyl":
        inner = layoutVinyl(ctx);
        break;
      case "gradient":
        inner = layoutGradient(ctx);
        break;
      default:
        inner = layoutClassic(ctx);
    }
  }

  // Hintergrund aufs Poster legen (Gradient-Layout setzt seinen eigenen)
  const bgTokens =
    config.layoutId === "gradient" ? resolveGradientBg(ctx) : tokens;
  const posterStyle: Record<string, unknown> = {
    width: W,
    height: H,
    backgroundColor: bgTokens.background,
    flexDirection: "column",
  };
  if (bgTokens.backgroundImage) posterStyle.backgroundImage = bgTokens.backgroundImage;
  const poster = div(posterStyle, inner);

  const bleed = config.bleedMm * s;
  const slug = config.cropMarks ? 5 * s : 0;
  const margin = bleed + slug;

  if (margin === 0) {
    return {
      element: poster,
      width: W,
      height: H,
      posterWidth: W,
      totalWidthMm: widthMm,
      totalHeightMm: heightMm,
    };
  }

  const cw = W + 2 * margin;
  const chh = H + 2 * margin;
  const markLen = slug;
  const markColor = "#777777";
  const markW = Math.max(1, s * 0.1);

  const marks: El[] = [];
  if (config.cropMarks) {
    const xs = [margin, margin + W]; // Trim-Kanten x
    const ys = [margin, margin + H];
    for (const x of xs) {
      // vertikale Marken oben und unten
      marks.push(
        div({ position: "absolute", left: x - markW / 2, top: 0, width: markW, height: markLen, backgroundColor: markColor }),
        div({ position: "absolute", left: x - markW / 2, top: chh - markLen, width: markW, height: markLen, backgroundColor: markColor })
      );
    }
    for (const y of ys) {
      marks.push(
        div({ position: "absolute", left: 0, top: y - markW / 2, width: markLen, height: markW, backgroundColor: markColor }),
        div({ position: "absolute", left: cw - markLen, top: y - markW / 2, width: markLen, height: markW, backgroundColor: markColor })
      );
    }
  }

  // Beschnittzone: Hintergrundfarbe läuft bis in den Anschnitt
  const bleedStyle: Record<string, unknown> = {
    position: "absolute",
    left: slug,
    top: slug,
    width: W + 2 * bleed,
    height: H + 2 * bleed,
    backgroundColor: bgTokens.background,
  };
  if (bgTokens.backgroundImage) bleedStyle.backgroundImage = bgTokens.backgroundImage;

  const element = div(
    { position: "relative", width: cw, height: chh, backgroundColor: "#FFFFFF" },
    div(bleedStyle),
    div({ position: "absolute", left: margin, top: margin }, poster),
    marks
  );

  return {
    element,
    width: cw,
    height: chh,
    posterWidth: W,
    totalWidthMm: widthMm + 2 * (config.bleedMm + (config.cropMarks ? 5 : 0)),
    totalHeightMm: heightMm + 2 * (config.bleedMm + (config.cropMarks ? 5 : 0)),
  };
}

function resolveGradientBg(ctx: Ctx): StyleTokens {
  const p = ctx.album.palette;
  const c1 = p[Math.min(2, p.length - 1)] ?? "#444444";
  const c2 = p[0] ?? "#111111";
  return {
    ...ctx.tokens,
    background: c2,
    backgroundImage: `linear-gradient(165deg, ${c1} 0%, ${c2} 100%)`,
  };
}
