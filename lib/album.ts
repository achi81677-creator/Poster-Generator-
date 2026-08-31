// Orchestrierung: Provider wählen, Cover upgraden & cachen, Palette rechnen.
import sharp from "sharp";
import type { Album, Track } from "./types";
import { hasSpotifyCredentials, spotifyAlbum, spotifySearch } from "./spotify";
import { deezerAlbum, deezerSearch } from "./deezer";
import { getHiResCoverUrl } from "./itunes";
import { extractPalette } from "./palette";
import { readBuffer, readJson, writeBuffer, writeJson } from "./cache";
import type { SearchResult } from "./types";

export async function searchAlbums(q: string): Promise<SearchResult[]> {
  if (hasSpotifyCredentials()) return spotifySearch(q);
  return deezerSearch(q);
}

/** Cover-Buffer für ein Album — aus dem Datei-Cache oder frisch geladen. */
export async function getCoverBuffer(album: Album): Promise<Buffer> {
  const cached = readBuffer("covers", album.id);
  if (cached) return cached;
  if (album.source === "demo") return generateDemoCover();

  const res = await fetch(album.coverUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cover-Download fehlgeschlagen: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeBuffer("covers", album.id, buf);
  return buf;
}

export async function getAlbum(id: string): Promise<Album> {
  const cached = readJson<Album>("albums", id);
  if (cached) return cached;

  const [source, rest] = id.split(":", 2) as [string, string];
  let album: Album;

  if (source === "demo") {
    album = await buildDemoAlbum();
  } else if (source === "spotify") {
    const raw = await spotifyAlbum(rest);
    album = await finishAlbum(id, "spotify", raw.title, raw.artist, raw);
  } else if (source === "deezer") {
    const raw = await deezerAlbum(rest);
    album = await finishAlbum(id, "deezer", raw.title, raw.artist, raw);
  } else {
    throw new Error(`Unbekannte Quelle: ${source}`);
  }

  writeJson("albums", id, album);
  return album;
}

async function finishAlbum(
  id: string,
  source: "spotify" | "deezer",
  title: string,
  artist: string,
  raw: {
    releaseDate: string;
    label?: string;
    coverUrl: string;
    spotifyUri?: string;
    externalUrl?: string;
    tracks: Track[];
  }
): Promise<Album> {
  // Cover-Upgrade über iTunes (3000 → 2000 → 1400 px)
  let coverUrl = raw.coverUrl;
  const hiRes = await getHiResCoverUrl(artist, title);
  if (hiRes) coverUrl = hiRes;

  // Cover laden, cachen, tatsächliche Maße + Palette bestimmen
  let coverPx = 640;
  let palette = ["#222222", "#555555", "#888888", "#BBBBBB", "#EEEEEE"];
  try {
    const res = await fetch(coverUrl, { cache: "no-store" });
    if (!res.ok && hiRes) {
      // Hi-Res kaputt → zurück auf Original
      coverUrl = raw.coverUrl;
    }
    const finalRes = res.ok ? res : await fetch(raw.coverUrl, { cache: "no-store" });
    const buf = Buffer.from(await finalRes.arrayBuffer());
    writeBuffer("covers", id, buf);
    const meta = await sharp(buf).metadata();
    coverPx = meta.width ?? 640;
    palette = await extractPalette(buf);
  } catch {
    // Album ohne erreichbares Cover: Layout funktioniert trotzdem
  }

  const totalDurationMs = raw.tracks.reduce((s, t) => s + t.durationMs, 0);

  return {
    id,
    source,
    title,
    artist,
    releaseDate: raw.releaseDate,
    label: raw.label,
    coverUrl,
    coverPx,
    spotifyUri: raw.spotifyUri,
    externalUrl: raw.externalUrl,
    explicit: raw.tracks.some((t) => t.explicit),
    tracks: raw.tracks,
    totalDurationMs,
    palette,
  };
}

// ---------------------------------------------------------------------------
// Demo-Album: funktioniert komplett offline (Cover wird lokal generiert).
// ---------------------------------------------------------------------------

const DEMO_TRACKS: Track[] = [
  ["Neon Skyline", 231], ["Afterglow", 198], ["Static Bloom", 254],
  ["Palisades", 187], ["Low Orbit", 276], ["Vapor Trails", 213],
  ["Night Drive", 242], ["Chromatic", 205], ["Half Light", 229],
  ["Signal Fade", 194], ["Aurora Park", 263], ["Slow Motion", 218],
  ["Undertow", 247], ["Last Transmission", 302],
].map(([title, sec], i) => ({
  no: i + 1,
  disc: 1,
  title: title as string,
  durationMs: (sec as number) * 1000,
  explicit: false,
}));

export async function generateDemoCover(): Promise<Buffer> {
  const cached = readBuffer("covers", "demo:starlight");
  if (cached) return cached;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1B1F3B"/>
        <stop offset="0.55" stop-color="#53354A"/>
        <stop offset="1" stop-color="#E84545"/>
      </linearGradient>
      <radialGradient id="s" cx="0.7" cy="0.3" r="0.6">
        <stop offset="0" stop-color="#F5C518" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#F5C518" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1400" height="1400" fill="url(#g)"/>
    <circle cx="980" cy="420" r="500" fill="url(#s)"/>
    <circle cx="980" cy="420" r="150" fill="#F5C518"/>
    <g stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="3">
      ${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${1050 + i * 26}" x2="1400" y2="${960 + i * 30}"/>`).join("")}
    </g>
    <text x="90" y="1280" font-family="sans-serif" font-size="90" font-weight="bold" fill="#FFFFFF" opacity="0.92">STARLIGHT AVENUE</text>
  </svg>`;

  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
  writeBuffer("covers", "demo:starlight", buf);
  return buf;
}

async function buildDemoAlbum(): Promise<Album> {
  const cover = await generateDemoCover();
  const palette = await extractPalette(cover);
  return {
    id: "demo:starlight",
    source: "demo",
    title: "Starlight Avenue",
    artist: "The Midnight Cartographers",
    releaseDate: "2024-06-21",
    label: "Nocturne Records",
    coverUrl: "local:demo",
    coverPx: 1400,
    externalUrl: "https://example.com/starlight-avenue",
    explicit: false,
    tracks: DEMO_TRACKS,
    totalDurationMs: DEMO_TRACKS.reduce((s, t) => s + t.durationMs, 0),
    palette,
  };
}
