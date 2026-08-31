// Hochauflösendes Cover über die iTunes Search API (kein Key nötig).

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, "") // Klammerzusätze (Deluxe, Remastered …)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similar(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Sucht das Album bei iTunes und liefert die höchste verfügbare Cover-URL.
 * Fallback-Kette 3000 → 2000 → 1400 px; bei Misserfolg `null`.
 */
export async function getHiResCoverUrl(
  artist: string,
  album: string
): Promise<string | null> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
      `${artist} ${album}`
    )}&entity=album&limit=5`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();

    // Ähnlichkeitscheck — sonst bekommt man bei häufigen Titeln die Coverband
    const match = (json.results ?? []).find(
      (r: any) =>
        similar(r.collectionName ?? "", album) && similar(r.artistName ?? "", artist)
    );
    const art: string | undefined = match?.artworkUrl100;
    if (!art) return null;

    for (const size of ["3000x3000", "2000x2000", "1400x1400"]) {
      const candidate = art.replace("100x100bb", `${size}bb`);
      try {
        const head = await fetch(candidate, { method: "HEAD", cache: "no-store" });
        if (head.ok) return candidate;
      } catch {
        // nächste Stufe probieren
      }
    }
    return null;
  } catch {
    return null;
  }
}
