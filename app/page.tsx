"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SearchResult } from "@/lib/types";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      setError(null);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        });
        const json = await res.json();
        if (!res.ok) {
          setError(
            json.error === "rate_limited"
              ? `Rate-Limit erreicht — bitte ${json.retryAfter ?? "ein paar"} Sekunden warten.`
              : json.error ?? "Suche fehlgeschlagen."
          );
          setItems([]);
        } else {
          setItems(json.items ?? []);
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") setError("Netzwerkfehler bei der Suche.");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-lg uppercase tracking-[0.2em] mb-1">Posterlab</h1>
      <p className="label mb-8">Album → druckfertiges Poster</p>

      <input
        type="text"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Künstler oder Album suchen …"
        className="!py-3 !text-[14px] mb-6"
      />

      {loading && <p className="label">Suche läuft …</p>}
      {error && <p className="text-[12px] text-red-700 mb-4">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {!q.trim() && (
          <Link
            href={`/editor?album=${encodeURIComponent("demo:starlight")}`}
            className="border border-[#1A1A1A] bg-white hover:bg-[#E4E4E4] transition-colors"
          >
            <div className="aspect-square bg-gradient-to-br from-[#1B1F3B] via-[#53354A] to-[#E84545] flex items-end p-2">
              <span className="text-white text-[10px] uppercase tracking-[0.1em]">
                Demo-Album
              </span>
            </div>
            <div className="p-2">
              <p className="text-[12px] truncate">Starlight Avenue</p>
              <p className="text-[11px] text-[#888] truncate">
                Funktioniert ohne API-Keys
              </p>
            </div>
          </Link>
        )}
        {items.map((a) => (
          <Link
            key={a.id}
            href={`/editor?album=${encodeURIComponent(a.id)}`}
            className="border border-[#1A1A1A] bg-white hover:bg-[#E4E4E4] transition-colors"
          >
            {a.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.thumb} alt="" className="aspect-square w-full object-cover" />
            ) : (
              <div className="aspect-square bg-[#DDD]" />
            )}
            <div className="p-2">
              <p className="text-[12px] truncate">{a.title}</p>
              <p className="text-[11px] text-[#888] truncate">
                {a.artist}
                {a.year ? ` · ${a.year}` : ""}
                {a.totalTracks ? ` · ${a.totalTracks} Tracks` : ""}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {!q.trim() && (
        <p className="label mt-10 leading-relaxed normal-case tracking-normal text-[11px]">
          Tipp: Ohne Spotify-Zugangsdaten in <code>.env.local</code> läuft die Suche
          über Deezer (kein Key nötig). Hochauflösende Cover kommen in beiden Fällen
          über die iTunes Search API.
        </p>
      )}
    </main>
  );
}
