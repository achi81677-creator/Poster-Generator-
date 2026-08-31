import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getAlbum } from "@/lib/album";
import { renderPng, renderSvg } from "@/lib/render";
import type { PosterConfig } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "").slice(0, 120);
}

export async function POST(req: Request) {
  const mode = new URL(req.url).searchParams.get("mode") ?? "svg";
  let config: PosterConfig;
  try {
    config = (await req.json()) as PosterConfig;
  } catch {
    return NextResponse.json({ error: "Ungültige Konfiguration" }, { status: 400 });
  }

  try {
    const album = await getAlbum(config.albumId);

    if (mode === "svg") {
      const { svg } = await renderSvg(album, config, { preview: true });
      return new Response(svg, {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
      });
    }

    const { png, pxWidth, pxHeight } = await renderPng(album, config);
    const filename = safeFilename(
      `${album.artist} - ${album.title} ${config.format.id} ${config.dpi}dpi.png`
    );

    // Optional zusätzlich direkt in den konfigurierten Poster-Ordner schreiben
    const outDir = process.env.POSTER_OUTPUT_DIR;
    if (outDir) {
      try {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, filename), png);
      } catch {
        // Ordner nicht beschreibbar → Download reicht
      }
    }

    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Pixel-Size": `${pxWidth}x${pxHeight}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Rendering fehlgeschlagen" },
      { status: 500 }
    );
  }
}
