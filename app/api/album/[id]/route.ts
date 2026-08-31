import { NextResponse } from "next/server";
import { getAlbum } from "@/lib/album";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const album = await getAlbum(decodeURIComponent(params.id));
    return NextResponse.json({ album });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Album konnte nicht geladen werden" },
      { status: 502 }
    );
  }
}
