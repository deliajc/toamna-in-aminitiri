import { NextResponse } from "next/server";
import { burstLimit, checkTicket, clientIp, db, hashIp, verifyUpload, type MediaRow } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let id = "";
  let ticket = "";
  try {
    const b = await req.json();
    id = String(b.id || "");
    ticket = String(b.ticket || "");
  } catch {}
  if (!/^[0-9a-f-]{36}$/i.test(id) || !checkTicket(id, ticket)) return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });

  const ipHash = hashIp(await clientIp());
  if (!burstLimit("c:" + ipHash, 60, 10_000))
    return NextResponse.json({ error: "Prea multe cereri." }, { status: 429 });

  const { data: row } = await db()
    .from("media")
    .select("id,path,kind,mime,size,status,created_at")
    .eq("id", id)
    .maybeSingle<MediaRow>();
  if (!row) return NextResponse.json({ error: "Încărcare necunoscută." }, { status: 404 });
  if (row.status !== "pending") return NextResponse.json({ status: row.status });

  const status = await verifyUpload(row);
  if (status === "missing") return NextResponse.json({ error: "Fișierul nu a ajuns pe server." }, { status: 409 });
  if (status === "rejected")
    return NextResponse.json({ error: "Fișierul nu pare a fi o fotografie sau un videoclip valid." }, { status: 422 });
  return NextResponse.json({ status });
}
