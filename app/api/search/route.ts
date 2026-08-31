import { NextResponse } from "next/server";
import { searchAlbums } from "@/lib/album";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ items: [] });

  try {
    const items = await searchAlbums(q);
    return NextResponse.json({ items });
  } catch (e: any) {
    if (e?.message === "rate_limited") {
      return NextResponse.json(
        { error: "rate_limited", retryAfter: e.retryAfter },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: e?.message ?? "Suche fehlgeschlagen" },
      { status: 502 }
    );
  }
}
