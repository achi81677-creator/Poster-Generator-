// Deezer als Key-freier Fallback für Suche und Metadaten.
import type { SearchResult, Track } from "./types";

export async function deezerSearch(q: string): Promise<SearchResult[]> {
  const res = await fetch(
    `https://api.deezer.com/search/album?q=${encodeURIComponent(q)}&limit=12`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Deezer-Suche fehlgeschlagen: ${res.status}`);
  const data = await res.json();
  return (data.data ?? []).map((a: any) => ({
    id: `deezer:${a.id}`,
    title: a.title,
    artist: a.artist?.name ?? "",
    thumb: a.cover_medium ?? a.cover,
    totalTracks: a.nb_tracks,
  }));
}

export type RawDeezerAlbum = {
  title: string;
  artist: string;
  releaseDate: string;
  label?: string;
  coverUrl: string;
  externalUrl?: string;
  tracks: Track[];
};

export async function deezerAlbum(id: string): Promise<RawDeezerAlbum> {
  const res = await fetch(`https://api.deezer.com/album/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Deezer-Album fehlgeschlagen: ${res.status}`);
  const a = await res.json();
  if (a.error) throw new Error(`Deezer: ${a.error.message ?? "Album nicht gefunden"}`);

  // Tracks separat mit Paginierung holen (Album-Endpoint kappt bei langen Alben)
  const tracks: Track[] = [];
  let index = 0;
  for (;;) {
    const tr = await fetch(
      `https://api.deezer.com/album/${id}/tracks?limit=100&index=${index}`,
      { cache: "no-store" }
    );
    if (!tr.ok) break;
    const page = await tr.json();
    const items: any[] = page.data ?? [];
    for (const t of items) {
      tracks.push({
        no: t.track_position ?? tracks.length + 1,
        disc: t.disk_number ?? 1,
        title: t.title,
        durationMs: (t.duration ?? 0) * 1000,
        explicit: Boolean(t.explicit_lyrics),
      });
    }
    if (!page.next || items.length === 0) break;
    index += items.length;
  }

  return {
    title: a.title,
    artist: a.artist?.name ?? "",
    releaseDate: a.release_date ?? "",
    label: a.label || undefined,
    coverUrl: a.cover_xl ?? a.cover_big ?? a.cover ?? "",
    externalUrl: a.link,
    tracks,
  };
}
