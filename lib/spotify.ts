// Läuft NUR auf dem Server.
import type { SearchResult, Track } from "./types";

let cached: { token: string; expiresAt: number } | null = null;

export function hasSpotifyCredentials(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

export async function getSpotifyToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Spotify-Token fehlgeschlagen: ${res.status}`);

  const data = await res.json();
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // 60 s Puffer
  };
  return cached.token;
}

export async function spotifySearch(q: string): Promise<SearchResult[]> {
  const token = await getSpotifyToken();
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=12`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );

  if (res.status === 429) {
    const wait = res.headers.get("Retry-After") ?? "5";
    throw Object.assign(new Error("rate_limited"), { retryAfter: wait });
  }
  if (!res.ok) throw new Error(`Spotify-Suche fehlgeschlagen: ${res.status}`);

  const data = await res.json();
  return (data.albums?.items ?? []).map((a: any) => ({
    id: `spotify:${a.id}`,
    title: a.name,
    artist: a.artists.map((x: any) => x.name).join(", "),
    year: a.release_date?.slice(0, 4),
    thumb: a.images?.[1]?.url ?? a.images?.[0]?.url,
    totalTracks: a.total_tracks,
  }));
}

async function fetchAllTracks(albumId: string, token: string): Promise<any[]> {
  const tracks: any[] = [];
  let url: string | null = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;

  // `next` beachten — sonst fehlen bei Deluxe-Editions Songs
  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Spotify-Tracks fehlgeschlagen: ${res.status}`);
    const page = await res.json();
    tracks.push(...page.items);
    url = page.next;
  }
  return tracks;
}

export type RawSpotifyAlbum = {
  title: string;
  artist: string;
  releaseDate: string;
  label?: string;
  coverUrl: string;
  spotifyUri: string;
  externalUrl?: string;
  tracks: Track[];
};

export async function spotifyAlbum(id: string): Promise<RawSpotifyAlbum> {
  const token = await getSpotifyToken();
  const res = await fetch(`https://api.spotify.com/v1/albums/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify-Album fehlgeschlagen: ${res.status}`);
  const a = await res.json();

  let items: any[] = a.tracks?.items ?? [];
  if (a.tracks?.next) items = await fetchAllTracks(id, token);

  const tracks: Track[] = items.map((t: any) => ({
    no: t.track_number,
    disc: t.disc_number ?? 1,
    title: t.name,
    durationMs: t.duration_ms,
    explicit: Boolean(t.explicit),
  }));

  return {
    title: a.name,
    artist: a.artists.map((x: any) => x.name).join(", "),
    releaseDate: a.release_date ?? "",
    label: a.label || undefined,
    coverUrl: a.images?.[0]?.url ?? "",
    spotifyUri: a.uri,
    externalUrl: a.external_urls?.spotify,
    tracks,
  };
}
