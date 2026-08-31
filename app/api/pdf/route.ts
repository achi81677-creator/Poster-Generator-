import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getAlbum } from "@/lib/album";
import { renderPdf } from "@/lib/pdf";
import type { PosterConfig } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "").slice(0, 120);
}

export async function POST(req: Request) {
  let config: PosterConfig;
  try {
    config = (await req.json()) as PosterConfig;
  } catch {
    return NextResponse.json({ error: "Ungültige Konfiguration" }, { status: 400 });
  }

  try {
    const album = await getAlbum(config.albumId);
    const pdf = await renderPdf(album, config);
    const filename = safeFilename(
      `${album.artist} - ${album.title} ${config.format.id}.pdf`
    );

    const outDir = process.env.POSTER_OUTPUT_DIR;
    if (outDir) {
      try {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, filename), pdf);
      } catch {
        // Ordner nicht beschreibbar → Download reicht
      }
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "PDF-Export fehlgeschlagen" },
      { status: 500 }
    );
  }
}
