"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Album, FontPair, LayoutId, PosterConfig, StyleId } from "@/lib/types";
import { defaultConfig } from "@/lib/types";
import { CUSTOM_MAX_MM, CUSTOM_MIN_MM, FORMATS, coverShare, effectivePpi, mmToPx } from "@/lib/formats";
import { STYLE_LABELS } from "@/lib/styles";

const LAYOUTS: { id: LayoutId; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "minimal", label: "Minimal" },
  { id: "vinyl", label: "Vinyl" },
  { id: "gradient", label: "Gradient" },
  { id: "square", label: "Square" },
];

const FONT_PAIRS: { id: FontPair | "auto"; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "modern", label: "Modern" },
  { id: "serif", label: "Serif" },
  { id: "condensed", label: "Condensed" },
  { id: "mono", label: "Mono" },
];

const SHOW_LABELS: Record<keyof PosterConfig["show"], string> = {
  cover: "Cover",
  palette: "Farbpalette",
  trackNumbers: "Tracknummern",
  trackDurations: "Laufzeiten",
  releaseDate: "Release-Datum",
  totalRuntime: "Gesamtlaufzeit",
  label: "Label",
  waveform: "Waveform",
  scanCode: "Scan-Code",
  parentalAdvisory: "Parental-Advisory",
};

function encodeConfig(c: PosterConfig): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(c))));
}

function decodeConfig(s: string): PosterConfig | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s)))) as PosterConfig;
  } catch {
    return null;
  }
}

function Editor() {
  const params = useSearchParams();
  const albumId = params.get("album") ?? "demo:starlight";

  const [album, setAlbum] = useState<Album | null>(null);
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [config, setConfig] = useState<PosterConfig>(() => {
    const fromUrl = params.get("c");
    const decoded = fromUrl ? decodeConfig(fromUrl) : null;
    if (decoded && decoded.albumId === albumId) return decoded;
    return defaultConfig(albumId);
  });

  // Undo/Redo
  const historyRef = useRef<{ stack: PosterConfig[]; index: number }>({
    stack: [config],
    index: 0,
  });
  const skipHistoryRef = useRef(false);

  const update = useCallback((patch: Partial<PosterConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      const h = historyRef.current;
      const cur = h.stack[h.index];
      if (JSON.stringify(cur) === JSON.stringify(config)) return;
      h.stack = [...h.stack.slice(0, h.index + 1), config].slice(-50);
      h.index = h.stack.length - 1;
    }, 500);
    return () => clearTimeout(t);
  }, [config]);

  const undo = () => {
    const h = historyRef.current;
    if (h.index > 0) {
      h.index -= 1;
      skipHistoryRef.current = true;
      setConfig(h.stack[h.index]);
    }
  };
  const redo = () => {
    const h = historyRef.current;
    if (h.index < h.stack.length - 1) {
      h.index += 1;
      skipHistoryRef.current = true;
      setConfig(h.stack[h.index]);
    }
  };

  // Album laden
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/album/${encodeURIComponent(albumId)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setAlbumError(json.error ?? "Album konnte nicht geladen werden.");
        else {
          setAlbum(json.album);
          // Advisory automatisch vorschlagen, wenn ein Track explizit ist
          if (json.album.explicit) {
            setConfig((prev) =>
              prev.show.parentalAdvisory
                ? prev
                : { ...prev, show: { ...prev.show, parentalAdvisory: true } }
            );
          }
        }
      } catch {
        if (!cancelled) setAlbumError("Netzwerkfehler beim Laden des Albums.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [albumId]);

  // Config in die URL schreiben (teilbar, Zurück-Button funktioniert)
  useEffect(() => {
    const t = setTimeout(() => {
      const url = `/editor?album=${encodeURIComponent(albumId)}&c=${encodeConfig(config)}`;
      window.history.replaceState(null, "", url);
    }, 400);
    return () => clearTimeout(t);
  }, [config, albumId]);

  // Vorschau (debounced, immer über dieselbe Render-Pipeline wie der Export)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!album) return;
    const t = setTimeout(async () => {
      previewAbort.current?.abort();
      const ac = new AbortController();
      previewAbort.current = ac;
      setPreviewLoading(true);
      try {
        const res = await fetch(`/api/render?mode=svg`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal: ac.signal,
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setPreviewError(json.error ?? "Vorschau fehlgeschlagen.");
          return;
        }
        const blob = await res.blob();
        setPreviewError(null);
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      } catch (e: any) {
        if (e?.name !== "AbortError") setPreviewError("Vorschau fehlgeschlagen.");
      } finally {
        setPreviewLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [config, album]);

  // Abgeleitete Werte (nie gespeichert, immer gerechnet)
  const derived = useMemo(() => {
    const slugMm = config.cropMarks ? 5 : 0;
    const totalW = config.format.widthMm + 2 * (config.bleedMm + slugMm);
    const totalH = config.format.heightMm + 2 * (config.bleedMm + slugMm);
    const pxW = mmToPx(totalW, config.dpi);
    const pxH = mmToPx(totalH, config.dpi);
    const mp = (pxW * pxH) / 1e6;
    const estMb = mp * 1.4;

    const ratio = config.format.heightMm / config.format.widthMm;
    const effLayout =
      config.layoutId === "classic" && ratio < 1.12 ? "square" : config.layoutId;
    const share = coverShare(effLayout);
    const ppi = album
      ? effectivePpi(album.coverPx, config.format.widthMm * share)
      : 0;
    return { pxW, pxH, mp, estMb, ppi, share, ratio };
  }, [config, album]);

  const ampel =
    derived.share === 0
      ? null
      : derived.ppi >= 250
        ? { color: "#2E7D32", label: "grün" }
        : derived.ppi >= 150
          ? { color: "#C58F00", label: "gelb" }
          : { color: "#C62828", label: "rot" };

  // Export
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const doExport = async (kind: "png" | "pdf") => {
    setExporting(kind);
    setExportError(null);
    try {
      const res = await fetch(kind === "png" ? "/api/render?mode=png" : "/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setExportError(json.error ?? "Export fehlgeschlagen.");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="(.+?)"/);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = m?.[1] ?? `poster.${kind}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      setExportError("Export fehlgeschlagen (Netzwerk oder Speicher).");
    } finally {
      setExporting(null);
    }
  };

  // Zoom (reine CSS-Sache, wirkt nie auf den Export)
  const [zoom, setZoom] = useState(100);

  const setFormat = (id: string) => {
    const f = FORMATS.find((x) => x.id === id);
    if (!f) return;
    update({ format: { id: f.id, widthMm: f.widthMm, heightMm: f.heightMm } });
  };

  const [unit, setUnit] = useState<"mm" | "cm" | "in">("mm");
  const toUnit = (mm: number) =>
    unit === "mm" ? mm : unit === "cm" ? mm / 10 : mm / 25.4;
  const fromUnit = (v: number) =>
    unit === "mm" ? v : unit === "cm" ? v * 10 : v * 25.4;
  const clampMm = (v: number) =>
    Math.min(CUSTOM_MAX_MM, Math.max(CUSTOM_MIN_MM, v));

  if (albumError) {
    return (
      <main className="max-w-xl mx-auto px-6 py-16">
        <p className="text-[13px] text-red-700 mb-4">{albumError}</p>
        <Link href="/" className="btn btn-secondary inline-block">
          Zurück zur Suche
        </Link>
      </main>
    );
  }

  return (
    <main className="h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-[#1A1A1A] bg-white px-4 py-2 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="label hover:text-black shrink-0">
            ← Suche
          </Link>
          <span className="text-[12px] truncate">
            {album ? `${album.artist} — ${album.title}` : "Lade Album …"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary !py-1 !px-2" onClick={undo} title="Rückgängig">
            ↺
          </button>
          <button className="btn btn-secondary !py-1 !px-2" onClick={redo} title="Wiederherstellen">
            ↻
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* Arbeitsfläche */}
        <section className="flex-1 min-h-[45vh] flex flex-col bg-[#DCDCDC]">
          <div className="flex-1 overflow-auto flex p-6">
            <div className="m-auto flex">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Poster-Vorschau"
                  onDoubleClick={() => setZoom(100)}
                  style={{
                    height: `calc((100vh - 160px) * ${zoom / 100})`,
                    boxShadow: "0 4px 30px rgba(0,0,0,0.25)",
                  }}
                />
              ) : (
                <div className="label animate-pulse">
                  {previewError ?? "Vorschau wird gerendert …"}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-[#1A1A1A] bg-white px-4 py-2 shrink-0">
            <span className="label">Zoom</span>
            <input
              type="range"
              min={25}
              max={200}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="max-w-[240px]"
            />
            <span className="text-[11px] w-12">{zoom} %</span>
            <button className="btn btn-secondary !py-0.5 !px-2 !text-[10px]" onClick={() => setZoom(100)}>
              Einpassen
            </button>
            {previewLoading && <span className="label animate-pulse">rendert …</span>}
            {previewError && previewUrl && (
              <span className="text-[11px] text-red-700">{previewError}</span>
            )}
          </div>
        </section>

        {/* Einstellungen */}
        <aside className="w-full lg:w-[340px] shrink-0 border-l border-[#1A1A1A] bg-white overflow-y-auto">
          <div className="p-4 flex flex-col gap-5">
            <div>
              <p className="label mb-2">Stil</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(STYLE_LABELS) as StyleId[]).map((id) => (
                  <div
                    key={id}
                    className={`tile ${config.styleId === id ? "tile-active" : ""}`}
                    onClick={() => update({ styleId: id })}
                  >
                    {STYLE_LABELS[id]}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="label mb-2">Layout</p>
              <div className="grid grid-cols-2 gap-1.5">
                {LAYOUTS.map((l) => (
                  <div
                    key={l.id}
                    className={`tile ${config.layoutId === l.id ? "tile-active" : ""}`}
                    onClick={() => update({ layoutId: l.id })}
                  >
                    {l.label}
                  </div>
                ))}
              </div>
              {derived.ratio < 1.12 && config.layoutId === "classic" && (
                <p className="text-[10px] text-[#888] mt-1.5">
                  Breites/quadratisches Format: Classic wechselt automatisch aufs
                  Square-Layout.
                </p>
              )}
            </div>

            <div>
              <p className="label mb-2">Typografie</p>
              <div className="grid grid-cols-5 gap-1.5">
                {FONT_PAIRS.map((f) => (
                  <div
                    key={f.id}
                    className={`tile !px-1 ${config.fontPair === f.id ? "tile-active" : ""}`}
                    onClick={() => update({ fontPair: f.id })}
                  >
                    {f.label}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="label mb-2">Format</p>
              <select value={config.format.id} onChange={(e) => setFormat(e.target.value)}>
                {FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              {config.format.id === "custom" && (
                <div className="flex gap-1.5 mt-2 items-center">
                  <input
                    type="number"
                    value={Number(toUnit(config.format.widthMm).toFixed(1))}
                    min={toUnit(CUSTOM_MIN_MM)}
                    max={toUnit(CUSTOM_MAX_MM)}
                    onChange={(e) =>
                      update({
                        format: {
                          ...config.format,
                          widthMm: clampMm(fromUnit(Number(e.target.value))),
                        },
                      })
                    }
                  />
                  <span className="text-[11px]">×</span>
                  <input
                    type="number"
                    value={Number(toUnit(config.format.heightMm).toFixed(1))}
                    min={toUnit(CUSTOM_MIN_MM)}
                    max={toUnit(CUSTOM_MAX_MM)}
                    onChange={(e) =>
                      update({
                        format: {
                          ...config.format,
                          heightMm: clampMm(fromUnit(Number(e.target.value))),
                        },
                      })
                    }
                  />
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as typeof unit)}
                    className="!w-20"
                  >
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="in">in</option>
                  </select>
                </div>
              )}
              {(derived.ratio > 3 || derived.ratio < 1 / 3) && (
                <p className="text-[10px] text-red-700 mt-1.5">
                  Extremes Seitenverhältnis — das Layout wird darunter leiden.
                </p>
              )}
            </div>

            <div>
              <p className="label mb-2">
                Innenabstand · {Math.round(config.paddingScale * 100)} %
              </p>
              <input
                type="range"
                min={50}
                max={200}
                value={Math.round(config.paddingScale * 100)}
                onChange={(e) => update({ paddingScale: Number(e.target.value) / 100 })}
              />
            </div>

            <div>
              <p className="label mb-2">Elemente</p>
              <div className="flex flex-col gap-1.5">
                {(Object.keys(SHOW_LABELS) as (keyof PosterConfig["show"])[]).map(
                  (key) => (
                    <label key={key} className="flex items-center gap-2 text-[12px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.show[key]}
                        onChange={(e) =>
                          update({ show: { ...config.show, [key]: e.target.checked } })
                        }
                      />
                      {SHOW_LABELS[key]}
                    </label>
                  )
                )}
              </div>
              {config.show.scanCode && (
                <p className="text-[10px] text-[#888] mt-1.5">
                  {album?.spotifyUri
                    ? "Echter Spotify-Code — mit der Spotify-App scanbar, führt zum Album."
                    : "Dekoratives Muster (kein Spotify-Album) — sieht gleich aus, ist aber nicht scanbar."}
                </p>
              )}
              {config.show.parentalAdvisory && (
                <p className="text-[10px] text-[#888] mt-1.5">
                  Prüfe, ob dein Cover das Logo schon enthält — viele haben es
                  eingebrannt.
                </p>
              )}
            </div>

            <div>
              <p className="label mb-2">Tracklist</p>
              <div className="flex gap-1.5 items-center">
                <select
                  value={config.trackColumns}
                  onChange={(e) =>
                    update({ trackColumns: Number(e.target.value) as 0 | 1 | 2 | 3 })
                  }
                >
                  <option value={0}>Spalten: Auto</option>
                  <option value={1}>1 Spalte</option>
                  <option value={2}>2 Spalten</option>
                  <option value={3}>3 Spalten</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-[12px] cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={config.stripFeatures}
                  onChange={(e) => update({ stripFeatures: e.target.checked })}
                />
                „(feat. …)“ aus Titeln entfernen
              </label>
            </div>

            <div>
              <p className="label mb-2">Eigener Titel / Künstler</p>
              <input
                type="text"
                placeholder={album?.title ?? "Titel"}
                value={config.customTitle ?? ""}
                onChange={(e) => update({ customTitle: e.target.value || undefined })}
              />
              <input
                type="text"
                className="mt-1.5"
                placeholder={album?.artist ?? "Künstler"}
                value={config.customArtist ?? ""}
                onChange={(e) => update({ customArtist: e.target.value || undefined })}
              />
            </div>

            <div>
              <p className="label mb-2">Auflösung</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([150, 300, 600] as const).map((dpi) => (
                  <div
                    key={dpi}
                    className={`tile ${config.dpi === dpi ? "tile-active" : ""}`}
                    onClick={() => update({ dpi })}
                  >
                    {dpi}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#888] mt-1.5">
                300 DPI genügt für den Fotodruck. 600 DPI schärft nur die Schrift —
                verwende dafür besser den PDF-Export.
              </p>
            </div>

            <div>
              <p className="label mb-2">Druck</p>
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.bleedMm > 0}
                  onChange={(e) => update({ bleedMm: e.target.checked ? 3 : 0 })}
                />
                Beschnittzugabe (3 mm)
              </label>
              <label className="flex items-center gap-2 text-[12px] cursor-pointer mt-1.5">
                <input
                  type="checkbox"
                  checked={config.cropMarks}
                  onChange={(e) => update({ cropMarks: e.target.checked })}
                />
                Schnittmarken
              </label>
            </div>

            {/* Live-Anzeige */}
            <div className="border border-[#1A1A1A] p-3 text-[11px] leading-relaxed">
              <p>
                BREITE: {config.format.widthMm.toFixed(1)} mm · HÖHE:{" "}
                {config.format.heightMm.toFixed(1)} mm · DPI: {config.dpi}
              </p>
              <p>
                → {derived.pxW} × {derived.pxH} px · ca. {derived.mp.toFixed(1)} MP ·
                PNG ≈ {derived.estMb < 1 ? "<1" : Math.round(derived.estMb)} MB
              </p>
              {ampel && album && (
                <p className="flex items-center gap-1.5 mt-1">
                  Cover: {derived.ppi} PPI
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: ampel.color }}
                  />
                  {derived.ppi < 150 && (
                    <span className="text-red-700">— kleineres Format wählen</span>
                  )}
                </p>
              )}
              {derived.mp > 100 && (
                <p className="text-[#C58F00] mt-1">
                  ⚠ Über 100 MP: Der PNG-Export dauert 30–60 s und braucht mehrere GB
                  RAM. Für Großformate ist PDF der bessere Weg.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5 pb-6">
              <button
                className="btn btn-primary"
                disabled={!album || exporting !== null}
                onClick={() => doExport("png")}
              >
                {exporting === "png" ? "Rendert PNG …" : "PNG herunterladen"}
              </button>
              <button
                className="btn btn-secondary"
                disabled={!album || exporting !== null}
                onClick={() => doExport("pdf")}
              >
                {exporting === "pdf" ? "Rendert PDF …" : "PDF herunterladen"}
              </button>
              {exportError && (
                <p className="text-[11px] text-red-700">{exportError}</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function EditorPage() {
  return (
    <Suspense
      fallback={<main className="p-10 label">Editor wird geladen …</main>}
    >
      <Editor />
    </Suspense>
  );
}
